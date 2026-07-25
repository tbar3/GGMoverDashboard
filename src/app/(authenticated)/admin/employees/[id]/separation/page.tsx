import { queryOne } from '@/lib/db';
import { requireBackOffice } from '@/lib/auth';
import { Employee } from '@/types';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { format } from 'date-fns';
import { PrintButton } from './print-button';

export const dynamic = 'force-dynamic';

// Company details for the letterhead. Editable here until they live in settings.
const COMPANY = {
  name: 'GoodGuys Concierge Moving & Storage',
  address: '1285 Collier Rd NW, Atlanta, GA 30318',
  site: 'goodguysserve.com',
};

const TYPE_PHRASE: Record<string, string> = {
  voluntary: 'your voluntary resignation',
  involuntary: 'the termination of your employment',
  layoff: 'the elimination of your position',
  other: 'the end of your employment',
};

function fmt(d: string | null): string {
  return d ? format(new Date(`${d}T12:00:00`), 'MMMM d, yyyy') : '—';
}

export default async function SeparationLetterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const guard = await requireBackOffice();
  if (!guard.ok) redirect('/dashboard');

  const { id } = await params;
  const employee = await queryOne<Employee>('SELECT * FROM employees WHERE id = $1', [id]);
  if (!employee) notFound();

  if (!employee.terminated_at) {
    return (
      <div className="p-6 space-y-4">
        <Link href={`/admin/employees/${id}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
          </Button>
        </Link>
        <p className="text-muted-foreground">
          This employee has not been separated. Record a separation first to generate the letter.
        </p>
      </div>
    );
  }

  const signer = await queryOne<{ name: string; role: string }>(
    'SELECT name, role FROM employees WHERE id = $1',
    [employee.terminated_by]
  );
  const today = new Date();
  const typePhrase = TYPE_PHRASE[employee.termination_type ?? 'other'] ?? TYPE_PHRASE.other;

  return (
    <div className="p-6">
      {/* Controls — hidden when printing */}
      <div className="flex items-center justify-between mb-6 print:hidden">
        <Link href={`/admin/employees/${id}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to employee
          </Button>
        </Link>
        <PrintButton />
      </div>

      {/* The letter */}
      <div className="mx-auto max-w-[8.5in] bg-white text-black rounded-lg border print:border-0 print:rounded-none p-10 print:p-0 leading-relaxed">
        <header className="mb-8">
          <h1 className="text-xl font-bold">{COMPANY.name}</h1>
          <p className="text-sm text-gray-600">
            {COMPANY.address} · {COMPANY.site}
          </p>
        </header>

        <p className="mb-6">{format(today, 'MMMM d, yyyy')}</p>

        <p className="mb-6">
          <span className="font-medium">{employee.name}</span>
        </p>

        <p className="mb-4 font-semibold">Re: Letter of Separation</p>

        <p className="mb-4">Dear {employee.name.split(' ')[0]},</p>

        <p className="mb-4">
          This letter confirms {typePhrase} with {COMPANY.name}, effective{' '}
          <span className="font-medium">{fmt(employee.last_day_worked)}</span>, your last day worked.
        </p>

        {employee.termination_reason && (
          <p className="mb-4">Reason for separation: {employee.termination_reason}.</p>
        )}

        <p className="mb-4">
          You will be paid for all hours worked through your last day, in accordance with applicable
          law and company policy. Any final wages, including approved reimbursements, will be issued
          on the next regular payroll cycle. Please return any company property in your possession.
        </p>

        <p className="mb-4">
          If you have questions about your final pay or benefits, please contact management. We wish
          you the best in your future endeavors.
        </p>

        <div className="mt-10">
          <p>Sincerely,</p>
          <div className="mt-8">
            <div className="w-64 border-b border-black" />
            <p className="mt-1 font-medium">{signer?.name ?? 'GoodGuys Management'}</p>
            <p className="text-sm text-gray-600 capitalize">{signer?.role ?? 'Management'}</p>
            <p className="text-sm text-gray-600">{COMPANY.name}</p>
          </div>
        </div>

        {/* Internal-only footer — shown on screen, hidden from the printed copy */}
        <div className="mt-12 pt-4 border-t text-xs text-gray-500 print:hidden">
          Internal record · Type: <span className="capitalize">{employee.termination_type}</span> ·
          Rehire eligible: {employee.rehire_eligible ? 'Yes' : 'No'}
          {employee.termination_details ? ` · Notes: ${employee.termination_details}` : ''} ·
          Recorded {fmt(employee.terminated_at?.slice(0, 10) ?? null)}
        </div>
      </div>
    </div>
  );
}
