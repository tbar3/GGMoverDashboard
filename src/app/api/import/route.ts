import { currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { IMPORT_HANDLERS } from '@/lib/import-handlers';

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const importType = formData.get('type') as string | null;

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (!importType || !IMPORT_HANDLERS[importType]) {
    return NextResponse.json({ error: 'Invalid import type' }, { status: 400 });
  }

  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });

    // Use first sheet
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

    if (rows.length === 0) {
      return NextResponse.json({ error: 'File is empty or has no data rows' }, { status: 400 });
    }

    const handler = IMPORT_HANDLERS[importType];
    const result = await handler(rows);

    return NextResponse.json({
      ...result,
      total_rows: rows.length,
      columns: Object.keys(rows[0] || {}),
    });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json(
      { error: `Failed to parse file: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
