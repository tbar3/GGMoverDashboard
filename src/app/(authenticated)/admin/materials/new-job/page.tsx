import { getTrucks } from '@/lib/materials/queries';
import { createJob } from '@/lib/materials/actions';
import { NewJobForm } from './new-job-form';

export const dynamic = 'force-dynamic';

export default async function NewJobPage() {
  const trucks = await getTrucks();

  async function start(formData: FormData) {
    'use server';
    const truckId = Number(formData.get('truckId'));
    const date = String(formData.get('date'));
    const storageIn = formData.get('storageIn') === 'on';
    // Header auto-filled from a linked calendar job (blank when entered manually).
    await createJob(truckId, date, storageIn, 'crew', {
      customer: String(formData.get('customer') ?? ''),
      jobNumber: String(formData.get('jobNumber') ?? ''),
      crewLead: String(formData.get('crewLead') ?? ''),
      crew: String(formData.get('crew') ?? ''),
    });
  }

  return <NewJobForm trucks={trucks} action={start} />;
}
