import { redirect } from 'next/navigation';

// Fleet moved out of Compliance: it now manages trucks for Materials and Jobs too.
// Kept so old bookmarks and links still land.
export default function OldFleetPage() {
  redirect('/admin/fleet');
}
