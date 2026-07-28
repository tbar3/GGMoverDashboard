import { getCurrentEmployee } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/page-header';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const employee = await getCurrentEmployee();

  if (!employee) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">
              Employee profile not found. Please contact your administrator.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const rows: { label: string; value: string }[] = [
    { label: 'Name', value: employee.name },
    { label: 'Role', value: employee.role },
    { label: 'Start date', value: formatDate(employee.start_date, 'MMM d, yyyy') },
    {
      label: 'Pay rate',
      value: employee.hourly_rate != null ? `$${employee.hourly_rate.toFixed(2)}/hr` : 'Not set',
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <PageHeader titleKey="profile.title">
        {employee.name} · <span className="capitalize">{employee.role}</span>
      </PageHeader>
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Your Details</CardTitle>
          <CardDescription>
            Your pay rate is set by the office and drives your weekly-pay estimate. If anything
            here looks wrong, let a manager know.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {rows.map((r) => (
            <div key={r.label} className="flex justify-between items-center p-2">
              <span className="text-sm text-muted-foreground">{r.label}</span>
              <span className="font-medium capitalize">{r.value}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
