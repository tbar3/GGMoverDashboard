import { queryOne } from '@/lib/db';
import { getCurrentEmployee } from '@/lib/auth';
import { getSurvey, getSurveyQuestions, hasVoted } from '@/lib/certifications';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Award } from 'lucide-react';
import { VoteForm } from './vote-form';

export const dynamic = 'force-dynamic';

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="p-6 max-w-lg mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{body}</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function CertifyVotePage({
  params,
}: {
  params: Promise<{ surveyId: string; candidateId: string }>;
}) {
  const { surveyId, candidateId } = await params;
  const [survey, candidate, me] = await Promise.all([
    getSurvey(surveyId),
    queryOne<{ id: string; name: string }>('SELECT id, name FROM employees WHERE id = $1', [candidateId]),
    getCurrentEmployee(),
  ]);

  if (!survey || !candidate) return <Notice title="Survey not found" body="This certification survey link is invalid." />;
  if (!survey.is_active) return <Notice title="Voting closed" body="This survey is no longer active." />;
  if (!me) return <Notice title="Employee profile not found" body="Ask an admin to set up your account, then scan again." />;
  if (me.id === candidate.id)
    return <Notice title="That's you!" body="You can't vote on your own certification." />;

  const voted = await hasVoted(surveyId, candidate.id, me.id);
  if (voted)
    return <Notice title="Already voted" body={`You've already submitted your vote for ${candidate.name}. Thank you!`} />;

  const questions = await getSurveyQuestions(surveyId);

  return (
    <div className="p-6 max-w-lg mx-auto space-y-6">
      <div className="text-center space-y-1">
        <Award className="h-8 w-8 mx-auto text-primary" />
        <h1 className="text-2xl font-bold text-foreground">{survey.title}</h1>
        <p className="text-muted-foreground">
          Certifying <span className="font-medium text-foreground">{candidate.name}</span> for{' '}
          <span className="font-medium text-foreground">{survey.skill_name}</span>
        </p>
      </div>
      {questions.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            This survey has no questions yet.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardDescription>Your honest input helps decide certifications.</CardDescription>
          </CardHeader>
          <CardContent>
            <VoteForm surveyId={surveyId} candidateId={candidate.id} questions={questions} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
