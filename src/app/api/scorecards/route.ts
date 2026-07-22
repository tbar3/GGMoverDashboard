import { query, queryOne } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireBackOffice } from '@/lib/auth';
import { tallyScores } from '@/lib/interview-scorecard';

/** Interview scorecards. Back office only. */

export async function GET(request: NextRequest) {
  const guard = await requireBackOffice();
  if (!guard.ok) return guard.response;

  const candidateId = request.nextUrl.searchParams.get('candidate_id');

  const sql = `
    SELECT s.*, c.name AS candidate_name, c.position AS candidate_position
    FROM interview_scorecards s
    JOIN candidates c ON c.id = s.candidate_id
    ${candidateId ? 'WHERE s.candidate_id = $1' : ''}
    ORDER BY s.interview_date DESC, s.created_at DESC
  `;

  return NextResponse.json(await query(sql, candidateId ? [candidateId] : []));
}

export async function POST(request: NextRequest) {
  const guard = await requireBackOffice();
  if (!guard.ok) return guard.response;

  const body = await request.json();

  if (!body.candidate_id) {
    return NextResponse.json({ error: 'candidate_id is required' }, { status: 400 });
  }
  if (!body.interview_date) {
    return NextResponse.json({ error: 'interview_date is required' }, { status: 400 });
  }

  // The score is always recomputed server-side from the raw per-question values.
  // Trusting a client-sent total would let the summary disagree with the answers.
  const responses = body.responses ?? {};
  const { total, scoredCount, band } = tallyScores(responses.scores ?? {});

  const row = await queryOne(
    `INSERT INTO interview_scorecards
       (candidate_id, interviewer_id, interviewer_name, interview_date,
        total_score, scored_count, fit_band, recommendation, responses, final_notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      body.candidate_id,
      guard.employee.id,
      body.interviewer_name?.trim() || guard.employee.name,
      body.interview_date,
      total,
      scoredCount,
      band,
      body.recommendation ?? null,
      JSON.stringify(responses),
      body.final_notes ?? null,
    ]
  );

  // A recommendation on the scorecard is the candidate's status.
  if (body.recommendation) {
    await query('UPDATE candidates SET status = $1, updated_at = NOW() WHERE id = $2', [
      body.recommendation,
      body.candidate_id,
    ]);
  }

  return NextResponse.json(row, { status: 201 });
}
