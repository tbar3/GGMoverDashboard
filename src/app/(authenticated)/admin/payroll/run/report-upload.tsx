'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';

interface ImportResult {
  imported: number;
  unmatched: string[];
  weekStart: string;
  period: { start: string | null; end: string | null };
  flags: string[];
}

/** Upload the raw SmartMoving payroll detail report → compute & save the week. */
export function ReportUpload() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function onFile(file: File) {
    setBusy(true);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/payroll/report-import', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Import failed');
        return;
      }
      setResult(data);
      toast.success(`Imported ${data.imported} employees for week of ${data.weekStart}`);
      router.push(`/admin/payroll/run?week=${data.weekStart}`);
      router.refresh();
    } catch {
      toast.error('Import failed');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
        <Button onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
          {busy ? 'Importing…' : 'Upload SmartMoving payroll report'}
        </Button>
      </div>

      {result && (
        <div className="rounded-lg border p-3 text-sm space-y-1 bg-muted">
          <p>
            Imported <span className="font-medium">{result.imported}</span> employees ·{' '}
            week of {result.weekStart}
            {result.period.start && ` (${result.period.start} – ${result.period.end})`}
          </p>
          {result.unmatched.length > 0 && (
            <p className="text-amber-600 dark:text-amber-500">
              Not matched to an employee: {result.unmatched.join(', ')}
            </p>
          )}
          {result.flags.length > 0 && (
            <ul className="text-amber-600 dark:text-amber-500 list-disc pl-5">
              {result.flags.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
