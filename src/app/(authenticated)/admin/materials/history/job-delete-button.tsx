'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteJob } from '@/lib/materials/actions';

export default function JobDeleteButton({ jobId, label }: { jobId: number; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onDelete = () => {
    if (
      !window.confirm(
        `Delete ${label}? If it was completed, its inventory effect is reversed (stock restored). This can't be undone.`
      )
    )
      return;
    startTransition(async () => {
      await deleteJob(jobId);
      router.refresh();
    });
  };

  return (
    <button
      onClick={onDelete}
      disabled={pending}
      className="font-ui font-semibold text-red-500 hover:underline disabled:opacity-50"
    >
      {pending ? '…' : 'Delete'}
    </button>
  );
}
