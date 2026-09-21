import { redirect } from 'next/navigation';

/**
 * Kept as a redirect, not deleted. This board lived at /admin/performance for
 * months and people have it bookmarked — and "Performance" was always the wrong
 * name for what it is: the weekly bonus.
 *
 * The week carries across, so a bookmarked week still lands on that week.
 */
export default async function Redirect({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  redirect(`/admin/weekly-bonus${week ? `?week=${week}` : ''}`);
}
