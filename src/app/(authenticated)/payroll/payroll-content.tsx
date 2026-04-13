'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { Employee, PayrollEntry } from '@/types';
import { DollarSign, TrendingUp } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

interface PayrollContentProps {
  employee: Employee;
  entries: PayrollEntry[];
  thisWeekJobs: { estimated_hours: number | null; customer_name: string; job_number: string | null; date: string }[];
  expectedHours: number;
  expectedPay: number;
  currentMondayStr: string;
  currentSundayStr: string;
}

export function PayrollContent({ employee, entries, thisWeekJobs, expectedHours, expectedPay, currentMondayStr, currentSundayStr }: PayrollContentProps) {
  const { t } = useI18n();

  const latestEntry = entries[0] || null;
  const totalHours = entries.reduce((sum, e) => sum + Number(e.total_hours), 0);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('pay.title')}</h1>
        <p className="text-gray-500 mt-1">{t('pay.subtitle')}</p>
      </div>

      {/* This Week Expected */}
      {thisWeekJobs.length > 0 && (
        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-blue-800">{t('pay.this_week')}</CardTitle>
            <CardDescription>
              {currentMondayStr} &ndash; {currentSundayStr} &middot; {thisWeekJobs.length === 1 ? t('pay.job_count') : t('pay.jobs_count', { count: thisWeekJobs.length })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div>
                <p className="text-2xl font-bold text-blue-700">{expectedHours.toFixed(1)} hrs</p>
                <p className="text-xs text-blue-500">{t('pay.expected_hours')}</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-700">${expectedPay.toFixed(2)}</p>
                <p className="text-xs text-blue-500">{t('pay.expected_pay')}</p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {thisWeekJobs.map((job, i) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  {job.job_number || job.customer_name} — {format(new Date(job.date), 'EEE')} ({Number(job.estimated_hours) || 0}h)
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t('pay.hourly_rate')}</CardDescription>
            <CardTitle className="text-3xl">${employee.hourly_rate ? Number(employee.hourly_rate).toFixed(2) : '—'}</CardTitle>
          </CardHeader>
          <CardContent><p className="text-sm text-gray-500">{t('pay.per_hour')}</p></CardContent>
        </Card>

        {latestEntry && (
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t('pay.last_period')}</CardDescription>
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
            <CardDescription>{t('pay.total_hours_recent')}</CardDescription>
            <CardTitle className="text-3xl">{totalHours.toFixed(1)}</CardTitle>
          </CardHeader>
          <CardContent><p className="text-sm text-gray-500">{t('pay.across_periods', { count: entries.length })}</p></CardContent>
        </Card>
      </div>

      {/* Latest Pay Period Detail */}
      {latestEntry && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5" />{t('pay.latest_period')}</CardTitle>
            <CardDescription>
              {format(new Date(latestEntry.week_start), 'EEEE, MMM d')} – {format(new Date(latestEntry.week_end), 'EEEE, MMM d, yyyy')}
              {' '}&middot; {t('pay.paid', { date: format(new Date(latestEntry.pay_date), 'EEEE, MMM d') })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 rounded-lg bg-gray-50">
                <p className="text-2xl font-bold">{Number(latestEntry.travel_hours).toFixed(1)}</p>
                <p className="text-xs text-gray-500">{t('pay.travel_hours')}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-gray-50">
                <p className="text-2xl font-bold">{Number(latestEntry.job_hours).toFixed(1)}</p>
                <p className="text-xs text-gray-500">{t('pay.job_hours')}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-gray-50">
                <p className="text-2xl font-bold">{Number(latestEntry.warehouse_hours).toFixed(1)}</p>
                <p className="text-xs text-gray-500">{t('pay.warehouse_hours')}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-blue-50">
                <p className="text-2xl font-bold text-blue-600">{Number(latestEntry.total_hours).toFixed(1)}</p>
                <p className="text-xs text-gray-500">{t('pay.total_hours')}</p>
              </div>
            </div>
            <Separator className="my-4" />
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">{t('pay.gross_pay')} ({Number(latestEntry.total_hours).toFixed(1)} hrs &times; ${Number(latestEntry.hourly_rate).toFixed(2)})</span>
                <span className="font-medium">${Number(latestEntry.gross_pay).toFixed(2)}</span>
              </div>
              {Number(latestEntry.lunch_reimbursement) > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">{t('pay.lunch_reimb')}</span>
                  <span className="font-medium">${Number(latestEntry.lunch_reimbursement).toFixed(2)}</span>
                </div>
              )}
              {Number(latestEntry.mileage_reimbursement) > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">{t('pay.mileage_reimb')}</span>
                  <span className="font-medium">${Number(latestEntry.mileage_reimbursement).toFixed(2)}</span>
                </div>
              )}
              {Number(latestEntry.other_reimbursement) > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">{t('pay.other_reimb')}</span>
                  <span className="font-medium">${Number(latestEntry.other_reimbursement).toFixed(2)}</span>
                </div>
              )}
              {Number(latestEntry.tip) > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">{t('pay.tips')}</span>
                  <span className="font-medium">${Number(latestEntry.tip).toFixed(2)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between items-center">
                <span className="font-semibold">{t('pay.total')}</span>
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
          <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5" />{t('pay.history')}</CardTitle>
          <CardDescription>{t('pay.last_periods', { count: entries.length })}</CardDescription>
        </CardHeader>
        <CardContent>
          {entries.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('pay.week')}</TableHead>
                  <TableHead>{t('pay.pay_date')}</TableHead>
                  <TableHead className="text-right">{t('pay.travel')}</TableHead>
                  <TableHead className="text-right">{t('pay.job')}</TableHead>
                  <TableHead className="text-right">{t('pay.wh')}</TableHead>
                  <TableHead className="text-right">{t('pay.total_hours')}</TableHead>
                  <TableHead className="text-right">{t('pay.gross')}</TableHead>
                  <TableHead className="text-right">{t('pay.reimb')}</TableHead>
                  <TableHead className="text-right">{t('pay.tips')}</TableHead>
                  <TableHead className="text-right font-bold">{t('pay.total')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => {
                  const reimb = Number(entry.lunch_reimbursement) + Number(entry.mileage_reimbursement) + Number(entry.other_reimbursement);
                  const total = Number(entry.gross_pay) + reimb + Number(entry.tip);
                  return (
                    <TableRow key={entry.id}>
                      <TableCell className="text-sm">{format(new Date(entry.week_start), 'MMM d')} – {format(new Date(entry.week_end), 'MMM d')}</TableCell>
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
            <p className="text-center text-gray-500 py-8">{t('pay.no_records')}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
