import { redirect } from 'next/navigation';

export default async function OldVehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/fleet/${id}`);
}
