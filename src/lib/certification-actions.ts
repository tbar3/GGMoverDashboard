'use server';

import { revalidatePath } from 'next/cache';
import { query, queryOne, withTransaction } from '@/lib/db';
import { requireBackOffice, requireEmployee } from '@/lib/auth';

type Result = { ok: boolean; error?: string };

function toInt(raw: unknown, fallback = 1): number {
  const n = parseInt(String(raw ?? '').replace(/[^0-9-]/g, ''), 10);
  return isNaN(n) ? fallback : n;
}

// ── Requirements ──────────────────────────────────────────────

export async function addRequirement(skillId: string, label: string, target: string): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  if (!label.trim()) return { ok: false, error: 'Add a label' };
  const t = Math.max(1, toInt(target, 1));
  const max = await queryOne<{ m: number }>(
    'SELECT COALESCE(MAX(sort_order), 0) AS m FROM certification_requirements WHERE skill_id = $1',
    [skillId]
  );
  await query(
    'INSERT INTO certification_requirements (skill_id, label, target_count, sort_order) VALUES ($1, $2, $3, $4)',
    [skillId, label.trim(), t, (max?.m ?? 0) + 1]
  );
  revalidatePath('/admin/certifications');
  return { ok: true };
}

export async function updateRequirement(id: string, label: string, target: string): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  if (!label.trim()) return { ok: false, error: 'Add a label' };
  await query('UPDATE certification_requirements SET label = $2, target_count = $3 WHERE id = $1', [
    id,
    label.trim(),
    Math.max(1, toInt(target, 1)),
  ]);
  revalidatePath('/admin/certifications');
  return { ok: true };
}

export async function deleteRequirement(id: string): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  await query('DELETE FROM certification_requirements WHERE id = $1', [id]);
  revalidatePath('/admin/certifications');
  return { ok: true };
}

// ── Practice log ──────────────────────────────────────────────

export async function logPractice(input: {
  employeeId: string;
  skillId: string;
  requirementId: string;
  note?: string;
}): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  if (!input.requirementId) return { ok: false, error: 'Pick a requirement' };
  await query(
    `INSERT INTO practice_entries (employee_id, skill_id, requirement_id, note, logged_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [input.employeeId, input.skillId, input.requirementId, input.note?.trim() || null, guard.employee.id]
  );
  revalidatePath('/admin/certifications');
  return { ok: true };
}

export async function undoPractice(input: {
  employeeId: string;
  requirementId: string;
}): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  // Remove the most recent entry for this candidate + requirement.
  await query(
    `DELETE FROM practice_entries WHERE id = (
       SELECT id FROM practice_entries WHERE employee_id = $1 AND requirement_id = $2
        ORDER BY created_at DESC LIMIT 1)`,
    [input.employeeId, input.requirementId]
  );
  revalidatePath('/admin/certifications');
  return { ok: true };
}

// ── Surveys + questions ───────────────────────────────────────

export async function addSurvey(skillId: string, title: string): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  if (!title.trim()) return { ok: false, error: 'Add a survey title' };
  await query(
    'INSERT INTO certification_surveys (skill_id, title, created_by) VALUES ($1, $2, $3)',
    [skillId, title.trim(), guard.employee.id]
  );
  revalidatePath('/admin/certifications');
  return { ok: true };
}

export async function updateSurvey(id: string, title: string, active: boolean): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  if (!title.trim()) return { ok: false, error: 'Add a survey title' };
  await query('UPDATE certification_surveys SET title = $2, is_active = $3 WHERE id = $1', [
    id,
    title.trim(),
    active,
  ]);
  revalidatePath('/admin/certifications');
  return { ok: true };
}

export async function deleteSurvey(id: string): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  await query('DELETE FROM certification_surveys WHERE id = $1', [id]);
  revalidatePath('/admin/certifications');
  return { ok: true };
}

export async function addQuestion(surveyId: string, prompt: string, type: string): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  if (!prompt.trim()) return { ok: false, error: 'Add a question' };
  if (!['rating', 'yes_no', 'text'].includes(type)) return { ok: false, error: 'Pick a question type' };
  const max = await queryOne<{ m: number }>(
    'SELECT COALESCE(MAX(sort_order), 0) AS m FROM survey_questions WHERE survey_id = $1',
    [surveyId]
  );
  await query(
    'INSERT INTO survey_questions (survey_id, prompt, type, sort_order) VALUES ($1, $2, $3, $4)',
    [surveyId, prompt.trim(), type, (max?.m ?? 0) + 1]
  );
  revalidatePath('/admin/certifications');
  return { ok: true };
}

export async function deleteQuestion(id: string): Promise<Result> {
  const guard = await requireBackOffice();
  if (!guard.ok) return { ok: false, error: 'Back office access required' };
  await query('DELETE FROM survey_questions WHERE id = $1', [id]);
  revalidatePath('/admin/certifications');
  return { ok: true };
}

// ── Crew vote submission ──────────────────────────────────────

export interface SurveyAnswerInput {
  questionId: string;
  rating?: number | null;
  boolValue?: boolean | null;
  textValue?: string | null;
}

export async function submitSurveyResponse(input: {
  surveyId: string;
  candidateId: string;
  answers: SurveyAnswerInput[];
}): Promise<Result> {
  const guard = await requireEmployee();
  if (!guard.ok) return { ok: false, error: 'Sign in to vote' };
  const voterId = guard.employee.id;
  if (voterId === input.candidateId) return { ok: false, error: "You can't vote on your own certification" };

  const already = await queryOne(
    'SELECT 1 AS x FROM survey_responses WHERE survey_id = $1 AND candidate_id = $2 AND voter_id = $3',
    [input.surveyId, input.candidateId, voterId]
  );
  if (already) return { ok: false, error: 'You already voted for this crew member' };

  try {
    await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO survey_responses (survey_id, candidate_id, voter_id) VALUES ($1, $2, $3) RETURNING id`,
        [input.surveyId, input.candidateId, voterId]
      );
      const responseId = rows[0].id;
      for (const a of input.answers) {
        await client.query(
          `INSERT INTO survey_answers (response_id, question_id, rating, bool_value, text_value)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            responseId,
            a.questionId,
            a.rating ?? null,
            a.boolValue ?? null,
            a.textValue?.trim() || null,
          ]
        );
      }
    });
  } catch {
    return { ok: false, error: 'Could not record your vote' };
  }
  revalidatePath('/admin/certifications');
  return { ok: true };
}
