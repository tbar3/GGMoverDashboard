'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  MessagesSquare,
  Check,
  Trash2,
  ChevronDown,
  ChevronRight,
  Undo2,
  Clock,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import {
  FEEDBACK_SOURCE_LABELS,
  FEEDBACK_AUDIENCE_LABELS,
  type FeedbackItem,
  type FeedbackAudience,
  type DiscussionJob,
  type CrewOption,
} from '@/lib/morning-meeting-shared';
import {
  addFeedback,
  closeFeedback,
  reopenFeedback,
  deleteFeedback,
} from '@/lib/morning-meeting-actions';
import { jobLabel } from './morning-meeting-discussions';

const textareaClass =
  'w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ' +
  'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

const selectClass = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm';

type Run = (
  fn: () => Promise<{ ok: boolean; error?: string }>,
  okMessage: string,
  onSuccess?: () => void,
  undo?: { label: string; fn: () => Promise<{ ok: boolean; error?: string }> }
) => void;

/** A two-or-three-way choice as buttons — faster than a dropdown with a room waiting. */
function Toggle<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-input p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded px-3 py-1.5 text-sm transition-colors ${
            value === o.value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const AUDIENCE_OPTIONS: { value: FeedbackAudience; label: string }[] = [
  { value: 'crew', label: 'For the crew' },
  { value: 'back_office', label: 'For the back office' },
];

/**
 * Feedback — the fifth thing walked at the 7:15.
 *
 * Left: feedback queued during the day — a customer's comment on a job, something
 * the office heard — that lands on the next meeting so it actually gets said.
 * Right: the crew's own ideas, logged live, for how the crew or the office could
 * do better. Both stay up until someone closes them.
 */
export function FeedbackSection({
  today,
  feedback,
  jobs,
  crew,
  pending,
  run,
}: {
  today: string;
  feedback: FeedbackItem[];
  jobs: DiscussionJob[];
  crew: CrewOption[];
  pending: boolean;
  run: Run;
}) {
  const open = feedback.filter((f) => f.status === 'open');
  const queued = open.filter((f) => f.source !== 'crew');
  const toMention = queued.filter((f) => f.meeting_date <= today);
  const upcoming = queued.filter((f) => f.meeting_date > today);
  const crewOpen = open.filter((f) => f.source === 'crew');
  const closed = feedback.filter((f) => f.status === 'closed');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessagesSquare className="h-5 w-5 text-primary" />
          Feedback
        </CardTitle>
        <CardDescription>
          Customer and office feedback logged during the day shows up at the next meeting. Crew
          ideas get logged live. Everything stays up until you close it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <QueuedFeedback
            today={today}
            toMention={toMention}
            upcoming={upcoming}
            jobs={jobs}
            crew={crew}
            pending={pending}
            run={run}
          />
          <CrewFeedback items={crewOpen} crew={crew} pending={pending} run={run} />
        </div>

        <ClosedFeedback items={closed} pending={pending} run={run} />
      </CardContent>
    </Card>
  );
}

// ── Queued: customer / back office → next meeting ───────────────────────────

function QueuedFeedback({
  today,
  toMention,
  upcoming,
  jobs,
  crew,
  pending,
  run,
}: {
  today: string;
  toMention: FeedbackItem[];
  upcoming: FeedbackItem[];
  jobs: DiscussionJob[];
  crew: CrewOption[];
  pending: boolean;
  run: Run;
}) {
  const [body, setBody] = useState('');
  const [source, setSource] = useState<'customer' | 'back_office'>('customer');
  const [audience, setAudience] = useState<FeedbackAudience>('crew');
  const [jobId, setJobId] = useState('');
  const [jobSearch, setJobSearch] = useState('');
  const [employeeId, setEmployeeId] = useState('');

  const jobById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);
  const crewById = useMemo(() => new Map(crew.map((c) => [c.id, c])), [crew]);

  const q = jobSearch.trim().toLowerCase();
  const filteredJobs = q ? jobs.filter((j) => jobLabel(j).toLowerCase().includes(q)) : jobs;

  // With a job picked, "who's it about" narrows to that job's crew.
  const people = useMemo(() => {
    const job = jobId ? jobById.get(jobId) : null;
    if (!job) return crew;
    const onJob = job.crew_ids.map((id) => crewById.get(id)).filter((c): c is CrewOption => !!c);
    return onJob.length > 0 ? onJob : crew;
  }, [jobId, jobById, crewById, crew]);

  function submit() {
    if (!body.trim()) return;
    const job = jobId ? jobById.get(jobId) : null;
    const person = employeeId ? crewById.get(employeeId) : null;
    run(
      () =>
        addFeedback({
          body,
          source,
          audience,
          jobId: jobId || undefined,
          jobLabel: job ? jobLabel(job) : undefined,
          employeeId: employeeId || undefined,
          employeeName: person?.name,
        }),
      // Before 7:45 AM it lands on this morning's meeting, not the next one.
      new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }) < '07:45'
        ? 'Saved for this morning’s meeting'
        : 'Saved for the next meeting',
      () => {
        setBody('');
        setJobId('');
        setJobSearch('');
        setEmployeeId('');
      }
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-semibold">To mention</h3>
        <p className="text-xs text-muted-foreground">
          From customers or the office. Logged after 7:45 AM, it shows up at the next meeting.
        </p>
      </div>

      {toMention.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing queued for this meeting.</p>
      ) : (
        <ul className="space-y-2">
          {toMention.map((item) => (
            <FeedbackRow
              key={item.id}
              item={item}
              today={today}
              closeLabel="Mentioned"
              pending={pending}
              run={run}
            />
          ))}
        </ul>
      )}

      {upcoming.length > 0 && (
        <div className="space-y-2">
          <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            Queued for the next meeting ({upcoming.length})
          </p>
          <ul className="space-y-2 opacity-75">
            {upcoming.map((item) => (
              <FeedbackRow
                key={item.id}
                item={item}
                today={today}
                closeLabel="Mentioned"
                pending={pending}
                run={run}
              />
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
        <div className="flex flex-wrap gap-2">
          <Toggle
            label="Where it came from"
            value={source}
            onChange={setSource}
            options={[
              { value: 'customer', label: 'Customer' },
              { value: 'back_office', label: 'Back office' },
            ]}
          />
          <Toggle
            label="Who it's for"
            value={audience}
            onChange={setAudience}
            options={AUDIENCE_OPTIONS}
          />
        </div>
        <textarea
          className={textareaClass}
          placeholder={
            source === 'customer'
              ? 'e.g. Mrs. Henderson called — loved how careful the crew was with the piano.'
              : 'e.g. Heard from the leasing office at Midtown Lofts that our truck blocked the fire lane.'
          }
          value={body}
          onChange={(e) => setBody(e.target.value)}
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
              onChange={(e) => {
                setJobId(e.target.value);
                setEmployeeId('');
              }}
              aria-label="Related job"
            >
              <option value="">No job</option>
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
          <select
            className={`${selectClass} self-end`}
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            aria-label="Who it's about"
          >
            <option value="">About nobody in particular</option>
            {people.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.role ? ` · ${c.role}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={submit} disabled={pending || !body.trim()}>
            Save for next meeting
          </Button>
          <span className="text-xs text-muted-foreground">⌘/Ctrl + Enter</span>
        </div>
      </div>
    </div>
  );
}

// ── Live: crew ideas for the crew / the back office ─────────────────────────

function CrewFeedback({
  items,
  crew,
  pending,
  run,
}: {
  items: FeedbackItem[];
  crew: CrewOption[];
  pending: boolean;
  run: Run;
}) {
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<FeedbackAudience>('back_office');
  const [employeeId, setEmployeeId] = useState('');

  const crewById = useMemo(() => new Map(crew.map((c) => [c.id, c])), [crew]);
  const forCrew = items.filter((f) => f.audience === 'crew');
  const forOffice = items.filter((f) => f.audience === 'back_office');

  function submit() {
    if (!body.trim()) return;
    const person = employeeId ? crewById.get(employeeId) : null;
    // Keep the audience: a run of office ideas usually comes in a row.
    run(
      () =>
        addFeedback({
          body,
          source: 'crew',
          audience,
          employeeId: employeeId || undefined,
          employeeName: person?.name,
        }),
      'Crew feedback logged',
      () => {
        setBody('');
        setEmployeeId('');
      }
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-semibold">From the crew</h3>
        <p className="text-xs text-muted-foreground">
          Ask the room how we can do better. Stays up until it&apos;s been addressed.
        </p>
      </div>

      <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
        <Toggle
          label="Who the idea is for"
          value={audience}
          onChange={setAudience}
          options={AUDIENCE_OPTIONS}
        />
        <textarea
          className={textareaClass}
          placeholder={
            audience === 'back_office'
              ? 'e.g. Send the job sheet the night before so leads can plan the load.'
              : 'e.g. Do a quick wrap-count before leaving the warehouse.'
          }
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={`${selectClass} sm:w-[220px]`}
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            aria-label="Who raised it"
          >
            <option value="">Raised by — not named</option>
            {crew.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Button onClick={submit} disabled={pending || !body.trim()}>
            Log it
          </Button>
          <span className="text-xs text-muted-foreground">⌘/Ctrl + Enter</span>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No open crew feedback.</p>
      ) : (
        [
          { label: 'For the back office', list: forOffice },
          { label: 'For the crew', list: forCrew },
        ]
          .filter((g) => g.list.length > 0)
          .map((g) => (
            <div key={g.label} className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                {g.label} ({g.list.length})
              </p>
              <ul className="space-y-2">
                {g.list.map((item) => (
                  <FeedbackRow
                    key={item.id}
                    item={item}
                    closeLabel="Addressed"
                    hideAudience
                    pending={pending}
                    run={run}
                  />
                ))}
              </ul>
            </div>
          ))
      )}
    </div>
  );
}

// ── Shared row + closed history ─────────────────────────────────────────────

function FeedbackRow({
  item,
  today,
  closeLabel,
  hideAudience,
  pending,
  run,
}: {
  item: FeedbackItem;
  today?: string;
  closeLabel: string;
  hideAudience?: boolean;
  pending: boolean;
  run: Run;
}) {
  const carried = today && item.meeting_date < today;
  return (
    <li className="rounded-lg border border-border p-3 text-sm">
      <p className="whitespace-pre-wrap">{item.body}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant={item.source === 'customer' ? 'default' : 'secondary'} className="text-[10px]">
          {FEEDBACK_SOURCE_LABELS[item.source]}
        </Badge>
        {!hideAudience && (
          <Badge variant="outline" className="text-[10px]">
            {FEEDBACK_AUDIENCE_LABELS[item.audience]}
          </Badge>
        )}
        {item.employee_name && <span className="font-medium text-foreground">{item.employee_name}</span>}
        {item.job_label && <span>{item.job_label}</span>}
        <span>
          {item.author_name} · {formatDate(item.created_at, 'MMM d')}
        </span>
        {carried && (
          <Badge variant="outline" className="text-[10px]">
            Carried over
          </Badge>
        )}
        <span className="flex-1" />
        <button
          type="button"
          className="inline-flex items-center gap-1 hover:text-foreground"
          disabled={pending}
          onClick={() =>
            run(() => closeFeedback(item.id), `Marked ${closeLabel.toLowerCase()}`, undefined, {
              label: 'Undo',
              fn: () => reopenFeedback(item.id),
            })
          }
        >
          <Check className="h-3.5 w-3.5" />
          {closeLabel}
        </button>
        <button
          type="button"
          className="hover:text-destructive"
          disabled={pending}
          onClick={() => run(() => deleteFeedback(item.id), 'Feedback removed')}
          title="Delete this feedback"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}

function ClosedFeedback({
  items,
  pending,
  run,
}: {
  items: FeedbackItem[];
  pending: boolean;
  run: Run;
}) {
  const [show, setShow] = useState(false);
  if (items.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        onClick={() => setShow((v) => !v)}
      >
        {show ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        Recently closed ({items.length})
      </button>
      {show && (
        <ul className="mt-2 space-y-1.5 border-l-2 border-border pl-3">
          {items.map((item) => (
            <li key={item.id} className="text-sm">
              <span className="text-xs text-muted-foreground">
                {FEEDBACK_SOURCE_LABELS[item.source]} · {FEEDBACK_AUDIENCE_LABELS[item.audience]} ·{' '}
              </span>
              {item.body}
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {item.closed_at && formatDate(item.closed_at, 'MMM d')}
                  {item.closed_by_name ? ` · closed by ${item.closed_by_name}` : ''}
                </span>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 hover:text-foreground"
                  disabled={pending}
                  onClick={() => run(() => reopenFeedback(item.id), 'Back on the board')}
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
  );
}
