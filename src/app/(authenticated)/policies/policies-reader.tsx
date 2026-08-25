'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { BookOpen, FileText, Search, ChevronDown, ChevronRight, Download, Lock } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import {
  POLICY_CATEGORIES,
  policyCategoryLabel,
  localizedPolicy,
  formatBytes,
  type Policy,
  type DocumentRow,
} from '@/lib/policies-shared';

export default function PoliciesReader({
  policies,
  documents,
}: {
  policies: Policy[];
  documents: DocumentRow[];
}) {
  const { locale } = useI18n();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const handbook = documents.filter((d) => d.is_handbook);
  const otherDocs = documents.filter((d) => !d.is_handbook);

  // Search runs over the text the reader is actually shown, so searching in
  // Español matches the Spanish wording rather than the English original.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return policies;
    return policies.filter((p) => {
      const { title, body } = localizedPolicy(p, locale);
      return title.toLowerCase().includes(q) || body.toLowerCase().includes(q);
    });
  }, [policies, search, locale]);

  const byCategory = useMemo(() => {
    return POLICY_CATEGORIES.map((c) => ({
      value: c.value,
      label: policyCategoryLabel(c.value, locale),
      items: visible.filter((p) => p.category === c.value),
    })).filter((c) => c.items.length > 0);
  }, [visible, locale]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Handbook &amp; Policies</h1>
        <p className="text-muted-foreground mt-1">
          {locale === 'es'
            ? 'El manual del empleado, las políticas y los documentos importantes.'
            : 'The employee handbook, company policy, and important documents.'}
        </p>
      </div>

      {handbook.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {handbook.map((d) => (
            <a
              key={d.id}
              href={`/api/documents/${d.id}/download`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 rounded-lg border-2 border-primary/30 bg-primary/5 p-4 transition hover:bg-primary/10"
            >
              <BookOpen className="h-8 w-8 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{d.title}</p>
                <p className="text-xs text-muted-foreground">
                  {d.original_filename} · {formatBytes(d.size_bytes)}
                </p>
              </div>
              <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
            </a>
          ))}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder={locale === 'es' ? 'Buscar políticas…' : 'Search policies…'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {policies.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {locale === 'es'
              ? 'Todavía no hay políticas publicadas.'
              : 'No policies have been published yet.'}
          </CardContent>
        </Card>
      ) : byCategory.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {locale === 'es' ? 'Nada coincide con esa búsqueda.' : 'Nothing matches that search.'}
          </CardContent>
        </Card>
      ) : (
        byCategory.map((cat) => (
          <div key={cat.value} className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {cat.label}
            </h2>
            {cat.items.map((p) => {
              const { title, body, usingFallback } = localizedPolicy(p, locale);
              const isOpen = open === p.id;
              return (
                <Card key={p.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 p-4 text-left"
                    onClick={() => setOpen(isOpen ? null : p.id)}
                  >
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="flex-1 font-medium">{title}</span>
                    {usingFallback && (
                      <Badge variant="outline" className="text-[10px]">
                        English
                      </Badge>
                    )}
                  </button>
                  {isOpen && (
                    <CardContent className="pt-0 pl-10">
                      <p className="whitespace-pre-wrap text-sm text-foreground/90">{body}</p>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        ))
      )}

      {otherDocs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-5 w-5 text-primary" />
              {locale === 'es' ? 'Documentos' : 'Documents'}
            </CardTitle>
            <CardDescription>
              {locale === 'es'
                ? 'Formularios, procedimientos y otros archivos.'
                : 'Forms, SOPs, and other files.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {otherDocs.map((d) => (
                <li key={d.id}>
                  <a
                    href={`/api/documents/${d.id}/download`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 py-3 transition hover:opacity-80"
                  >
                    <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{d.title}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {policyCategoryLabel(d.category, locale)}
                        </Badge>
                        {/* Only ever rendered for back office — crew are filtered
                            out server-side and never receive these rows. */}
                        {d.audience === 'back_office' && (
                          <Badge variant="destructive" className="text-[10px]">
                            <Lock className="h-3 w-3" />
                            Back office
                          </Badge>
                        )}
                      </div>
                      {d.description && (
                        <p className="text-sm text-muted-foreground">{d.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {d.original_filename} · {formatBytes(d.size_bytes)}
                      </p>
                    </div>
                    <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </a>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
