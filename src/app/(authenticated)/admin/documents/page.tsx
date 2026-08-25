import { getDocuments } from '@/lib/policies';
import DocumentsAdmin from './documents-admin';

export const dynamic = 'force-dynamic';

export default async function AdminDocumentsPage() {
  // Back office view — the guard is the /admin layout; passing true here is what
  // makes back-office-only documents visible on this page and nowhere else.
  const documents = await getDocuments(true);
  const storageReady = !!process.env.BLOB_READ_WRITE_TOKEN;
  return <DocumentsAdmin documents={documents} storageReady={storageReady} />;
}
