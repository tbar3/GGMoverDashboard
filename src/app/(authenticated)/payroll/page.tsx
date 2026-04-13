import { currentUser } from '@clerk/nextjs/server';
import { query, queryOne } from '@/lib/db';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { Employee, PayrollEntry } from '@/types';
import { DollarSign, Clock, TrendingUp } from 'lucide-react';

export default async function MyPayrollPage() {
  const user = await currentUser();
  const email = user?.emailAddresses[0]?.emailAddress;

  const employee = await queryOne<Employee>(
    'SELECT * FROM employees WHERE email = $1',
    [email]
  );

  if (!employee) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-gray-500">Employee profile not found. Please contact your administrator.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const entries = await query<PayrollEntry>(
    `SELECT * FROM payroll_entries WHERE employee_id = $1 ORDER BY week_start DESC LIMIT 26`,
    [employee.id]
  );

  const latestEntry = entries[0] || null;
  const totalEarnings = entries.reduce((sum, e) => {
    const reimb = Number(e.lunch_reimbursement) + Number(e.mileage_reimbursement) + Number(e.other_reimbursement);
    return sum + Number(e.gross_pay) + reimb + Number(e.tip);
  }, 0);
  const totalHours = entries.reduce((sum, e) => sum + Number(e.total_hours), 0);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Payroll</h1>
        <p className="text-gray-500 mt-1">Your weekly pay breakdown and history</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Hourly Rate</CardDescription>
            <CardTitle className="text-3xl">
              ${employee.hourly_rate ? Number(employee.hourly_rate).toFixed(2) : '—'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">per hour</p>
          </CardContent>
        </Card>

        {latestEntry && (
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Last Pay Period</CardDescription>
              <CardTitle className="text-3xl">
                ${(Number(latestEntry.gross_pay) + Number(latestEntry.lunch_reimbursement) + Number(latestEntry.mileage_reimbursement) + Number(latestEntry.other_reimbursement) + Number(latestEntry.tip)).toFixed(2)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-500">
                {format(new Date(latestEntry.week_start), 'MMM d')} – {format(new Date(latestEntry.week_end), 'MMM d')}
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Hours (Recent)</CardDescription>
            <CardTitle className="text-3xl">{totalHours.toFixed(1)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">across {entries.length} pay periods</p>
          </CardContent>
        </Card>
      </div>

      {/* Latest Pay Period Detail */}
      {latestEntry && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Latest Pay Period
            </CardTitle>
            <CardDescription>
              {format(new Date(latestEntry.week_start), 'EEEE, MMM d')} – {format(new Date(latestEntry.week_end), 'EEEE, MMM d, yyyy')}
              {' '}&middot; Paid {format(new Date(latestEntry.pay_date), 'EEEE, MMM d')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 rounded-lg bg-gray-50">
                <p className="text-2xl font-bold">{Number(latestEntry.travel_hours).toFixed(1)}</p>
                <p className="text-xs text-gray-500">Travel Hours</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-gray-50">
                <p className="text-2xl font-bold">{Number(latestEntry.job_hours).toFixed(1)}</p>
                <p className="text-xs text-gray-500">Job Hours</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-gray-50">
                <p className="text-2xl font-bold">{Number(latestEntry.warehouse_hours).toFixed(1)}</p>
                <p className="text-xs text-gray-500">Warehouse Hours</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-blue-50">
                <p className="text-2xl font-bold text-blue-600">{Number(latestEntry.total_hours).toFixed(1)}</p>
                <p className="text-xs text-gray-500">Total Hours</p>
              </div>
            </div>

            <Separator className="my-4" />

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Gross Pay ({Number(latestEntry.total_hours).toFixed(1)} hrs &times; ${Number(latestEntry.hourly_rate).toFixed(2)})</span>
                <span className="font-medium">${Number(latestEntry.gross_pay).toFixed(2)}</span>
              </div>
              {Number(latestEntry.lunch_reimbursement) > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Lunch Reimbursement</span>
                  <span className="font-medium">${Number(latestEntry.lunch_reimbursement).toFixed(2)}</span>
                </div>
              )}
              {Number(latestEntry.mileage_reimbursement) > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Mileage Reimbursement</span>
                  <span className="font-medium">${Number(latestEntry.mileage_reimbursement).toFixed(2)}</span>
                </div>
              )}
              {Number(latestEntry.other_reimbursement) > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Other Reimbursement</span>
                  <span className="font-medium">${Number(latestEntry.other_reimbursement).toFixed(2)}</span>
                </div>
              )}
              {Number(latestEntry.tip) > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Tips</span>
                  <span className="font-medium">${Number(latestEntry.tip).toFixed(2)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between items-center">
                <span className="font-semibold">Total</span>
                <span className="text-lg font-bold">
                  ${(Number(latestEntry.gross_pay) + Number(latestEntry.lunch_reimbursement) + Number(latestEntry.mileage_reimbursement) + Number(latestEntry.other_reimbursement) + Number(latestEntry.tip)).toFixed(2)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pay History Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Pay History
          </CardTitle>
          <CardDescription>Last {entries.length} pay periods</CardDescription>
        </CardHeader>
        <CardContent>
          {entries.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Week</TableHead>
                  <TableHead>Pay Date</TableHead>
                  <TableHead className="text-right">Travel</TableHead>
                  <TableHead className="text-right">Job</TableHead>
                  <TableHead className="text-right">WH</TableHead>
                  <TableHead className="text-right">Total Hrs</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Reimb</TableHead>
                  <TableHead className="text-right">Tips</TableHead>
                  <TableHead className="text-right font-bold">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => {
                  const reimb = Number(entry.lunch_reimbursement) + Number(entry.mileage_reimbursement) + Number(entry.other_reimbursement);
                  const total = Number(entry.gross_pay) + reimb + Number(entry.tip);
                  return (
                    <TableRow key={entry.id}>
                      <TableCell className="text-sm">
                        {format(new Date(entry.week_start), 'MMM d')} – {format(new Date(entry.week_end), 'MMM d')}
                      </TableCell>
                      <TableCell className="text-sm">{format(new Date(entry.pay_date), 'MMM d')}</TableCell>
                      <TableCell className="text-right">{Number(entry.travel_hours).toFixed(1)}</TableCell>
                      <TableCell className="text-right">{Number(entry.job_hours).toFixed(1)}</TableCell>
                      <TableCell className="text-right">{Number(entry.warehouse_hours).toFixed(1)}</TableCell>
                      <TableCell className="text-right font-medium">{Number(entry.total_hours).toFixed(1)}</TableCell>
                      <TableCell className="text-right">${Number(entry.gross_pay).toFixed(2)}</TableCell>
                      <TableCell className="text-right">{reimb > 0 ? `$${reimb.toFixed(2)}` : '—'}</TableCell>
                      <TableCell className="text-right">{Number(entry.tip) > 0 ? `$${Number(entry.tip).toFixed(2)}` : '—'}</TableCell>
                      <TableCell className="text-right font-bold">${total.toFixed(2)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center text-gray-500 py-8">No payroll records yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
