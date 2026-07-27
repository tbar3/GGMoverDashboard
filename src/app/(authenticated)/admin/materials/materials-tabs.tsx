'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Labels/order match the live materials app Nav exactly.
const TABS = [
  { href: '/admin/materials', label: 'Inventory' },
  { href: '/admin/materials/new-job', label: 'New Job' },
  { href: '/admin/materials/history', label: 'History' },
  { href: '/admin/materials/receive', label: 'Receive' },
  { href: '/admin/materials/adjustments', label: 'Adjust' },
  { href: '/admin/materials/reporting', label: 'Reporting' },
  { href: '/admin/materials/settings', label: 'Admin' },
];

export function MaterialsTabs() {
  const path = usePathname();
  return (
    <nav className="-mx-4 mb-6 overflow-x-auto border-b-2 border-navy-100 px-4 sm:mx-0 sm:px-0">
      <ul className="flex gap-1 whitespace-nowrap pb-2 font-ui text-sm">
        {TABS.map((t) => {
          const active =
            t.href === '/admin/materials' ? path === t.href : path.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                className={`block rounded-lg px-3 py-2 font-semibold transition-colors ${
                  active ? 'bg-navy-700 text-cream-100' : 'text-navy-500 hover:bg-cream-200'
                }`}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
