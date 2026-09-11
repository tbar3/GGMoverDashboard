import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentEmployee, isBackOffice } from '@/lib/auth';
import { getDashboardBuckets, getMyItems, getPmSchedules } from '@/lib/compliance/queries';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StateBadge } from '@/components/compliance/state-badge';
import { formatDate } from '@/lib/utils';
import { categoryLabel, serviceTypeLabel, type ComplianceItemRow } from '@/lib/compliance/types';
import { AlertTriangle, CheckCircle2, Clock, FileCheck, Truck, Wrench } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function ComplianceOverviewPage() {
  const employee = await getCurrentEmployee();
  if (!isBackOffice(employee)) redirect('/dashboard');

  const [buckets, mine, pm] = await Promise.all([
    getDashboardBuckets(),
    getMyItems(employee!.id),
    getPmSchedules(),
  ]);

  const pmOpen = pm.filter((s) => s.state === 'expired' || s.state === 'due_soon');
  const mineOpen = mine.filter((i) => i.state === 'expired' || i.state === 'due_soon');
  const needsAction = buckets.expired.length + buckets.dueSoon.length + pmOpen.length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Compliance</h1>
          <p className="text-muted-foreground mt-1">
            {needsAction === 0
              ? 'Everything on file is current.'
              : `${needsAction} ${needsAction === 1 ? 'thing needs' : 'things need'} attention.`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/admin/compliance/items">
              <FileCheck className="h-4 w-4" />
              All items
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/admin/compliance/fleet">
              <Truck className="h-4 w-4" />
              Fleet &amp; PM
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Expired"
          value={buckets.expired.length}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone="destructive"
        />
        <StatCard
          label="Due soon"
          value={buckets.dueSoon.length}
          icon={<Clock className="h-5 w-5" />}
          tone="warning"
        />
        <StatCard
          label="Current"
          value={buckets.okCount + buckets.noExpiryCount}
          icon={<CheckCircle2 className="h-5 w-5" />}
          tone="ok"
        />
        <StatCard
          label="PM due"
          value={pmOpen.length}
          icon={<Wrench className="h-5 w-5" />}
          tone={pmOpen.length > 0 ? 'warning' : 'muted'}
        />
      </div>

      {buckets.needsReviewCount > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="text-base">
              {buckets.needsReviewCount} {buckets.needsReviewCount === 1 ? 'item' : 'items'} still
              need a look
            </CardTitle>
            <CardDescription>
              These were seeded from what a Georgia household-goods mover typically owes, not from
              your actual filings. Open each one, fill in the real dates and numbers, and saving it
              clears the flag.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {(buckets.expired.length > 0 || buckets.dueSoon.length > 0) && (
        <ItemTable
          title="Needs attention"
          description="Expired first, then whatever falls inside its own warning window."
          items={[...buckets.expired, ...buckets.dueSoon]}
        />
      )}

      {pmOpen.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Maintenance due</CardTitle>
            <CardDescription>
              By mileage or by time — whichever came first.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pmOpen.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <Link
                          href={`/admin/compliance/fleet/${s.vehicle_id}`}
                          className="font-medium text-foreground hover:underline"
                        >
                          {s.vehicle_name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {serviceTypeLabel(s.service_type, s.custom_label)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {s.next_due_date ? formatDate(s.next_due_date, 'MMM d, yyyy') : '—'}
                        {s.next_due_odometer != null && (
                          <span className="text-muted-foreground">
                            {' '}
                            · {s.next_due_odometer.toLocaleString()} mi
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StateBadge state={s.state} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <ItemTable
        title="Assigned to me"
        description={
          mineOpen.length > 0
            ? 'What you personally owe a renewal on.'
            : 'Nothing of yours is due right now.'
        }
        items={mine}
        emptyMessage="Nothing is assigned to you yet."
      />

      {buckets.upcoming.length > 0 && (
        <ItemTable
          title="Coming up in the next 90 days"
          description="Not urgent yet — here so nothing arrives as a surprise."
          items={buckets.upcoming}
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: 'destructive' | 'warning' | 'ok' | 'muted';
}) {
  const tones = {
    destructive: 'text-destructive',
    warning: 'text-amber-600 dark:text-amber-400',
    ok: 'text-emerald-600 dark:text-emerald-400',
    muted: 'text-muted-foreground',
  };
  return (
    <Card>
      <CardContent className="flex items-center justify-between pt-6">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-3xl font-bold text-foreground">{value}</p>
        </div>
        <span className={tones[tone]}>{icon}</span>
      </CardContent>
    </Card>
  );
}

function ItemTable({
  title,
  description,
  items,
  emptyMessage = 'Nothing here.',
}: {
  title: string;
  description: string;
  items: ComplianceItemRow[];
  emptyMessage?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Applies to</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Owner</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Link
                        href={`/admin/compliance/items/${item.id}`}
                        className="font-medium text-foreground hover:underline"
                      >
                        {item.name}
                      </Link>
                      {item.issuing_authority && (
                        <p className="text-xs text-muted-foreground">{item.issuing_authority}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {item.entity_type === 'company'
                        ? 'Company'
                        : item.vehicle_name ?? item.entity_employee_name ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {categoryLabel(item.category)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {item.expiration_date ? formatDate(item.expiration_date, 'MMM d, yyyy') : '—'}
                    </TableCell>
                    <TableCell>
                      <StateBadge state={item.state} daysUntil={item.days_until} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {item.owner_name ?? <span className="text-destructive">Unassigned</span>}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
