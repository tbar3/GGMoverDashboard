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
