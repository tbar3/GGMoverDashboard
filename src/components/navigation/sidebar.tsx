'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  ClipboardList,
  BarChart3,
  Briefcase,
  DollarSign,
  Package,
  LogOut,
  Menu,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useState } from 'react';
import { useClerk } from '@clerk/nextjs';
import { useI18n } from '@/lib/i18n';
import { LIVE_AREAS } from '@/lib/nav';

interface NavItem {
  titleKey: string;
  fallback: string;
  href: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

/** Shared nav-link styling, so crew and back-office links stay visually identical. */
const linkClass =
  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors';
const activeClass = 'bg-sidebar-primary text-sidebar-primary-foreground';
const idleClass =
  'text-sidebar-foreground/90 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground';

const employeeNavItems: NavItem[] = [
  {
    titleKey: 'nav.dashboard',
    fallback: 'Dashboard',
    href: '/dashboard',
    icon: <LayoutDashboard className="h-5 w-5" />,
  },
  {
    titleKey: 'nav.my_jobs',
    fallback: 'My Jobs',
    href: '/jobs',
    icon: <Briefcase className="h-5 w-5" />,
  },
  {
    titleKey: 'nav.my_checklists',
    fallback: 'My Checklists',
    href: '/checklists',
    icon: <ClipboardList className="h-5 w-5" />,
  },
  {
    titleKey: 'nav.my_payroll',
    fallback: 'My Payroll',
    href: '/payroll',
    icon: <DollarSign className="h-5 w-5" />,
  },
  {
    titleKey: 'nav.my_stats',
    fallback: 'My Stats',
    href: '/stats',
    icon: <BarChart3 className="h-5 w-5" />,
  },
  {
    titleKey: 'nav.materials',
    fallback: 'Materials',
    href: '/materials',
    icon: <Package className="h-5 w-5" />,
  },
];

/** The hub home — the back-office landing page that sits above the grouped areas. */
const hubHome = {
  title: 'Company Hub',
  href: '/admin',
  icon: <LayoutDashboard className="h-5 w-5" />,
};

interface SidebarProps {
  isAdmin: boolean;
  userName: string;
}

function NavContent({ isAdmin, userName, onLogout }: SidebarProps & { onLogout: () => void }) {
  const pathname = usePathname();
  const { t, locale, setLocale } = useI18n();

  function getTitle(item: NavItem) {
    if (item.titleKey) return t(item.titleKey);
    return item.fallback;
  }

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className="flex h-20 items-center border-b border-sidebar-border px-6">
        <Link href="/dashboard" className="flex items-center">
          <Image
            src="/brand/goodguys-wordmark.png"
            alt="GoodGuys Concierge Moving & Storage"
            width={6933}
            height={1766}
            priority
            sizes="200px"
            className="h-9 w-auto"
          />
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4">
        {/* Employee Section */}
        <div className="space-y-1">
          <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/60">
            {t('nav.my_dashboard')}
          </p>
          {employeeNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(linkClass, pathname === item.href ? activeClass : idleClass)}
            >
              {item.icon}
              {getTitle(item)}
            </Link>
          ))}
        </div>

        {/* Back-office Sections — one group per live area, from the shared nav config. */}
        {isAdmin && (
          <>
            <div className="mt-6 space-y-1">
              <Link
                href={hubHome.href}
                className={cn(linkClass, pathname === hubHome.href ? activeClass : idleClass)}
              >
                {hubHome.icon}
                {hubHome.title}
              </Link>
            </div>

            {LIVE_AREAS.map((area) => (
              <div key={area.key} className="mt-6 space-y-1">
                <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/60">
                  {area.label}
                </p>
                {area.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        linkClass,
                        pathname === item.href ? activeClass : idleClass
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      {item.title}
                    </Link>
                  );
                })}
              </div>
            ))}
          </>
        )}
      </nav>

      {/* Language Toggle + User Section */}
      <div className="border-t border-sidebar-border p-4 space-y-3">
        {/* Language Toggle */}
        <div className="flex items-center justify-center gap-1 rounded-lg bg-sidebar-accent p-1">
          <button
            onClick={() => setLocale('en')}
            className={cn(
              'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              locale === 'en' ? 'bg-sidebar text-sidebar-foreground shadow' : 'text-sidebar-foreground/60 hover:text-sidebar-foreground'
            )}
          >
            English
          </button>
          <button
            onClick={() => setLocale('es')}
            className={cn(
              'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              locale === 'es' ? 'bg-sidebar text-sidebar-foreground shadow' : 'text-sidebar-foreground/60 hover:text-sidebar-foreground'
            )}
          >
            Español
          </button>
        </div>

        {/* User */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-light-blue text-brand-navy font-semibold">
              {userName.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-medium text-sidebar-foreground">{userName}</p>
              <p className="text-xs text-sidebar-foreground/60">{isAdmin ? 'Admin' : t('nav.crew')}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onLogout}
            aria-label="Sign out"
            className="text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function Sidebar({ isAdmin, userName }: SidebarProps) {
  const [open, setOpen] = useState(false);
  const { signOut } = useClerk();

  function handleLogout() {
    signOut({ redirectUrl: '/login' });
  }

  return (
    <>
      {/* Mobile Menu */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 flex h-16 items-center justify-between border-b border-sidebar-border bg-sidebar px-4 text-sidebar-foreground">
        <Link href="/dashboard" className="flex items-center">
          <Image
            src="/brand/goodguys-wordmark.png"
            alt="GoodGuys Concierge Moving & Storage"
            width={6933}
            height={1766}
            priority
            sizes="160px"
            className="h-7 w-auto"
          />
        </Link>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0 bg-sidebar border-sidebar-border">
            <NavContent isAdmin={isAdmin} userName={userName} onLogout={handleLogout} />
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-50 lg:block lg:w-64 lg:border-r lg:border-sidebar-border">
        <NavContent isAdmin={isAdmin} userName={userName} onLogout={handleLogout} />
      </aside>
    </>
  );
}
