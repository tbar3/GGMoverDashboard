import { query, queryOne } from '@/lib/db';

/**
 * Certifications data layer. A skill is certifiable via practice REQUIREMENTS (logged
 * milestones) and crew-vote SURVEYS (multi-question). Admin reviews and grants.
 */

export interface Requirement {
  id: string;
  skill_id: string;
  label: string;
  target_count: number;
  sort_order: number;
}

export interface RequirementProgress extends Requirement {
  logged: number;
  pct: number; // 0-100, capped
  met: boolean;
}

export interface CandidateProgress {
  requirements: RequirementProgress[];
  overallPct: number;
  allMet: boolean;
}

export interface SurveySummary {
  id: string;
  skill_id: string;
  title: string;
  is_active: boolean;
  questionCount: number;
}

export interface SurveyQuestion {
  id: string;
  survey_id: string;
  prompt: string;
  type: 'rating' | 'yes_no' | 'text';
  sort_order: number;
}

export async function getSkillsForCerts(): Promise<
  { id: string; name: string; requirementCount: number; surveyCount: number }[]
> {
  return query(
    `SELECT s.id, s.name,
            (SELECT COUNT(*)::int FROM certification_requirements r WHERE r.skill_id = s.id) AS "requirementCount",
            (SELECT COUNT(*)::int FROM certification_surveys v WHERE v.skill_id = s.id) AS "surveyCount"
       FROM skills s WHERE s.active = TRUE ORDER BY s.sort_order, s.name`
  );
}

export async function getRequirements(skillId: string): Promise<Requirement[]> {
  return query<Requirement>(
    `SELECT id, skill_id, label, target_count, sort_order FROM certification_requirements
      WHERE skill_id = $1 ORDER BY sort_order, label`,
    [skillId]
  );
}

/** Per-requirement progress for one candidate on one skill. */
export async function getCandidateProgress(employeeId: string, skillId: string): Promise<CandidateProgress> {
  const [reqs, counts] = await Promise.all([
    getRequirements(skillId),
    query<{ requirement_id: string; n: number }>(
      `SELECT requirement_id, COUNT(*)::int AS n FROM practice_entries
        WHERE employee_id = $1 AND skill_id = $2 GROUP BY requirement_id`,
      [employeeId, skillId]
    ),
  ]);
  const byReq = new Map(counts.map((c) => [c.requirement_id, c.n]));

  const requirements: RequirementProgress[] = reqs.map((r) => {
    const logged = byReq.get(r.id) ?? 0;
    const target = Math.max(1, r.target_count);
    return {
      ...r,
      logged,
      pct: Math.min(100, Math.round((logged / target) * 100)),
      met: logged >= r.target_count,
    };
  });

  const totalTarget = requirements.reduce((s, r) => s + Math.max(1, r.target_count), 0);
  const totalLogged = requirements.reduce((s, r) => s + Math.min(r.logged, r.target_count), 0);
  const overallPct = totalTarget > 0 ? Math.round((totalLogged / totalTarget) * 100) : 0;
  const allMet = requirements.length > 0 && requirements.every((r) => r.met);

  return { requirements, overallPct, allMet };
}

/** Active employees who don't yet hold the skill, with their overall progress. */
export async function getSkillCandidates(
  skillId: string
): Promise<{ id: string; name: string; overallPct: number; allMet: boolean }[]> {
  const employees = await query<{ id: string; name: string }>(
    `SELECT e.id, e.name FROM employees e
      WHERE e.is_active = TRUE
        AND NOT EXISTS (SELECT 1 FROM employee_skills es WHERE es.employee_id = e.id AND es.skill_id = $1)
      ORDER BY e.name`,
    [skillId]
  );
  const results = await Promise.all(
    employees.map(async (e) => {
      const p = await getCandidateProgress(e.id, skillId);
      return { id: e.id, name: e.name, overallPct: p.overallPct, allMet: p.allMet };
    })
  );
  return results;
}

export async function getSurveys(skillId: string): Promise<SurveySummary[]> {
  return query<SurveySummary>(
    `SELECT v.id, v.skill_id, v.title, v.is_active,
            (SELECT COUNT(*)::int FROM survey_questions q WHERE q.survey_id = v.id) AS "questionCount"
       FROM certification_surveys v WHERE v.skill_id = $1 ORDER BY v.created_at`,
    [skillId]
  );
}

export async function getSurvey(surveyId: string): Promise<
  { id: string; skill_id: string; skill_name: string; title: string; is_active: boolean } | null
> {
  return queryOne(
    `SELECT v.id, v.skill_id, s.name AS skill_name, v.title, v.is_active
       FROM certification_surveys v JOIN skills s ON s.id = v.skill_id WHERE v.id = $1`,
    [surveyId]
  );
}

export async function getSurveyQuestions(surveyId: string): Promise<SurveyQuestion[]> {
  return query<SurveyQuestion>(
    `SELECT id, survey_id, prompt, type, sort_order FROM survey_questions
      WHERE survey_id = $1 ORDER BY sort_order, prompt`,
    [surveyId]
  );
}

export interface QuestionResult {
  question: SurveyQuestion;
  ratingAvg: number | null;
  ratingCount: number;
  yesCount: number;
  noCount: number;
  comments: string[];
}
export interface SurveyResults {
  responseCount: number;
  questions: QuestionResult[];
}

/** Aggregated survey results for a candidate. */
export async function getSurveyResults(surveyId: string, candidateId: string): Promise<SurveyResults> {
  const [questions, responses, answers] = await Promise.all([
    getSurveyQuestions(surveyId),
    query<{ id: string }>(
      'SELECT id FROM survey_responses WHERE survey_id = $1 AND candidate_id = $2',
      [surveyId, candidateId]
    ),
    query<{ question_id: string; rating: number | null; bool_value: boolean | null; text_value: string | null }>(
      `SELECT a.question_id, a.rating, a.bool_value, a.text_value
         FROM survey_answers a
         JOIN survey_responses r ON r.id = a.response_id
        WHERE r.survey_id = $1 AND r.candidate_id = $2`,
      [surveyId, candidateId]
    ),
  ]);

  const qResults: QuestionResult[] = questions.map((q) => {
    const mine = answers.filter((a) => a.question_id === q.id);
    const ratings = mine.map((a) => a.rating).filter((r): r is number => r != null);
    const yesCount = mine.filter((a) => a.bool_value === true).length;
    const noCount = mine.filter((a) => a.bool_value === false).length;
    const comments = mine.map((a) => a.text_value).filter((t): t is string => !!t && t.trim() !== '');
    return {
      question: q,
      ratingAvg: ratings.length ? Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10 : null,
      ratingCount: ratings.length,
      yesCount,
      noCount,
      comments,
    };
  });

  return { responseCount: responses.length, questions: qResults };
}

/** Whether a given voter has already responded for this candidate. */
export async function hasVoted(surveyId: string, candidateId: string, voterId: string): Promise<boolean> {
  const row = await queryOne(
    'SELECT 1 AS x FROM survey_responses WHERE survey_id = $1 AND candidate_id = $2 AND voter_id = $3',
    [surveyId, candidateId, voterId]
  );
  return row != null;
}

/** Crew-facing: skills the employee is working toward (doesn't hold yet) that have requirements. */
export async function getEmployeeCertProgress(
  employeeId: string
): Promise<{ skillId: string; skillName: string; progress: CandidateProgress }[]> {
  const skills = await query<{ id: string; name: string }>(
    `SELECT DISTINCT s.id, s.name FROM skills s
       JOIN certification_requirements r ON r.skill_id = s.id
      WHERE s.active = TRUE
        AND NOT EXISTS (SELECT 1 FROM employee_skills es WHERE es.employee_id = $1 AND es.skill_id = s.id)
      ORDER BY s.name`,
    [employeeId]
  );
  return Promise.all(
    skills.map(async (s) => ({
      skillId: s.id,
      skillName: s.name,
      progress: await getCandidateProgress(employeeId, s.id),
    }))
  );
}
