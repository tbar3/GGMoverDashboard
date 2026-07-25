import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { queryOne } from '@/lib/db';
import {
  getCandidateProgress,
  getSurveys,
  getSurveyQuestions,
  getSurveyResults,
} from '@/lib/certifications';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, QrCode } from 'lucide-react';
import { PracticeControls, GrantButton } from './candidate-detail';

export const dynamic = 'force-dynamic';

const QTYPE_LABEL: Record<string, string> = { rating: 'Rating 1–5', yes_no: 'Yes / No', text: 'Comment' };

export default async function CandidateCertPage({
  params,
}: {
  params: Promise<{ skillId: string; candidateId: string }>;
}) {
  const { skillId, candidateId } = await params;
  const [skill, candidate] = await Promise.all([
    queryOne<{ id: string; name: string }>('SELECT id, name FROM skills WHERE id = $1', [skillId]),
    queryOne<{ id: string; name: string }>('SELECT id, name FROM employees WHERE id = $1', [candidateId]),
  ]);
  if (!skill || !candidate) notFound();

  const [progress, surveySummaries] = await Promise.all([
    getCandidateProgress(candidateId, skillId),
    getSurveys(skillId),
  ]);
  const activeSurveys = surveySummaries.filter((s) => s.is_active);

  // Build a QR (to the crew vote page) + aggregated results for each active survey.
  const h = await headers();
  const host = h.get('host') ?? 'goodguys-dashboard.vercel.app';
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const base = `${proto}://${host}`;

  const surveys = await Promise.all(
    activeSurveys.map(async (s) => {
      const voteUrl = `${base}/certify/${s.id}/${candidateId}`;
      const [questions, results, qr] = await Promise.all([
        getSurveyQuestions(s.id),
        getSurveyResults(s.id, candidateId),
        QRCode.toDataURL(voteUrl, { width: 220, margin: 1 }),
      ]);
      return { ...s, voteUrl, questions, results, qr };
    })
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/admin/certifications?skill=${skillId}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">{candidate.name}</h1>
          <p className="text-muted-foreground mt-1">
            Certification: <span className="font-medium">{skill.name}</span> · {progress.overallPct}% of practice
            {progress.allMet ? ' · all requirements met' : ''}
          </p>
        </div>
        <GrantButton employeeId={candidateId} skillId={skillId} skillName={skill.name} candidateName={candidate.name} />
      </div>

      {/* Practice progress */}
      <Card>
        <CardHeader>
          <CardTitle>Practice progress</CardTitle>
          <CardDescription>Log each time this person practices the skill on a job.</CardDescription>
        </CardHeader>
        <CardContent>
          <PracticeControls employeeId={candidateId} skillId={skillId} requirements={progress.requirements} />
        </CardContent>
      </Card>

      {/* Surveys: QR + results */}
      {surveys.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No active survey for this skill. Add one on the{' '}
            <Link href={`/admin/certifications?skill=${skillId}`} className="underline">
              certification page
            </Link>
            .
          </CardContent>
        </Card>
      ) : (
        surveys.map((s) => (
          <Card key={s.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <QrCode className="h-5 w-5" /> {s.title}
              </CardTitle>
              <CardDescription>
                {s.results.responseCount} vote{s.results.responseCount === 1 ? '' : 's'} so far. Show this QR on
                screen — crew scan it, sign in, and vote.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row gap-6">
                <div className="shrink-0 text-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.qr} alt="Survey QR code" className="rounded-lg border bg-white p-2" width={220} height={220} />
                  <p className="text-xs text-muted-foreground mt-2 break-all max-w-[220px]">{s.voteUrl}</p>
                </div>
                <div className="flex-1 space-y-4">
                  {s.questions.length === 0 && (
                    <p className="text-sm text-muted-foreground">This survey has no questions yet.</p>
                  )}
                  {s.results.questions.map((qr) => (
                    <div key={qr.question.id} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm flex-1">{qr.question.prompt}</span>
                        <Badge variant="outline" className="text-xs">{QTYPE_LABEL[qr.question.type]}</Badge>
                      </div>
                      {qr.question.type === 'rating' && (
                        <p className="text-sm text-muted-foreground">
                          {qr.ratingAvg != null ? `Avg ${qr.ratingAvg} / 5 (${qr.ratingCount})` : 'No ratings yet'}
                        </p>
                      )}
                      {qr.question.type === 'yes_no' && (
                        <p className="text-sm text-muted-foreground">
                          {qr.yesCount} yes · {qr.noCount} no
                        </p>
                      )}
                      {qr.question.type === 'text' &&
                        (qr.comments.length ? (
                          <ul className="text-sm text-muted-foreground list-disc ml-5">
                            {qr.comments.map((c, i) => (
                              <li key={i}>{c}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-muted-foreground">No comments yet</p>
                        ))}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
