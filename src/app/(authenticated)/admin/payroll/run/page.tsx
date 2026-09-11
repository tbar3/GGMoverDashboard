import { redirect } from 'next/navigation';

/**
 * Kept as a redirect, not deleted. Payroll used to live across four routes and
 * people have these bookmarked — and the app itself still links to a couple of
 * them from other pages.
 */
export default async function Redirect({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  redirect(`/admin/payroll?tab=run${week ? `&week=${week}` : ''}`);
}
