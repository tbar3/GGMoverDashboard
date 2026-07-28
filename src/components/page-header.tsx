'use client';

import { useI18n } from '@/lib/i18n';

/**
 * Translatable page title + subtitle.
 *
 * Page shells are Server Components, so they can't call the client-only `t()` hook —
 * which is why titles like "My Bonus" stayed English while the interactive cards below
 * them translated. Dropping this small client component into a server page fixes that:
 * pass i18n keys and it renders in the viewer's locale.
 */
export function PageHeader({
  titleKey,
  subtitleKey,
  children,
}: {
  titleKey: string;
  subtitleKey?: string;
  /** Custom subtitle content (e.g. dynamic name/role) rendered instead of subtitleKey. */
  children?: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground">{t(titleKey)}</h1>
      {children ? (
        <p className="text-muted-foreground mt-1">{children}</p>
      ) : (
        subtitleKey && <p className="text-muted-foreground mt-1">{t(subtitleKey)}</p>
      )}
    </div>
  );
}
