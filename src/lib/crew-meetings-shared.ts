// Client-safe types and labels for crew meetings. No DB import, so the board can
// use these without pulling in pg.

export type MeetingType =
  | 'quarterly_review'
  | 'feedback_positive'
  | 'feedback_negative'
  | 'catch_up';

export const MEETING_TYPES: {
  value: MeetingType;
  label: string;
  hint: string;
}[] = [
  {
    value: 'quarterly_review',
    label: 'Quarterly review',
    hint: 'The sit-down that closes out this quarter for them',
  },
  {
    value: 'feedback_positive',
    label: 'Positive feedback',
    hint: 'Good work worth saying out loud, and on the record',
  },
  {
    value: 'feedback_negative',
    label: 'Negative feedback',
    hint: 'A problem worth naming before it becomes a pattern',
  },
  { value: 'catch_up', label: 'Catch-up', hint: 'No agenda — just check in with them' },
];

export function meetingTypeLabel(type: string): string {
  return MEETING_TYPES.find((t) => t.value === type)?.label ?? type;
}

/** '2026-Q3' → 'Q3 2026'. Stored the sortable way, shown the readable way. */
export function quarterLabel(quarter: string): string {
  const [year, q] = quarter.split('-');
  return `${q} ${year}`;
}

export interface CrewMeeting {
  id: string;
  employee_id: string;
  employee_name: string;
  type: MeetingType;
  /** Set only on quarterly reviews. */
  quarter: string | null;
  scheduled_for: string;
  /** 'HH:MM' wall-clock, or null if no time was set. */
  scheduled_time: string | null;
  completed_at: string | null;
  notes: string | null;
  created_by_name: string;
  completed_by_name: string | null;
  created_at: string;
}

/** A crew member with no quarterly review booked for the current quarter. */
export interface DueCrewMember {
  employee_id: string;
  employee_name: string;
  role: string;
  quarter: string;
  /** 'overdue' once the quarter is nearly out. */
  status: 'due' | 'overdue';
  /** Their last completed quarterly review, if they have ever had one. */
  last_review_on: string | null;
}

/** Someone an ad-hoc meeting can be booked with — anyone active, crew or office. */
export interface MeetingTarget {
  id: string;
  name: string;
  role: string;
  is_crew: boolean;
}

// ── Feedback notes ───────────────────────────────────────────────────────────

export type FeedbackNoteKind = 'praise' | 'needs_work' | 'coaching';

export const FEEDBACK_NOTE_KINDS: { value: FeedbackNoteKind; label: string }[] = [
  { value: 'praise', label: 'Praise' },
  { value: 'needs_work', label: 'Needs work' },
  { value: 'coaching', label: 'Coaching' },
];

export function feedbackNoteKindLabel(kind: string): string {
  return FEEDBACK_NOTE_KINDS.find((k) => k.value === kind)?.label ?? kind;
}

/** Badge colours per kind. Here, not in a client file, because /profile renders it on the server. */
export function kindBadgeClass(kind: string): string {
  if (kind === 'praise') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400';
  if (kind === 'needs_work') return 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400';
  return 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400';
}

/**
 * One piece of individual feedback. Pending until it is gone over in a completed
 * meeting; only then can the crew member see it.
 */
export interface FeedbackNote {
  id: string;
  employee_id: string;
  kind: FeedbackNoteKind;
  body: string;
  job_label: string | null;
  author_name: string;
  created_at: string;
  meeting_id: string | null;
  discussed_at: string | null;
  crew_response: string | null;
}

/** Someone with feedback waiting, for the Crew Meetings board. */
export interface PendingFeedbackSummary {
  employee_id: string;
  employee_name: string;
  pending_count: number;
  oldest_pending_at: string;
  last_met_on: string | null;
  /** A meeting with them is already booked. */
  has_upcoming: boolean;
}

/** A job the person worked, for attaching a note to it. */
export interface FeedbackJobOption {
  id: string;
  label: string;
}
