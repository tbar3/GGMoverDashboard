// Client-safe constants + types for the 30-day New Crew Member Evaluation.
// Kept free of any DB import so client components can use it without pulling in pg.

export const EVAL_WINDOW_DAYS = 30;

// Fixed rating categories (1-5). Order here drives the form + display.
export const EVAL_CATEGORIES = [
  { key: 'attendance', label: 'Attendance & punctuality' },
  { key: 'attitude', label: 'Attitude & coachability' },
  { key: 'work_ethic', label: 'Work ethic & pace' },
  { key: 'customer_service', label: 'Customer service' },
  { key: 'care_with_items', label: 'Care with items' },
  { key: 'follows_procedures', label: 'Follows procedures' },
] as const;

export type EvalCategoryKey = (typeof EVAL_CATEGORIES)[number]['key'];

export interface NewCrewEvaluation {
  id: string;
  employee_id: string;
  due_date: string;
  completed_at: string | null;
  completed_by: string | null;
  completed_by_name: string | null;
  outcome: 'pass' | 'extend' | 'terminate' | null;
  attendance: number | null;
  attitude: number | null;
  work_ethic: number | null;
  customer_service: number | null;
  care_with_items: number | null;
  follows_procedures: number | null;
  notes: string | null;
  created_at: string;
}

export interface PendingEval {
  employeeId: string;
  employeeName: string;
  startDate: string;
  dueDate: string;
  status: 'due' | 'overdue' | 'upcoming';
  daysUntilDue: number; // negative = overdue
}
