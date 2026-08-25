import { redirect } from 'next/navigation';
import { getCurrentEmployee, isBackOffice } from '@/lib/auth';
import { getPublishedPolicies, getDocuments } from '@/lib/policies';
import PoliciesReader from './policies-reader';

export const dynamic = 'force-dynamic';

/**
 * The crew-facing handbook. This is the first hub surface crew see that back
 * office also uses, so the audience filter is applied from the caller's own
 * identity — never from anything the browser sends.
 */
export default async function PoliciesPage() {
  const employee = await getCurrentEmployee();
  if (!employee) redirect('/login');

  const [policies, documents] = await Promise.all([
    getPublishedPolicies(),
    getDocuments(isBackOffice(employee)),
  ]);

  return <PoliciesReader policies={policies} documents={documents} />;
}
