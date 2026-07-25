'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { RefreshCw, Unplug } from 'lucide-react';
import { disconnectQuickBooks, testQuickBooks } from '@/lib/quickbooks-actions';

export function QuickBooksControls() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [company, setCompany] = useState<string | null>(null);

  function test() {
    startTransition(async () => {
      const res = await testQuickBooks();
      if (res.ok) {
        setCompany(res.company ?? 'Connected');
        toast.success(`Connected to ${res.company}`);
        router.refresh();
      } else {
        toast.error(res.error ?? 'Test failed');
      }
    });
  }

  function disconnect() {
    if (!window.confirm('Disconnect QuickBooks? Tokens will be revoked and cleared.')) return;
    startTransition(async () => {
      const res = await disconnectQuickBooks();
      if (res.ok) {
        toast.success('Disconnected');
        router.refresh();
      } else {
        toast.error(res.error ?? 'Could not disconnect');
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" onClick={test} disabled={pending}>
        <RefreshCw className="h-4 w-4 mr-1.5" /> Test connection
      </Button>
      <Button variant="ghost" onClick={disconnect} disabled={pending}>
        <Unplug className="h-4 w-4 mr-1.5" /> Disconnect
      </Button>
      {company && <span className="text-sm text-muted-foreground">Verified: {company}</span>}
    </div>
  );
}
