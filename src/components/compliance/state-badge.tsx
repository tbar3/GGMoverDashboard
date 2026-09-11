import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { STATE_LABELS } from '@/lib/compliance/status';
import type { PmState } from '@/lib/compliance/types';

/**
 * The one place a derived compliance state becomes a colour.
 *
 * Four states, four distinct readings — and the amber "due soon" is a className
 * rather than a Badge variant because the shared Badge has no warning variant and
 * adding one would change every other module's palette.
 */
const STYLES: Record<PmState, { variant: 'destructive' | 'secondary' | 'outline'; className?: string }> = {
  expired: { variant: 'destructive' },
  due_soon: {
    variant: 'outline',
    className: 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  },
  ok: {
    variant: 'outline',
    className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  },
  no_expiry: { variant: 'secondary' },
  unknown: { variant: 'outline', className: 'text-muted-foreground' },
};

export function StateBadge({
  state,
  daysUntil,
  className,
}: {
  state: PmState;
  /** Days until expiry — negative once overdue. Turns the badge into a countdown. */
  daysUntil?: number | null;
  className?: string;
}) {
  const style = STYLES[state] ?? STYLES.unknown;
  return (
    <Badge variant={style.variant} className={cn(style.className, className)}>
      {label(state, daysUntil)}
    </Badge>
  );
}

function label(state: PmState, daysUntil?: number | null): string {
  if (daysUntil == null) return STATE_LABELS[state];
  if (state === 'expired') {
    const overdue = Math.abs(daysUntil);
    return overdue === 0 ? 'Expires today' : `${overdue}d overdue`;
  }
  if (state === 'due_soon') return daysUntil === 0 ? 'Expires today' : `${daysUntil}d left`;
  return STATE_LABELS[state];
}
