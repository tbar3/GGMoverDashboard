'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/admin/materials', label: 'Inventory' },
  { href: '/admin/materials/new-job', label: 'New Job' },
  { href: '/admin/materials/history', label: 'History' },
  { href: '/admin/materials/receive', label: 'Receive' },
  { href: '/admin/materials/adjustments', label: 'Adjustments' },
  { href: '/admin/materials/reporting', label: 'Reporting' },
  { href: '/admin/materials/settings', label: 'Settings' },
];

export function MaterialsTabs() {
  const path = usePathname();
  return (
    <div className="flex flex-wrap gap-1 border-b">
      {TABS.map((t) => {
        const active = t.href === '/admin/materials' ? path === t.href : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              active
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
