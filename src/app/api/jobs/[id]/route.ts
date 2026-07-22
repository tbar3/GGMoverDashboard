import { queryOne } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireBackOffice } from '@/lib/auth';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireBackOffice();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const job = await queryOne('SELECT * FROM jobs WHERE id = $1', [id]);
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  return NextResponse.json(job);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireBackOffice();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const body = await request.json();

  // Only allow updating crew_ids for now
  if (body.crew_ids) {
    const job = await queryOne(
      'UPDATE jobs SET crew_ids = $1 WHERE id = $2 RETURNING *',
      [body.crew_ids, id]
    );
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    return NextResponse.json(job);
  }

  return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
}
