import { getCurrentEmployee } from '@/lib/auth';
import { ScorecardForm } from '@/components/hiring/scorecard-form';

export default async function NewScorecardPage() {
  const employee = await getCurrentEmployee();

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Interview Scorecard</h1>
        <p className="text-muted-foreground mt-1">
          Serve &amp; Elevate Others · People Before Profit
        </p>
      </div>
      <ScorecardForm interviewerName={employee?.name ?? ''} />
    </div>
  );
}
