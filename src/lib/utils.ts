import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format } from "date-fns"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a DATE-only value (no meaningful time-of-day) for display.
 *
 * Postgres DATE columns are serialized as UTC midnight (e.g. "2026-12-25T00:00:00.000Z").
 * Calling `new Date(str)` then formatting renders that instant in the viewer's timezone,
 * which shifts the calendar day back by one in any negative-UTC-offset zone (e.g. ET) —
 * so "Dec 25" showed as "Dec 24". Read the UTC calendar parts and rebuild a local Date on
 * that same day, so the intended date renders everywhere regardless of timezone.
 *
 * Use this ONLY for date-only fields (job.date, week_start, start_date, …). For real
 * timestamps (created_at, connected_at, …) keep `format(new Date(x), …)` — their
 * time-of-day is meaningful and should render in local time.
 */
export function formatDate(value: string | Date | null | undefined, fmt: string): string {
  if (!value) return "—"
  const d = typeof value === "string" ? new Date(value) : value
  if (isNaN(d.getTime())) return "—"
  const local = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  return format(local, fmt)
}
