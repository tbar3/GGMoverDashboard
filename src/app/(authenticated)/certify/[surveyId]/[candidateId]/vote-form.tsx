'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import type { SurveyQuestion } from '@/lib/certifications';
import { submitSurveyResponse, type SurveyAnswerInput } from '@/lib/certification-actions';

interface AnswerState {
  rating?: number;
  boolValue?: boolean;
  textValue?: string;
}

export function VoteForm({
  surveyId,
  candidateId,
  questions,
}: {
  surveyId: string;
  candidateId: string;
  questions: SurveyQuestion[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [done, setDone] = useState(false);

  function set(qid: string, patch: AnswerState) {
    setAnswers((prev) => ({ ...prev, [qid]: { ...prev[qid], ...patch } }));
  }

  function submit() {
    // Require an answer on every non-comment question.
    for (const q of questions) {
      const a = answers[q.id];
      if (q.type === 'rating' && !a?.rating) return toast.error(`Rate: ${q.prompt}`);
      if (q.type === 'yes_no' && a?.boolValue == null) return toast.error(`Answer: ${q.prompt}`);
    }
    const payload: SurveyAnswerInput[] = questions.map((q) => ({
      questionId: q.id,
      rating: answers[q.id]?.rating ?? null,
      boolValue: answers[q.id]?.boolValue ?? null,
      textValue: answers[q.id]?.textValue ?? null,
    }));
    start(async () => {
      const res = await submitSurveyResponse({ surveyId, candidateId, answers: payload });
      if (res.ok) {
        setDone(true);
        toast.success('Vote recorded — thank you!');
        router.refresh();
      } else toast.error(res.error ?? 'Could not submit');
    });
  }

  if (done) {
    return (
      <div className="rounded-lg border border-green-300 bg-green-50 dark:bg-green-950/30 p-6 text-center">
        <p className="font-medium text-green-800 dark:text-green-300">Your vote was recorded. Thank you!</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {questions.map((q) => (
        <div key={q.id} className="space-y-2">
          <p className="font-medium">{q.prompt}</p>
          {q.type === 'rating' && (
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <Button
                  key={n}
                  type="button"
                  variant={answers[q.id]?.rating === n ? 'default' : 'outline'}
                  className="h-10 w-10"
                  onClick={() => set(q.id, { rating: n })}
                >
                  {n}
                </Button>
              ))}
            </div>
          )}
          {q.type === 'yes_no' && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant={answers[q.id]?.boolValue === true ? 'default' : 'outline'}
                onClick={() => set(q.id, { boolValue: true })}
              >
                Yes
              </Button>
              <Button
                type="button"
                variant={answers[q.id]?.boolValue === false ? 'default' : 'outline'}
                onClick={() => set(q.id, { boolValue: false })}
              >
                No
              </Button>
            </div>
          )}
          {q.type === 'text' && (
            <Input
              value={answers[q.id]?.textValue ?? ''}
              onChange={(e) => set(q.id, { textValue: e.target.value })}
              placeholder="Your comment (optional)"
            />
          )}
        </div>
      ))}
      <Button onClick={submit} disabled={pending} className="w-full" size="lg">
        {pending ? 'Submitting…' : 'Submit vote'}
      </Button>
    </div>
  );
}
