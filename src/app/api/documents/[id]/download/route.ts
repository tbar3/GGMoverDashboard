import { NextResponse } from 'next/server';
import { get } from '@vercel/blob';
import { requireEmployee, isBackOffice } from '@/lib/auth';
import { getDocumentForDownload } from '@/lib/policies';

/**
 * The only way a document file is served.
 *
 * Blobs are stored with private access, so the storage URL is useless without
 * this route — and this route re-checks the caller every time. A back-office
 * document is invisible to crew here, not merely hidden in the UI that lists it.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireEmployee();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const doc = await getDocumentForDownload(id);

  // Same 404 whether the document is missing or simply not for this caller —
  // a 403 would confirm that a back-office document by that id exists.
  if (!doc || (doc.audience !== 'crew' && !isBackOffice(guard.employee))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Checked AFTER the audience check, so an unauthorized caller still gets the
  // plain 404 above rather than a message that confirms the document exists.
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: 'Document storage is not connected yet. Ask the office to finish setup.' },
      { status: 503 }
    );
  }

  // get() THROWS on missing credentials, a network failure, or a deleted blob —
  // it does not return null. Unhandled, that surfaces to the reader as a 500 with
  // an internal stack trace, so every failure is caught and named here.
  let file;
  try {
    // access must be declared on read too, and the result is a discriminated
    // union on statusCode — only the 200 branch carries a stream.
    file = await get(doc.blob_url, { access: 'private' });
  } catch (err) {
    console.error(`[documents] blob fetch failed for ${id}:`, err);
    return NextResponse.json({ error: 'That file could not be retrieved.' }, { status: 502 });
  }

  if (!file || file.statusCode !== 200) {
    return NextResponse.json({ error: 'File is missing from storage' }, { status: 404 });
  }

  return new NextResponse(file.stream, {
    headers: {
      'Content-Type': doc.content_type ?? file.blob.contentType ?? 'application/octet-stream',
      // inline so a PDF opens in the browser instead of forcing a download —
      // crew are reading the handbook on a phone, not filing it.
      'Content-Disposition': `inline; filename="${encodeURIComponent(doc.original_filename)}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
