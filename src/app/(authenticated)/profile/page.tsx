import { getCurrentEmployee } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { getMyDiscussedFeedback } from '@/lib/my-feedback';
import { feedbackNoteKindLabel, kindBadgeClass, meetingTypeLabel } from '@/lib/crew-meetings-shared';

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

  // Scoped to the signed-in employee and to notes already gone over with them —
  // see src/lib/my-feedback.ts. Never takes an id from the URL.
  const feedback = await getMyDiscussedFeedback(employee.id);

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

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Feedback from your meetings</CardTitle>
          <CardDescription>
            What we&apos;ve gone over with you in your sit-downs, and what you said back.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {feedback.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing yet.</p>
          ) : (
            <ul className="space-y-3">
              {feedback.map((note) => (
                <li key={note.id} className="rounded-lg border border-border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={`text-[10px] ${kindBadgeClass(note.kind)}`}>
                      {feedbackNoteKindLabel(note.kind)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {meetingTypeLabel(note.meeting_type)} ·{' '}
                      {formatDate(note.discussed_on, 'MMM d, yyyy')}
                      {note.job_label ? ` · ${note.job_label}` : ''}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap">{note.body}</p>
                  {note.crew_response && (
                    <p className="mt-1 text-muted-foreground">
                      You said: &ldquo;{note.crew_response}&rdquo;
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
