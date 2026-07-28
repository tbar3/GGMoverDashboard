import { query } from '@/lib/db';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { format } from 'date-fns';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { POSITIONS, FIT_BAND_LABELS, MAX_SCORE, type FitBand } from '@/lib/interview-scorecard';
import { getPendingNewCrewEvals } from '@/lib/new-crew-eval';
import { formatDate } from '@/lib/utils';

interface CandidateRow {
  id: string;
  name: string;
  position: string;
  referred_by: string | null;
  status: string;
  created_at: string;
  latest_scorecard_id: string | null;
  latest_total_score: number | null;
  latest_scored_count: number | null;
  latest_fit_band: FitBand | null;
  latest_recommendation: string | null;
  latest_interview_date: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  interviewed: 'Interviewed',
  advance: 'Advance to Trial',
  maybe: 'Maybe',
  pass: 'Pass',
  hired: 'Hired',
};

function positionLabel(value: string) {
  return POSITIONS.find((p) => p.value === value)?.label ?? value;
}

const EVAL_STATUS = {
  overdue: { label: 'Overdue', tone: 'bg-red-100 text-red-800' },
  due: { label: 'Due now', tone: 'bg-amber-100 text-amber-800' },
  upcoming: { label: 'Upcoming', tone: 'bg-sky-100 text-sky-800' },
} as const;

export default async function HiringPage() {
  const pendingEvals = await getPendingNewCrewEvals();
  const candidates = await query<CandidateRow>(`
    SELECT
      c.*,
      s.id             AS latest_scorecard_id,
      s.total_score    AS latest_total_score,
      s.scored_count   AS latest_scored_count,
      s.fit_band       AS latest_fit_band,
      s.recommendation AS latest_recommendation,
      s.interview_date AS latest_interview_date
    FROM candidates c
    LEFT JOIN LATERAL (
      SELECT * FROM interview_scorecards
      WHERE candidate_id = c.id
      ORDER BY interview_date DESC, created_at DESC
      LIMIT 1
    ) s ON true
    ORDER BY c.created_at DESC
  `);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Hiring</h1>
          <p className="text-muted-foreground mt-1">Interview scorecards and candidates</p>
        </div>
        <Link href="/admin/hiring/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Scorecard
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>30-Day New Crew Evaluations</CardTitle>
          <CardDescription>
            Probation reviews due 30 days after a new crew member&apos;s start date.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pendingEvals.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No evaluations pending — all new crew are reviewed.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Crew member</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingEvals.map((ev) => (
                  <TableRow key={ev.employeeId}>
                    <TableCell className="font-medium">{ev.employeeName}</TableCell>
                    <TableCell>{format(new Date(`${ev.startDate}T12:00:00`), 'MMM d, yyyy')}</TableCell>
                    <TableCell>{format(new Date(`${ev.dueDate}T12:00:00`), 'MMM d, yyyy')}</TableCell>
                    <TableCell>
                      <Badge className={EVAL_STATUS[ev.status].tone}>{EVAL_STATUS[ev.status].label}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/admin/employees/${ev.employeeId}`} className="text-sm text-primary">
                        Evaluate
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Candidates</CardTitle>
          <CardDescription>
            {candidates.length} total {candidates.length === 1 ? 'candidate' : 'candidates'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No candidates yet. Start a scorecard during your next interview.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Interviewed</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Fit</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{positionLabel(c.position)}</TableCell>
                    <TableCell>
                      {c.latest_interview_date
                        ? formatDate(c.latest_interview_date, 'MMM d, yyyy')
                        : '—'}
                    </TableCell>
                    <TableCell>
                      {c.latest_scorecard_id ? (
                        <>
                          {c.latest_total_score}
                          <span className="text-muted-foreground">/{MAX_SCORE}</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      {c.latest_fit_band ? (
                        <Badge variant="outline">{FIT_BAND_LABELS[c.latest_fit_band]}</Badge>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge>{STATUS_LABELS[c.status] ?? c.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {c.latest_scorecard_id && (
                        <Link
                          href={`/admin/hiring/${c.latest_scorecard_id}`}
                          className="text-sm text-primary"
                        >
                          View
                        </Link>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
