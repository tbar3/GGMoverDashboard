import { notFound, redirect } from 'next/navigation';
import { getCurrentEmployee, isBackOffice } from '@/lib/auth';
import { getItem, getItemAttachments, getRenewals } from '@/lib/compliance/queries';
import ItemDetail from './item-detail';

export const dynamic = 'force-dynamic';

export default async function ComplianceItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const employee = await getCurrentEmployee();
  if (!isBackOffice(employee)) redirect('/dashboard');

  const { id } = await params;
  const item = await getItem(id);
  if (!item) notFound();

  const [renewals, attachments] = await Promise.all([
    getRenewals(id),
    getItemAttachments(id),
  ]);

  return (
    <ItemDetail
      item={item}
      renewals={renewals}
      attachments={attachments}
      storageReady={Boolean(process.env.BLOB_READ_WRITE_TOKEN)}
    />
  );
}
