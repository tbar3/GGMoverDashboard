'use client';

import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';

export function PrintButton() {
  return (
    <Button onClick={() => window.print()} className="print:hidden">
      <Printer className="h-4 w-4 mr-1.5" /> Print / Save as PDF
    </Button>
  );
}
