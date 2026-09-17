'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { HelpCircle, Check, Trash2, ChevronDown, ChevronRight, Undo2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import type {
  DiscussionPoint,
  DiscussionJob,
  CrewOption,
} from '@/lib/morning-meeting-shared';
import {
  addDiscussion,
  answerDiscussion,
  reopenDiscussion,
  deleteDiscussion,
} from '@/lib/morning-meeting-actions';

const textareaClass =
  'w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ' +
  'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

const selectClass =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm';

type Run = (
  fn: () => Promise<{ ok: boolean; error?: string }>,
  okMessage: string,
  onSuccess?: () => void,
  undo?: { label: string; fn: () => Promise<{ ok: boolean; error?: string }> }
) => void;

/** Dropdown text. The date is what makes two same-customer jobs tellable apart. */
export function jobLabel(job: DiscussionJob): string {
  return `${formatDate(job.date, 'MMM d, yyyy')} · ${job.customer_name ?? 'Customer'}${
    job.job_number ? ` · #${job.job_number}` : ''
  }`;
}

/**
 * Discussion Points and Questions — the fourth thing walked at the 7:15.
 *
 * Something looks wrong on a job when the office goes to close it out, and the
 * only person who can explain it is standing in the warehouse at 7:15 tomorrow.
 * This is where that question waits, and where the answer gets written down.
 */
export function DiscussionPoints({
  discussions,
  jobs,
  crew,
  pending,
  run,
}: {
  discussions: DiscussionPoint[];
  jobs: DiscussionJob[];
  crew: CrewOption[];
  pending: boolean;
  run: Run;
}) {
  const [question, setQuestion] = useState('');
  const [jobId, setJobId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [jobSearch, setJobSearch] = useState('');
  const [showAnswered, setShowAnswered] = useState(false);

  const open = discussions.filter((d) => d.status === 'open');
  const answered = discussions.filter((d) => d.status === 'answered');

  const jobById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);
  const crewById = useMemo(() => new Map(crew.map((c) => [c.id, c])), [crew]);

  const q = jobSearch.trim().toLowerCase();
  const filteredJobs = q
    ? jobs.filter((j) => jobLabel(j).toLowerCase().includes(q))
    : jobs;

  /**
   * Who the question can be addressed to.
   *
   * With a job selected this is that job's crew — there is no per-job lead stored
   * anywhere, so the picker asks rather than guessing. With no job, it is the
   * whole active roster, because "the gate code at Collier Rd" still needs an owner.
   */
  const addressees = useMemo(() => {
    const job = jobId ? jobById.get(jobId) : null;
    if (!job) return crew;
    const onJob = job.crew_ids.map((id) => crewById.get(id)).filter((c): c is CrewOption => !!c);
    return onJob.length > 0 ? onJob : crew;
  }, [jobId, jobById, crewById, crew]);

  /** Pick the job, and preselect its lead when there is exactly one. Two leads or
   *  none leaves it blank rather than quietly choosing the wrong person. */
  function selectJob(id: string) {
    setJobId(id);
    const job = id ? jobById.get(id) : null;
    if (!job) {
      setEmployeeId('');
      return;
    }
    const leads = job.crew_ids
      .map((cid) => crewById.get(cid))
      .filter((c): c is CrewOption => !!c && c.role === 'lead');
    setEmployeeId(leads.length === 1 ? leads[0].id : '');
  }

  function submit() {
    if (!question.trim()) return;
    const job = jobId ? jobById.get(jobId) : null;
    const person = employeeId ? crewById.get(employeeId) : null;
    // Clear only once the write lands — this gets typed in a hurry and losing it
    // to a failed action is worse than a stale box.
    run(
      () =>
        addDiscussion({
          question,
          jobId: jobId || undefined,
          jobLabel: job ? jobLabel(job) : undefined,
          employeeId: employeeId || undefined,
          employeeName: person?.name,
        }),
      'Question logged',
      () => {
        setQuestion('');
        setJobId('');
        setEmployeeId('');
        setJobSearch('');
      }
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-primary" />
          Discussion points and questions
        </CardTitle>
        <CardDescription>
          Something off on a job you went to close out? Log it here and raise it with the lead in
          the morning. It stays up until you record what they said.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <textarea
            className={textareaClass}
            placeholder="e.g. Henderson move ran 3 hours over the estimate with no note — what happened?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
            }}
          />

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Input
                placeholder="Search jobs by customer, date or #…"
                value={jobSearch}
                onChange={(e) => setJobSearch(e.target.value)}
              />
              <select
                className={selectClass}
                value={jobId}
                onChange={(e) => selectJob(e.target.value)}
                aria-label="Related job"
              >
                <option value="">No job — general question</option>
                {/* Keep the chosen job visible even if the search would hide it. */}
                {jobId && !filteredJobs.some((j) => j.id === jobId) && jobById.get(jobId) && (
                  <option value={jobId}>{jobLabel(jobById.get(jobId)!)}</option>
                )}
                {filteredJobs.slice(0, 200).map((job) => (
                  <option key={job.id} value={job.id}>
                    {jobLabel(job)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <select
                className={selectClass}
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                aria-label="Who the question is for"
              >
                <option value="">Nobody in particular</option>
                {addressees.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.role ? ` · ${c.role}` : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {jobId
                  ? 'That job’s crew. The lead is preselected when there’s exactly one.'
                  : 'Pick a job to narrow this to its crew.'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={submit} disabled={pending || !question.trim()}>
              Log question
            </Button>
            <span className="text-xs text-muted-foreground">⌘/Ctrl + Enter</span>
          </div>
        </div>

        {open.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing outstanding to raise.</p>
        ) : (
          <ul className="space-y-2">
            {open.map((point) => (
              <OpenPoint key={point.id} point={point} pending={pending} run={run} />
            ))}
          </ul>
        )}

        {answered.length > 0 && (
          <div>
            <button
              type="button"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              onClick={() => setShowAnswered((v) => !v)}
            >
              {showAnswered ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              Recently answered ({answered.length})
            </button>
            {showAnswered && (
              <ul className="mt-2 space-y-2 border-l-2 border-border pl-3">
                {answered.map((point) => (
                  <li key={point.id} className="text-sm">
                    <p className="font-medium">{point.question}</p>
                    <p className="text-muted-foreground">&ldquo;{point.answer}&rdquo;</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        {point.employee_name ? `${point.employee_name} · ` : ''}
                        {point.answered_at && formatDate(point.answered_at, 'MMM d')}
                        {point.answered_by_name ? ` · recorded by ${point.answered_by_name}` : ''}
                      </span>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        disabled={pending}
                        onClick={() =>
                          run(() => reopenDiscussion(point.id), 'Back on the board')
                        }
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                        Reopen
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** One open question, with the box for what the lead actually said. */
function OpenPoint({
  point,
  pending,
  run,
}: {
  point: DiscussionPoint;
  pending: boolean;
  run: Run;
}) {
  const [answering, setAnswering] = useState(false);
  const [answer, setAnswer] = useState('');

  function save() {
    if (!answer.trim()) return;
    run(
      () => answerDiscussion({ id: point.id, answer }),
      'Answer recorded',
      () => {
        setAnswer('');
        setAnswering(false);
      },
      { label: 'Undo', fn: () => reopenDiscussion(point.id) }
    );
  }

  return (
    <li className="rounded-lg border border-border p-3 text-sm">
      <p className="whitespace-pre-wrap font-medium">{point.question}</p>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {point.employee_name && (
          <Badge variant="secondary" className="text-[10px]">
            {point.employee_name}
          </Badge>
        )}
        {point.job_label && <span>{point.job_label}</span>}
        <span>
          {point.author_name} · {formatDate(point.created_at, 'MMM d')}
        </span>
        <span className="flex-1" />
        {!answering && (
          <button
            type="button"
            className="inline-flex items-center gap-1 hover:text-foreground"
            onClick={() => setAnswering(true)}
          >
            <Check className="h-3.5 w-3.5" />
            Record the answer
          </button>
        )}
        <button
          type="button"
          className="hover:text-destructive"
          disabled={pending}
          onClick={() => run(() => deleteDiscussion(point.id), 'Question removed')}
          title="Delete this question"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {answering && (
        <div className="mt-2 space-y-2">
          <textarea
            className={textareaClass}
            placeholder="What did they say? e.g. Customer added a storage unit on site — not on the job sheet."
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') save();
            }}
            autoFocus
          />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={save} disabled={pending || !answer.trim()}>
              Save answer
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setAnswering(false);
                setAnswer('');
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
