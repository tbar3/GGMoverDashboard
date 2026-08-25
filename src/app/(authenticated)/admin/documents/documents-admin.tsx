'use client';

import { useState, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FileText,
  Upload,
  Trash2,
  Pencil,
  BookOpen,
  Lock,
  Users,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';
import {
  POLICY_CATEGORIES,
  DOCUMENT_AUDIENCES,
  policyCategoryLabel,
  formatBytes,
  type DocumentRow,
} from '@/lib/policies-shared';
import { uploadDocument, updateDocument, deleteDocument } from '@/lib/policies-actions';

type Result = { ok: boolean; error?: string };

export default function DocumentsAdmin({
  documents,
  storageReady,
}: {
  documents: DocumentRow[];
  storageReady: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<DocumentRow | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [fileName, setFileName] = useState('');

  function run(fn: () => Promise<Result>, okMessage: string, onSuccess?: () => void) {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        toast.error(result.error ?? 'That did not work', { duration: 8000 });
        return;
      }
      onSuccess?.();
      toast.success(okMessage);
      router.refresh();
    });
  }

  function submitUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    run(() => uploadDocument(formData), 'Uploaded', () => {
      formRef.current?.reset();
      setFileName('');
    });
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Documents</h1>
          <p className="text-muted-foreground mt-1">
            The handbook and any file the crew needs. Files are stored privately — crew reach them
            through the app, never a public link.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/admin/policies">
            <BookOpen className="h-4 w-4" />
            Policies
          </Link>
        </Button>
      </div>

      {!storageReady && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Document storage isn&apos;t connected yet
            </CardTitle>
            <CardDescription>
              Uploads will fail until a Vercel Blob store is linked to this project and{' '}
              <code className="font-mono text-xs">BLOB_READ_WRITE_TOKEN</code> is available. Everything
              else on this page works; only the upload itself is blocked.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Upload a document
          </CardTitle>
          <CardDescription>
            PDF, Word, Excel, images, or plain text. Up to 25 MB.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form ref={formRef} onSubmit={submitUpload} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="file">File</Label>
              <Input
                id="file"
                name="file"
                type="file"
                required
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.txt"
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  name="title"
                  placeholder={fileName || 'Defaults to the filename'}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input id="description" name="description" placeholder="Optional" />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select name="category" defaultValue="general">
                  <SelectTrigger id="category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {POLICY_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="audience">Who can see it</Label>
                <Select name="audience" defaultValue="crew">
                  <SelectTrigger id="audience">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_AUDIENCES.map((a) => (
                      <SelectItem key={a.value} value={a.value}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isHandbook" value="true" className="h-4 w-4" />
              This is the employee handbook — pin it to the top for crew
            </label>
            <Button type="submit" disabled={pending}>
              <Upload className="h-4 w-4" />
              {pending ? 'Uploading…' : 'Upload'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{documents.length} document{documents.length === 1 ? '' : 's'}</CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing uploaded yet. Start with the handbook.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {documents.map((d) => (
                <li key={d.id} className="flex flex-wrap items-start gap-3 py-3">
                  <FileText className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{d.title}</span>
                      {d.is_handbook && (
                        <Badge className="text-[10px]">
                          <BookOpen className="h-3 w-3" />
                          Handbook
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[10px]">
                        {policyCategoryLabel(d.category)}
                      </Badge>
                      <Badge
                        variant={d.audience === 'crew' ? 'secondary' : 'destructive'}
                        className="text-[10px]"
                      >
                        {d.audience === 'crew' ? (
                          <>
                            <Users className="h-3 w-3" />
                            Crew
                          </>
                        ) : (
                          <>
                            <Lock className="h-3 w-3" />
                            Back office
                          </>
                        )}
                      </Badge>
                    </div>
                    {d.description && (
                      <p className="mt-0.5 text-sm text-muted-foreground">{d.description}</p>
                    )}
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {d.original_filename} · {formatBytes(d.size_bytes)} · {d.uploaded_by_name} ·{' '}
                      {formatDate(d.created_at, 'MMM d, yyyy')}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button size="sm" variant="ghost" asChild>
                      <a href={`/api/documents/${d.id}/download`} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open
                      </a>
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(d)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      disabled={pending}
                      title="Delete the record and the stored file"
                      onClick={() => run(() => deleteDocument(d.id), 'Deleted')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent>
          {editing && (
            <DocumentForm
              key={editing.id}
              doc={editing}
              onClose={() => setEditing(null)}
              pending={pending}
              run={run}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DocumentForm({
  doc,
  onClose,
  pending,
  run,
}: {
  doc: DocumentRow;
  onClose: () => void;
  pending: boolean;
  run: (fn: () => Promise<Result>, okMessage: string, onSuccess?: () => void) => void;
}) {
  const [title, setTitle] = useState(doc.title);
  const [description, setDescription] = useState(doc.description ?? '');
  const [category, setCategory] = useState(doc.category);
  const [audience, setAudience] = useState(doc.audience);
  const [isHandbook, setIsHandbook] = useState(doc.is_handbook);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit document</DialogTitle>
        <DialogDescription>
          Changes the record, not the file. To replace the file itself, upload a new one and delete
          this.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="doc-title">Title</Label>
          <Input id="doc-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="doc-desc">Description</Label>
          <Input
            id="doc-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {POLICY_CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Who can see it</Label>
          <Select value={audience} onValueChange={setAudience}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOCUMENT_AUDIENCES.map((a) => (
                <SelectItem key={a.value} value={a.value}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={isHandbook}
            onChange={(e) => setIsHandbook(e.target.checked)}
          />
          Pin to the top for crew as the handbook
        </label>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={pending || !title.trim()}
          onClick={() =>
            run(
              () => updateDocument({ id: doc.id, title, description, category, audience, isHandbook }),
              'Document updated',
              onClose
            )
          }
        >
          Save
        </Button>
      </DialogFooter>
    </>
  );
}
