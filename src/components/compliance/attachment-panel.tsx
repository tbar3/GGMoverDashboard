'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FileText, Trash2, Upload, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { formatBytes } from '@/lib/policies-shared';
import { formatDate } from '@/lib/utils';
import { uploadAttachment, deleteAttachment } from '@/lib/compliance/attachment-actions';
import type { ComplianceAttachment } from '@/lib/compliance/types';

/**
 * Files attached to one compliance record.
 *
 * Every file is reached through /api/documents/[id]/download — never a blob URL.
 * That route re-checks who is asking and what the document's audience is, which
 * is the only reason these certificates are safe to store at all.
 */
export function AttachmentPanel({
  parentKind,
  parentId,
  attachments,
  storageReady,
  title = 'Files',
  description,
}: {
  parentKind: 'item' | 'renewal' | 'service_log' | 'vehicle';
  parentId: string;
  attachments: ComplianceAttachment[];
  storageReady: boolean;
  title?: string;
  description?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const [fileName, setFileName] = useState('');

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set('parentKind', parentKind);
    formData.set('parentId', parentId);
    startTransition(async () => {
      const result = await uploadAttachment(formData);
      if (!result.ok) {
        toast.error(result.error ?? 'That did not work', { duration: 8000 });
        return;
      }
      formRef.current?.reset();
      setFileName('');
      toast.success('File attached');
      router.refresh();
    });
  }

  function remove(attachment: ComplianceAttachment) {
    if (!window.confirm(`Delete "${attachment.title}"? The file is removed permanently.`)) return;
    startTransition(async () => {
      const result = await deleteAttachment(attachment.id);
      if (!result.ok) {
        toast.error(result.error ?? 'That did not work');
        return;
      }
      toast.success('File deleted');
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-foreground">{title}</h3>
        {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
      </div>

      {attachments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No files yet. Attach the certificate, card, or receipt so it&apos;s here when someone asks
          for it.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {attachments.map((file) => (
            <li key={file.id} className="flex items-center gap-3 p-3">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <a
                  href={`/api/documents/${file.document_id}/download`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 truncate text-sm font-medium text-foreground hover:underline"
                >
                  {file.title}
                  <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                </a>
                <p className="truncate text-xs text-muted-foreground">
                  {file.original_filename}
                  {file.size_bytes ? ` · ${formatBytes(file.size_bytes)}` : ''} ·{' '}
                  {file.uploaded_by_name} · {formatDate(file.created_at, 'MMM d, yyyy')}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete ${file.title}`}
                disabled={pending}
                onClick={() => remove(file)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {storageReady ? (
        <form ref={formRef} onSubmit={submit} className="space-y-3 rounded-lg border border-dashed border-border p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`file-${parentId}`}>File</Label>
              <Input
                id={`file-${parentId}`}
                name="file"
                type="file"
                required
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')}
              />
              <p className="text-xs text-muted-foreground">PDF, image, or Office file up to 25 MB.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`title-${parentId}`}>Label (optional)</Label>
              <Input
                id={`title-${parentId}`}
                name="title"
                placeholder={fileName || 'e.g. 2026 COI'}
              />
              <p className="text-xs text-muted-foreground">Defaults to the filename.</p>
            </div>
          </div>
          <Button type="submit" disabled={pending} size="sm">
            <Upload className="h-4 w-4" />
            {pending ? 'Uploading…' : 'Attach file'}
          </Button>
        </form>
      ) : (
        <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-muted-foreground">
          File storage isn&apos;t connected — uploads are unavailable until{' '}
          <code className="font-mono text-xs">BLOB_READ_WRITE_TOKEN</code> is set.
        </p>
      )}
    </div>
  );
}
