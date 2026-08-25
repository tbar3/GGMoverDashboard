// Client-safe constants + types for Policies and Documents.
// Kept free of any DB import so client components can use it without pulling in pg.

export const POLICY_CATEGORIES = [
  { value: 'safety', label: 'Safety', labelEs: 'Seguridad' },
  { value: 'conduct', label: 'Conduct', labelEs: 'Conducta' },
  { value: 'pay_benefits', label: 'Pay & Benefits', labelEs: 'Pago y Beneficios' },
  { value: 'operations', label: 'Operations', labelEs: 'Operaciones' },
  { value: 'vehicles', label: 'Vehicles', labelEs: 'Vehículos' },
  { value: 'general', label: 'General', labelEs: 'General' },
] as const;

export type PolicyCategory = (typeof POLICY_CATEGORIES)[number]['value'];

export const POLICY_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
] as const;

/**
 * Category name in the reader's language. Admin surfaces call this without a
 * locale and get English; the crew page passes theirs, so a Spanish reader does
 * not get Spanish policy text under an English heading.
 */
export function policyCategoryLabel(value: string, locale = 'en'): string {
  const category = POLICY_CATEGORIES.find((c) => c.value === value);
  if (!category) return value;
  return locale === 'es' ? category.labelEs : category.label;
}

export interface Policy {
  id: string;
  title: string;
  title_es: string | null;
  body_en: string;
  body_es: string | null;
  category: string;
  status: string;
  /** Eligible to be a Policy of the Day. Published-but-not-in-rotation is valid. */
  in_rotation: boolean;
  /** Drafted from inference rather than the handbook — needs a human to confirm. */
  needs_review: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  /** Present only on rotation queries — coverage derived from the meeting day log. */
  last_featured_on?: string | null;
  feature_count?: number;
}

export const DOCUMENT_AUDIENCES = [
  { value: 'crew', label: 'Everyone (crew can see)' },
  { value: 'back_office', label: 'Back office only' },
] as const;

export interface DocumentRow {
  id: string;
  title: string;
  description: string | null;
  category: string;
  audience: string;
  original_filename: string;
  content_type: string | null;
  size_bytes: number | null;
  is_handbook: boolean;
  uploaded_by_name: string;
  created_at: string;
}

/** Bytes → a short human size. Used in both the admin table and the crew list. */
export function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const n = bytes / Math.pow(1024, i);
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

/** Crew see whichever language they have toggled, falling back to English. */
export function localizedPolicy(
  policy: Pick<Policy, 'title' | 'title_es' | 'body_en' | 'body_es'>,
  locale: string
): { title: string; body: string; usingFallback: boolean } {
  const wantsEs = locale === 'es';
  const title = wantsEs ? policy.title_es?.trim() || policy.title : policy.title;
  const body = wantsEs ? policy.body_es?.trim() || policy.body_en : policy.body_en;
  return { title, body, usingFallback: wantsEs && !policy.body_es?.trim() };
}
