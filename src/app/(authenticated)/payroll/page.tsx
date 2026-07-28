import { redirect } from 'next/navigation';

// "My Payroll" is hidden from crew for now — the bonus views cover pay. The nav
// item is removed; anyone hitting this URL directly is sent to their dashboard.
export default async function MyPayrollPage() {
  redirect('/dashboard');
}
