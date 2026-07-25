import Link from 'next/link';
import {
  getSkillsForCerts,
  getRequirements,
  getSurveys,
  getSurveyQuestions,
  getSkillCandidates,
} from '@/lib/certifications';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Award, ChevronRight } from 'lucide-react';
import { RequirementsEditor, SurveysEditor } from './cert-editors';

export const dynamic = 'force-dynamic';

export default async function CertificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ skill?: string }>;
}) {
  const sp = await searchParams;
  const skills = await getSkillsForCerts();
  const selectedId = sp.skill && skills.some((s) => s.id === sp.skill) ? sp.skill : skills[0]?.id;
  const selected = skills.find((s) => s.id === selectedId);

  let requirements: Awaited<ReturnType<typeof getRequirements>> = [];
  let surveys: { id: string; title: string; is_active: boolean; questions: Awaited<ReturnType<typeof getSurveyQuestions>> }[] = [];
  let candidates: Awaited<ReturnType<typeof getSkillCandidates>> = [];
  if (selectedId) {
    const [reqs, surveySummaries, cands] = await Promise.all([
      getRequirements(selectedId),
      getSurveys(selectedId),
      getSkillCandidates(selectedId),
    ]);
    requirements = reqs;
    candidates = cands;
    surveys = await Promise.all(
      surveySummaries.map(async (s) => ({
        id: s.id,
        title: s.title,
        is_active: s.is_active,
        questions: await getSurveyQuestions(s.id),
      }))
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Award className="h-6 w-6" /> Certifications
        </h1>
        <p className="text-muted-foreground mt-1">
          Define practice requirements and crew-vote surveys per skill, then track candidates to certification.
        </p>
      </div>

      {skills.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No skills yet. Add skills under{' '}
            <Link href="/admin/skills" className="underline">
              Pay Scale &amp; Skills
            </Link>{' '}
            first — each skill can then be certified here.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Skill selector */}
          <div className="flex flex-wrap gap-2">
            {skills.map((s) => (
              <Link key={s.id} href={`/admin/certifications?skill=${s.id}`}>
                <Button variant={s.id === selectedId ? 'default' : 'outline'} size="sm">
                  {s.name}
                  {s.requirementCount + s.surveyCount > 0 && (
                    <span className="ml-1.5 text-xs opacity-70">
                      ({s.requirementCount}r · {s.surveyCount}s)
                    </span>
                  )}
                </Button>
              </Link>
            ))}
          </div>

          {selected && (
            <>
              <RequirementsEditor skillId={selected.id} requirements={requirements} />
              <SurveysEditor skillId={selected.id} surveys={surveys} />

              {/* Candidates */}
              <Card>
                <CardHeader>
                  <CardTitle>Candidates for {selected.name}</CardTitle>
                  <CardDescription>
                    Active crew who don&apos;t hold this skill yet. Open one to log practice, run the crew
                    vote, and grant the certification.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {candidates.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Everyone active already holds this skill.</p>
                  ) : (
                    <ul className="divide-y">
                      {candidates.map((c) => (
                        <li key={c.id}>
                          <Link
                            href={`/admin/certifications/${selected.id}/${c.id}`}
                            className="flex items-center gap-3 py-2.5 hover:bg-muted/50 rounded px-2 -mx-2"
                          >
                            <span className="font-medium w-40 shrink-0">{c.name}</span>
                            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full bg-primary"
                                style={{ width: `${c.overallPct}%` }}
                              />
                            </div>
                            <span className="text-sm text-muted-foreground w-12 text-right">{c.overallPct}%</span>
                            {c.allMet && <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Ready</Badge>}
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
