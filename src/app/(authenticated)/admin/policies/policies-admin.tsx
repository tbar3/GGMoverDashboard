'use client';

import { useState, useTransition, useMemo } from 'react';
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
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Archive,
  RotateCcw,
  AlertTriangle,
  Search,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  POLICY_CATEGORIES,
  policyCategoryLabel,
  type Policy,
} from '@/lib/policies-shared';
import {
  savePolicy,
  setPolicyStatus,
  setPolicyRotation,
  deletePolicy,
} from '@/lib/policies-actions';

const textareaClass =
  'w-full min-h-[160px] rounded-md border border-input bg-background px-3 py-2 text-sm ' +
  'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

type Result = { ok: boolean; error?: string };

export default function PoliciesAdmin({ policies }: { policies: Policy[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<Policy | 'new' | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  function run(fn: () => Promise<Result>, okMessage: string, onSuccess?: () => void) {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        toast.error(result.error ?? 'That did not work');
        return;
      }
      onSuccess?.();
      toast.success(okMessage);
      router.refresh();
    });
  }

  const needsReview = policies.filter((p) => p.needs_review).length;
  const published = policies.filter((p) => p.status === 'published').length;
  const drafts = policies.filter((p) => p.status === 'draft').length;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return policies.filter((p) => {
      if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.body_en.toLowerCase().includes(q) ||
        (p.title_es ?? '').toLowerCase().includes(q)
      );
    });
  }, [policies, search, categoryFilter]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Policies</h1>
          <p className="text-muted-foreground mt-1">
            The handbook, written here. Published policies are readable by every employee and feed
            the Morning Meeting rotation.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/admin/documents">
              <FileText className="h-4 w-4" />
              Documents
            </Link>
          </Button>
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" />
            New policy
          </Button>
        </div>
      </div>

      {needsReview > 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {needsReview} draft {needsReview === 1 ? 'policy needs' : 'policies need'} your wording
            </CardTitle>
            <CardDescription>
              These were drafted from rules found in the app&apos;s code, not from your handbook, so
              the wording is a best guess. They are kept as <strong>drafts</strong> — crew cannot see
              them and they do not rotate in the Morning Meeting. Edit one to clear the flag, then
              publish it when the wording is right.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search policies…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {POLICY_CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          {published} published · {drafts} draft
        </span>
      </div>

      {visible.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {policies.length === 0
              ? 'No policies yet. Add one, or upload the handbook on the Documents page.'
              : 'Nothing matches that search.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {visible.map((p) => (
            <Card key={p.id} className={p.status === 'archived' ? 'opacity-60' : undefined}>
              <CardContent className="flex flex-wrap items-start gap-3 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{p.title}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {policyCategoryLabel(p.category)}
                    </Badge>
                    <Badge
                      variant={
                        p.status === 'published'
                          ? 'default'
                          : p.status === 'draft'
                            ? 'secondary'
                            : 'outline'
                      }
                      className="text-[10px]"
                    >
                      {p.status}
                    </Badge>
                    {p.status === 'published' && !p.in_rotation && (
                      <Badge variant="outline" className="text-[10px]">
                        Not in rotation
                      </Badge>
                    )}
                    {p.needs_review && (
                      <Badge variant="destructive" className="text-[10px]">
                        Unverified wording
                      </Badge>
                    )}
                    {!p.body_es?.trim() && (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        No Español
                      </Badge>
                    )}
                  </div>
                  {p.body_en && (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.body_en}</p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  {p.status === 'published' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      title={p.in_rotation ? 'Take out of the daily rotation' : 'Put back in the rotation'}
                      onClick={() =>
                        run(
                          () => setPolicyRotation(p.id, !p.in_rotation),
                          p.in_rotation ? 'Out of the rotation' : 'Back in the rotation'
                        )
                      }
                    >
                      {p.in_rotation ? (
                        <Eye className="h-3.5 w-3.5" />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  ) : null}
                  {p.status !== 'published' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => run(() => setPolicyStatus(p.id, 'published'), 'Published')}
                    >
                      Publish
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      title="Archive — hides it from crew but keeps its history"
                      onClick={() => run(() => setPolicyStatus(p.id, 'archived'), 'Archived')}
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {p.status === 'archived' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      title="Back to draft"
                      onClick={() => run(() => setPolicyStatus(p.id, 'draft'), 'Back to draft')}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive"
                    disabled={pending}
                    title="Delete permanently — archiving keeps the meeting history readable"
                    onClick={() => run(() => deletePolicy(p.id), 'Deleted')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <PolicyDialog
        target={editing}
        onClose={() => setEditing(null)}
        pending={pending}
        run={run}
      />
    </div>
  );
}

/**
 * Opened by the parent flipping `open`. Radix only fires onOpenChange for changes
 * it initiates, so the form is a keyed child rendered while open — it mounts with
 * its state already seeded rather than seeding in an effect.
 */
function PolicyDialog({
  target,
  onClose,
  pending,
  run,
}: {
  target: Policy | 'new' | null;
  onClose: () => void;
  pending: boolean;
  run: (fn: () => Promise<Result>, okMessage: string, onSuccess?: () => void) => void;
}) {
  const existing = target && target !== 'new' ? target : null;
  return (
    <Dialog
      open={!!target}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {target && (
          <PolicyForm
            key={existing?.id ?? 'new'}
            existing={existing}
            onClose={onClose}
            pending={pending}
            run={run}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PolicyForm({
  existing,
  onClose,
  pending,
  run,
}: {
  existing: Policy | null;
  onClose: () => void;
  pending: boolean;
  run: (fn: () => Promise<Result>, okMessage: string, onSuccess?: () => void) => void;
}) {
  const [title, setTitle] = useState(existing?.title ?? '');
  const [titleEs, setTitleEs] = useState(existing?.title_es ?? '');
  const [bodyEn, setBodyEn] = useState(existing?.body_en ?? '');
  const [bodyEs, setBodyEs] = useState(existing?.body_es ?? '');
  const [category, setCategory] = useState(existing?.category ?? 'general');
  const [status, setStatus] = useState(existing?.status ?? 'draft');
  const [inRotation, setInRotation] = useState(existing?.in_rotation ?? true);
  const [lang, setLang] = useState<'en' | 'es'>('en');

  return (
    <>
      <DialogHeader>
        <DialogTitle>{existing ? 'Edit policy' : 'New policy'}</DialogTitle>
        <DialogDescription>
          English is required to publish. Spanish is optional — crew who read in Español fall back
          to the English text until it&apos;s filled in.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="flex gap-1 rounded-md bg-muted p-1 w-fit">
          {(['en', 'es'] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={`rounded px-3 py-1 text-sm ${
                lang === l ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'
              }`}
            >
              {l === 'en' ? 'English' : 'Español'}
            </button>
          ))}
        </div>

        {lang === 'en' ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="policy-title">Title</Label>
              <Input
                id="policy-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Report every damage, same day"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="policy-body">Policy text</Label>
              <textarea
                id="policy-body"
                className={textareaClass}
                value={bodyEn}
                onChange={(e) => setBodyEn(e.target.value)}
                placeholder="The policy in full, in the words you'd use with the crew."
              />
            </div>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="policy-title-es">Título (Español)</Label>
              <Input
                id="policy-title-es"
                value={titleEs}
                onChange={(e) => setTitleEs(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="policy-body-es">Texto de la política</Label>
              <textarea
                id="policy-body-es"
                className={textareaClass}
                value={bodyEs}
                onChange={(e) => setBodyEs(e.target.value)}
                placeholder="Optional — leave blank and crew see the English text."
              />
            </div>
          </>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
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
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft — only back office</SelectItem>
                <SelectItem value="published">Published — crew can read it</SelectItem>
                <SelectItem value="archived">Archived — retired</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4"
            checked={inRotation}
            onChange={(e) => setInRotation(e.target.checked)}
          />
          <span>
            Include in the Morning Meeting rotation
            <span className="block text-xs text-muted-foreground">
              Uncheck for long policies that are worth publishing but not worth reading out at 7:15.
            </span>
          </span>
        </label>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={pending || !title.trim()}
          onClick={() => {
            run(
              () => savePolicy({ id: existing?.id, title, titleEs, bodyEn, bodyEs, category, status, inRotation }),
              existing ? 'Policy updated' : 'Policy added',
              onClose
            );
          }}
        >
          Save
        </Button>
      </DialogFooter>
    </>
  );
}
