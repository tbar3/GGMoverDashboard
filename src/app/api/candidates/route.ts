import { query, queryOne } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireBackOffice } from '@/lib/auth';

/** Hiring is back office only — crew never see candidate records. */

export async function GET(request: NextRequest) {
  const guard = await requireBackOffice();
  if (!guard.ok) return guard.response;

  const status = request.nextUrl.searchParams.get('status');

  // Each candidate with their latest scorecard summary, for the list view.
  const sql = `
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
    ${status ? 'WHERE c.status = $1' : ''}
    ORDER BY c.created_at DESC
  `;

  return NextResponse.json(await query(sql, status ? [status] : []));
}

export async function POST(request: NextRequest) {
  const guard = await requireBackOffice();
  if (!guard.ok) return guard.response;

  const body = await request.json();

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'Candidate name is required' }, { status: 400 });
  }
  if (!body.position) {
    return NextResponse.json({ error: 'Position is required' }, { status: 400 });
  }

  const row = await queryOne(
    `INSERT INTO candidates (name, phone, position, referred_by, status)
     VALUES ($1, $2, $3, $4, COALESCE($5, 'interviewed'))
     RETURNING *`,
    [
      body.name.trim(),
      body.phone ?? null,
      body.position,
      body.referred_by ?? null,
      body.status ?? null,
    ]
  );

  return NextResponse.json(row, { status: 201 });
}
