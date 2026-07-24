'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Trash2, Plus } from 'lucide-react';
import type { AdminRow } from '@/lib/materials/admin';
import { createEntity, updateEntity, deleteEntity } from '@/lib/materials/admin-actions';

export type FieldType = 'text' | 'int' | 'num' | 'select' | 'bool';
export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: { value: string; label: string }[];
  placeholder?: string;
  width?: string;
}

type Values = Record<string, string | boolean>;

function initValues(fields: FieldDef[], item?: AdminRow): Values {
  const v: Values = { active: item ? Boolean(item.active) : true };
  for (const f of fields) {
    const raw = item?.[f.key];
    v[f.key] = f.type === 'bool' ? Boolean(raw) : raw == null ? '' : String(raw);
  }
  return v;
}

export function EntitySection({
  table,
  title,
  description,
  items,
  fields,
}: {
  table: string;
  title: string;
  description?: string;
  items: AdminRow[];
  fields: FieldDef[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground">None yet — add one below.</p>
        )}
        {items.map((item) => (
          <Row key={item.id} table={table} fields={fields} item={item} />
        ))}
        <Row table={table} fields={fields} />
      </CardContent>
    </Card>
  );
}

function BoolField({
  field,
  checked,
  onChange,
}: {
  field: FieldDef;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-sm">
      <input
        type="checkbox"
        className="h-4 w-4"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {field.label}
    </label>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: string;
  onChange: (v: string) => void;
}) {
  if (field.type === 'select') {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        style={{ width: field.width ?? '10rem' }}
      >
        <option value="">—</option>
        {field.options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <Input
      value={value}
      placeholder={field.placeholder ?? field.label}
      inputMode={field.type === 'text' ? undefined : 'decimal'}
      onChange={(e) => onChange(e.target.value)}
      style={{ width: field.width ?? (field.type === 'text' ? '14rem' : '6rem') }}
    />
  );
}

// One editable row. With `item` it edits/deletes; without, it's the add row.
function Row({ table, fields, item }: { table: string; fields: FieldDef[]; item?: AdminRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<Values>(() => initValues(fields, item));
  const isNew = !item;

  const dirty = isNew
    ? fields.some((f) => f.type !== 'bool' && String(values[f.key]).trim() !== '')
    : JSON.stringify(values) !== JSON.stringify(initValues(fields, item));

  const set = (k: string, v: string | boolean) => setValues((prev) => ({ ...prev, [k]: v }));

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error ?? 'Something went wrong');
        return;
      }
      toast.success(okMsg);
      if (isNew) setValues(initValues(fields));
      router.refresh();
    });
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-lg border p-2 ${
        isNew ? 'border-dashed' : values.active ? '' : 'opacity-60'
      }`}
    >
      {fields.map((f) =>
        f.type === 'bool' ? (
          <BoolField
            key={f.key}
            field={f}
            checked={Boolean(values[f.key])}
            onChange={(v) => set(f.key, v)}
          />
        ) : (
          <FieldInput
            key={f.key}
            field={f}
            value={String(values[f.key] ?? '')}
            onChange={(v) => set(f.key, v)}
          />
        )
      )}
      <label className="flex items-center gap-1.5 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={Boolean(values.active)}
          onChange={(e) => set('active', e.target.checked)}
        />
        Active
      </label>
      <div className="ml-auto flex items-center gap-2">
        <Button
          size="sm"
          variant={isNew ? 'default' : 'outline'}
          disabled={pending || !dirty}
          onClick={() =>
            isNew
              ? run(() => createEntity(table, values), 'Added')
              : run(() => updateEntity(table, item!.id, values), 'Saved')
          }
        >
          {isNew ? (
            <>
              <Plus className="h-4 w-4 mr-1" /> Add
            </>
          ) : (
            'Save'
          )}
        </Button>
        {!isNew && (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            aria-label="Delete"
            onClick={() => run(() => deleteEntity(table, item!.id), 'Deleted')}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        )}
      </div>
    </div>
  );
}
