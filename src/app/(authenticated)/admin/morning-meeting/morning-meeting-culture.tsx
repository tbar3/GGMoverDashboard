'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Heart, PinOff, Pencil, ArrowUp, ArrowDown, Trash2, Plus, ListOrdered } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import {
  CULTURE_KINDS,
  cultureKindLabel,
  type CultureItem,
  type CultureKind,
  type CultureOfDay,
} from '@/lib/morning-meeting-shared';
import {
  saveCultureItem,
  moveCultureItem,
  deleteCultureItem,
  pinCultureOfDay,
  unpinCultureOfDay,
} from '@/lib/morning-meeting-actions';

const textareaClass =
  'w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm ' +
  'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

const selectClass = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm';

type Run = (
  fn: () => Promise<{ ok: boolean; error?: string }>,
  okMessage: string,
  onSuccess?: () => void,
  undo?: { label: string; fn: () => Promise<{ ok: boolean; error?: string }> }
) => void;

/**
 * Culture — one card per meeting: a core value, the mission, the purpose. Rotates
 * to whatever was said longest ago, so every value gets its turn; pin to choose.
 * The list itself is edited from here, in the "Edit culture list" dialog.
 */
export function CultureSection({
  today,
  cultureOfDay,
  items,
  pending,
  run,
}: {
  today: string;
  cultureOfDay: CultureOfDay;
  items: CultureItem[];
  pending: boolean;
  run: Run;
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const { item } = cultureOfDay;
  const needsWording = items.filter((i) => i.active && i.kind !== 'core_value' && !i.body?.trim());
  const rotating = items.filter((i) => i.eligible);

  // last_shown_on includes today's own claim — report coverage before today.
  const priorTimes = item
    ? item.times_shown - (item.last_shown_on === today ? 1 : 0)
    : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Heart className="h-5 w-5 text-primary" />
              Culture
            </CardTitle>
            <CardDescription>
              One core value, the mission or the purpose each morning — longest-unsaid first. Pin
              one to override.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => setEditorOpen(true)}>
            <ListOrdered className="h-4 w-4" />
            Edit culture list
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!item ? (
          <p className="text-sm text-muted-foreground">
            Nothing on the culture list can rotate yet.{' '}
            <button type="button" className="underline" onClick={() => setEditorOpen(true)}>
              Add your core values, mission and purpose
            </button>
            .
          </p>
        ) : (
          <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{cultureKindLabel(item.kind)}</Badge>
              <Badge variant={cultureOfDay.pinned ? 'default' : 'outline'} className="text-[10px]">
                {cultureOfDay.pinned ? 'Pinned for today' : 'Auto-rotated'}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {priorTimes === 0 ? 'First time covered' : `Covered ${priorTimes}× before`}
              </span>
            </div>
            <h3 className="mt-3 text-xl font-semibold">{item.title}</h3>
            {item.body?.trim() ? (
              <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/90">{item.body}</p>
            ) : (
              <p className="mt-2 text-sm italic text-muted-foreground">
                No description yet — ask the room what this one looks like on a job.{' '}
                <button type="button" className="underline not-italic" onClick={() => setEditorOpen(true)}>
                  Add wording
                </button>
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <select
            className={`${selectClass} sm:w-[280px]`}
            value=""
            aria-label="Pin a different culture item for today"
            onChange={(e) =>
              e.target.value &&
              run(() => pinCultureOfDay({ itemId: e.target.value, today }), 'Pinned for today')
            }
          >
            <option value="">Pin a different one for today…</option>
            {rotating.map((i) => (
              <option key={i.id} value={i.id}>
                {cultureKindLabel(i.kind)} · {i.title}
              </option>
            ))}
          </select>
          {cultureOfDay.pinned && (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => run(() => unpinCultureOfDay(today), 'Back to the rotation')}
            >
              <PinOff className="h-4 w-4" />
              Back to rotation
            </Button>
          )}
        </div>

        {needsWording.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Needs wording before it can rotate: {needsWording.map((i) => i.title).join(', ')}.
          </p>
        )}
      </CardContent>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Culture list</DialogTitle>
            <DialogDescription>
              What rotates through the Culture card. Core values rotate even before they have a
              description; the mission, purpose and anything else need wording first.
            </DialogDescription>
          </DialogHeader>
          <CultureEditor items={items} pending={pending} run={run} />
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function CultureEditor({
  items,
  pending,
  run,
}: {
  items: CultureItem[];
  pending: boolean;
  run: Run;
}) {
  // null = nothing open; 'new' = the add form; otherwise the id being edited.
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {items.map((item, index) =>
          editing === item.id ? (
            <li key={item.id}>
              <CultureForm item={item} pending={pending} run={run} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li
              key={item.id}
              className={`rounded-lg border border-border p-3 text-sm ${item.active ? '' : 'opacity-60'}`}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{item.title}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {cultureKindLabel(item.kind)}
                    </Badge>
                    {!item.active && (
                      <Badge variant="outline" className="text-[10px]">
                        Off
                      </Badge>
                    )}
                    {item.active && !item.eligible && (
                      <Badge variant="outline" className="text-[10px] text-amber-700 dark:text-amber-400">
                        Needs wording
                      </Badge>
                    )}
                  </div>
                  {item.body?.trim() && (
                    <p className="mt-1 line-clamp-2 text-muted-foreground">{item.body}</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.times_shown === 0
                      ? 'Not covered yet'
                      : `Covered ${item.times_shown}× · last ${formatDate(item.last_shown_on, 'MMM d')}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Move ${item.title} up`}
                    disabled={pending || index === 0}
                    onClick={() => run(() => moveCultureItem({ id: item.id, direction: 'up' }), 'Moved')}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Move ${item.title} down`}
                    disabled={pending || index === items.length - 1}
                    onClick={() =>
                      run(() => moveCultureItem({ id: item.id, direction: 'down' }), 'Moved')
                    }
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${item.title}`}
                    onClick={() => {
                      setConfirmDelete(null);
                      setEditing(item.id);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {confirmDelete === item.id ? (
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        run(() => deleteCultureItem(item.id), `${item.title} deleted`, () =>
                          setConfirmDelete(null)
                        )
                      }
                    >
                      Delete?
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${item.title}`}
                      onClick={() => setConfirmDelete(item.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            </li>
          )
        )}
      </ul>

      {editing === 'new' ? (
        <CultureForm item={null} pending={pending} run={run} onDone={() => setEditing(null)} />
      ) : (
        <Button variant="outline" size="sm" onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" />
          Add an item
        </Button>
      )}
    </div>
  );
}

function CultureForm({
  item,
  pending,
  run,
  onDone,
}: {
  item: CultureItem | null;
  pending: boolean;
  run: Run;
  onDone: () => void;
}) {
  const [kind, setKind] = useState<CultureKind>(item?.kind ?? 'core_value');
  const [title, setTitle] = useState(item?.title ?? '');
  const [body, setBody] = useState(item?.body ?? '');
  const [active, setActive] = useState(item?.active ?? true);

  function save() {
    run(
      () => saveCultureItem({ id: item?.id, kind, title, body, active }),
      item ? 'Saved' : 'Added',
      onDone
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
      <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
        <div className="space-y-1">
          <Label htmlFor="culture-kind">Kind</Label>
          <select
            id="culture-kind"
            className={selectClass}
            value={kind}
            onChange={(e) => setKind(e.target.value as CultureKind)}
          >
            {CULTURE_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="culture-title">Title</Label>
          <Input
            id="culture-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Radical Hospitality"
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="culture-body">
          {kind === 'core_value' ? 'What it means / what it looks like on a job' : 'The statement'}
        </Label>
        <textarea
          id="culture-body"
          className={textareaClass}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={
            kind === 'core_value'
              ? 'e.g. We treat every customer like family. Booties on, doors propped, the house left cleaner than we found it.'
              : 'Write it the way you want it read out loud.'
          }
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={active} onCheckedChange={(v) => setActive(v === true)} />
        In the rotation
      </label>
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={pending || !title.trim()}>
          {item ? 'Save' : 'Add'}
        </Button>
        <Button size="sm" variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
