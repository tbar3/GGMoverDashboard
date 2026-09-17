// Client-safe constants + types for the Morning Meeting module.
// Kept free of any DB import so the board component can use it without pulling in pg.

import type { Policy } from '@/lib/policies-shared';

export interface RecognitionItem {
  id: string;
  employee_id: string;
  employee_name: string;
  type: string;
  type_label: string;
  discretionary: boolean;
  /** When it happened. */
  event_date: string;
  /** The day it landed on this board: the later of event_date and when it was logged. */
  board_date: string;
  note: string | null;
  job_customer: string | null;
  awarded_by: string | null;
  created_at: string;
  /** Part of the newest batch to appear on the board — i.e. new since the last meeting. */
  is_fresh: boolean;
}

export interface RecognitionGroup {
  employee_id: string;
  employee_name: string;
  items: RecognitionItem[];
  fresh_count: number;
}

export interface MeetingNote {
  id: string;
  meeting_date: string;
  body: string;
  /** Set once the note has been saved into the policy list. */
  policy_id: string | null;
  policy_title: string | null;
  author_name: string;
  created_at: string;
}

export interface PolicyOfDay {
  policy: Policy | null;
  pinned: boolean;
  /** No published, in-rotation policies exist at all — the list is empty. */
  empty: boolean;
  /**
   * Coverage BEFORE today. Counting today's own row would tell you a policy being
   * shown for the first time was "covered 1× · last on today".
   */
  prior_times: number;
  prior_last_on: string | null;
}

/**
 * A question to raise at the meeting — usually about a job that looked wrong when
 * the office went to close it out.
 *
 * It stays open until someone records what was actually said. The answer is the
 * point: without it, a problem that keeps happening looks new every time.
 */
export interface DiscussionPoint {
  id: string;
  question: string;
  /** Null once the job row is gone; job_label survives it. */
  job_id: string | null;
  job_label: string | null;
  /** Who the question is for — picked from the job's crew. */
  employee_id: string | null;
  employee_name: string | null;
  status: 'open' | 'answered';
  answer: string | null;
  answered_at: string | null;
  answered_by_name: string | null;
  author_name: string;
  created_at: string;
}

/** A job as the discussion picker needs it — enough to identify it and to know
 *  who was on it. */
export interface DiscussionJob {
  id: string;
  date: string;
  customer_name: string;
  job_number: string | null;
  crew_ids: string[];
}

/** A crew member the picker can address a question to. */
export interface CrewOption {
  id: string;
  name: string;
  role: string;
}
