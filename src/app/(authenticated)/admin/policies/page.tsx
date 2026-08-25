import { getAllPolicies } from '@/lib/policies';
import PoliciesAdmin from './policies-admin';

export const dynamic = 'force-dynamic';

export default async function AdminPoliciesPage() {
  const policies = await getAllPolicies();
  return <PoliciesAdmin policies={policies} />;
}
