'use client';

import { useState } from 'react';
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
import { Download, ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';
import type { AdpW2Row, Adp1099Row } from '@/lib/payroll-compute';

type Row = Record<string, string | number>;
interface Col {
  key: string;
  label: string;
  money?: boolean; // format as $
  hours?: boolean; // format as 2-decimal number
  total?: boolean; // include in the totals row
}

function fmt(v: string | number, col: Col): string {
  if (typeof v !== 'number') return String(v);
  if (col.money) return `$${v.toFixed(2)}`;
  if (col.hours) return v.toFixed(2);
  return String(v);
}

function SortableTable({ rows, cols, empty }: { rows: Row[]; cols: Col[]; empty: string }) {
  const [sortKey, setSortKey] = useState<string>(cols[0].key);
  const [dir, setDir] = useState<'asc' | 'desc'>('asc');

  function toggle(k: string) {
    if (sortKey === k) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(k);
      setDir('asc');
    }
  }

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    const c =
      typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).toLowerCase().localeCompare(String(bv).toLowerCase());
    return dir === 'asc' ? c : -c;
  });

  const totals: Record<string, number> = {};
  for (const col of cols) {
    if (col.total) totals[col.key] = rows.reduce((s, r) => s + (Number(r[col.key]) || 0), 0);
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {cols.map((col, i) => (
            <TableHead key={col.key} className={i === 0 ? '' : 'text-right'}>
              <button
                type="button"
                onClick={() => toggle(col.key)}
                className={`inline-flex items-center gap-1 hover:text-foreground select-none ${
                  i === 0 ? '' : 'flex-row-reverse'
                }`}
              >
                {col.label}
                {sortKey === col.key ? (
                  dir === 'asc' ? (
                    <ArrowUp className="h-3.5 w-3.5" />
                  ) : (
                    <ArrowDown className="h-3.5 w-3.5" />
                  )
                ) : (
                  <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
                )}
              </button>
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.length === 0 ? (
          <TableRow>
            <TableCell colSpan={cols.length} className="text-center py-6 text-muted-foreground">
              {empty}
            </TableCell>
          </TableRow>
        ) : (
          <>
            {sorted.map((r, ri) => (
              <TableRow key={ri}>
                {cols.map((col, ci) => (
                  <TableCell
                    key={col.key}
                    className={ci === 0 ? 'font-medium' : 'text-right'}
                  >
                    {fmt(r[col.key], col)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            <TableRow className="font-semibold border-t-2">
              {cols.map((col, ci) => (
                <TableCell key={col.key} className={ci === 0 ? '' : 'text-right'}>
                  {ci === 0 ? 'Total' : col.total ? fmt(totals[col.key], col) : ''}
                </TableCell>
              ))}
            </TableRow>
          </>
        )}
      </TableBody>
    </Table>
  );
}

export function AdpTables({
  weekStart,
  w2,
  contractors1099,
}: {
  weekStart: string;
  w2: AdpW2Row[];
  contractors1099: Adp1099Row[];
}) {
  const cols1099: Col[] = [
    { key: 'contractor', label: 'Contractor' },
    { key: 'compHours', label: 'Comp Hours', hours: true, total: true },
    { key: 'compAmount', label: 'Comp Amount', money: true, total: true },
    { key: 'reimbursement', label: 'Reimbursement', money: true, total: true },
  ];
  const colsW2: Col[] = [
    { key: 'employee', label: 'Employee' },
    { key: 'regularHours', label: 'Reg Hrs', hours: true, total: true },
    { key: 'overtimeHours', label: 'OT Hrs', hours: true, total: true },
    { key: 'tips', label: 'Tips', money: true, total: true },
    { key: 'bonus', label: 'Bonus', money: true, total: true },
    { key: 'commissions', label: 'Commissions', money: true, total: true },
    { key: 'reimbursement', label: 'Reimb.', money: true, total: true },
  ];

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>ADP — 1099 Contractors</CardTitle>
              <CardDescription>
                {contractors1099.length} contractors · Comp Hours = total hours + ½ OT
              </CardDescription>
            </div>
            <a href={`/api/payroll/export?type=1099&week=${weekStart}`}>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </a>
          </div>
        </CardHeader>
        <CardContent>
          <SortableTable
            rows={contractors1099 as unknown as Row[]}
            cols={cols1099}
            empty="No 1099 contractors this week."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>ADP — W-2 Employees</CardTitle>
              <CardDescription>
                {w2.length} employees · Regular (≤40) + Overtime (&gt;40) hours
              </CardDescription>
            </div>
            <a href={`/api/payroll/export?type=w2&week=${weekStart}`}>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </a>
          </div>
        </CardHeader>
        <CardContent>
          <SortableTable rows={w2 as unknown as Row[]} cols={colsW2} empty="No W-2 employees this week." />
        </CardContent>
      </Card>
    </>
  );
}
