'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Eye, ArrowUp, ArrowDown, ChevronsUpDown, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Job, Employee } from '@/types';
import { formatDate } from '@/lib/utils';

type SortKey =
  | 'job_number'
  | 'date'
  | 'service_type'
  | 'customer_name'
  | 'pickup_address'
  | 'crew'
  | 'revenue';

export default function JobsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    (async () => {
      const [jobsRes, employeesRes] = await Promise.all([
        fetch('/api/jobs'),
        fetch('/api/employees?active=true'),
      ]);
      if (jobsRes.ok) setJobs(await jobsRes.json());
      if (employeesRes.ok) setEmployees(await employeesRes.json());
      setLoading(false);
    })();
  }, []);

  const empById = useMemo(() => new Map(employees.map((e) => [e.id, e.name])), [employees]);

  function crewNames(job: Job): string {
    // Prefer the full manifest (everyone listed on the calendar, matched or not);
    // fall back to matched employee ids when there's no manifest.
    if (job.crew_manifest && job.crew_manifest.length > 0) {
      return job.crew_manifest.map((m) => m.name).join(', ');
    }
    if (job.crew_ids && job.crew_ids.length > 0) {
      return job.crew_ids
        .map((id) => empById.get(id))
        .filter(Boolean)
        .join(', ');
    }
    return '';
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const filtered = q
      ? jobs.filter((j) =>
          [j.job_number, j.customer_name, j.pickup_address, j.service_type, crewNames(j)]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q))
        )
      : jobs;

    const val = (j: Job): string | number => {
      switch (sortKey) {
        case 'date':
          return new Date(j.date).getTime();
        case 'revenue':
          return Number(j.revenue ?? 0);
        case 'crew':
          return crewNames(j).toLowerCase();
        default:
          return String(j[sortKey] ?? '').toLowerCase();
      }
    };

    return [...filtered].sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, filter, sortKey, sortDir, empById]);

  if (loading) {
    return <div className="p-6">Loading…</div>;
  }

  const SortHeader = ({
    label,
    col,
    className,
  }: {
    label: string;
    col: SortKey;
    className?: string;
  }) => (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => toggleSort(col)}
        className="inline-flex items-center gap-1 hover:text-foreground select-none"
      >
        {label}
        {sortKey === col ? (
          sortDir === 'asc' ? (
            <ArrowUp className="h-3.5 w-3.5" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5" />
          )
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
        )}
      </button>
    </TableHead>
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Jobs</h1>
        <p className="text-muted-foreground mt-1">
          Synced from your SmartMoving calendar — managed in SmartMoving.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>All Jobs</CardTitle>
              <CardDescription>
                {visible.length} of {jobs.length} jobs
              </CardDescription>
            </div>
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Filter by customer, job #, address…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <SortHeader label="Job #" col="job_number" />
                <SortHeader label="Date" col="date" />
                <SortHeader label="Service" col="service_type" />
                <SortHeader label="Customer" col="customer_name" />
                <SortHeader label="Address" col="pickup_address" />
                <SortHeader label="Crew" col="crew" />
                <SortHeader label="Revenue" col="revenue" className="text-right" />
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length > 0 ? (
                visible.map((job) => (
                  <TableRow
                    key={job.id}
                    className="cursor-pointer hover:bg-muted"
                    onClick={() => router.push(`/admin/jobs/${job.id}`)}
                  >
                    <TableCell>
                      {job.job_number ? (
                        <Badge variant="outline">{job.job_number}</Badge>
                      ) : (
                        <span className="text-muted-foreground/70 text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>{formatDate(job.date, 'MMM d, yyyy')}</TableCell>
                    <TableCell>{job.service_type || '-'}</TableCell>
                    <TableCell className="font-medium">{job.customer_name}</TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {job.pickup_address || '-'}
                    </TableCell>
                    <TableCell>
                      {crewNames(job) ? (
                        <span className="text-sm">{crewNames(job)}</span>
                      ) : (
                        <span className="text-muted-foreground/70 text-sm">No crew</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {job.revenue ? `$${Number(job.revenue).toFixed(2)}` : '-'}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/admin/jobs/${job.id}`);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    {jobs.length === 0
                      ? 'No jobs yet — they sync from your SmartMoving calendar (Calendar Sync).'
                      : 'No jobs match your filter.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
