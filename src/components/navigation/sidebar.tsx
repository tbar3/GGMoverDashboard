'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  ClipboardList,
  BarChart3,
  Sparkles,
  Briefcase,
  Package,
  BookOpen,
  LogOut,
  Menu,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useState, useRef, useEffect } from 'react';
import { useClerk } from '@clerk/nextjs';
import { useI18n } from '@/lib/i18n';
import { AreaRail } from '@/components/navigation/area-rail';
import { AreaPanel } from '@/components/navigation/area-panel';
import { AreaAccordion } from '@/components/navigation/area-accordion';

/**
 * Two audiences, two shapes.
 *
 * Crew get one short column — five links does not need two levels, and this path
 * is deliberately unchanged. Back office get the area rail plus a panel of the
 * current area's modules, because twenty-five links in one column was taller than
 * the viewport.
 */

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
  // "My Payroll" hidden from crew for now (bonus stays). Route also redirects.
  {
    titleKey: 'nav.my_bonus',
    fallback: 'My Bonus',
    href: '/bonus',
    icon: <Sparkles className="h-5 w-5" />,
  },
  {
    titleKey: 'nav.my_performance',
    fallback: 'My Performance',
    href: '/stats',
    icon: <BarChart3 className="h-5 w-5" />,
  },
  {
    titleKey: 'nav.materials',
    fallback: 'Materials',
    href: '/materials',
    icon: <Package className="h-5 w-5" />,
  },
  {
    titleKey: 'nav.handbook',
    fallback: 'Handbook',
    href: '/policies',
    icon: <BookOpen className="h-5 w-5" />,
  },
];

interface SidebarProps {
  isAdmin: boolean;
  userName: string;
  /**
   * Counts keyed by a nav item's `badgeKey`. Generic on purpose — the next module
   * that needs to shout gets a badge by adding a key, not by editing this file.
   */
  badges?: Record<string, number>;
}

function Logo({ size = 'lg' }: { size?: 'lg' | 'sm' }) {
  return (
    <Link href="/dashboard" className="flex items-center">
      <Image
        src="/brand/goodguys-wordmark.png"
        alt="GoodGuys Concierge Moving & Storage"
        width={6933}
        height={1766}
        priority
        sizes={size === 'lg' ? '200px' : '160px'}
        className={size === 'lg' ? 'h-9 w-auto' : 'h-7 w-auto'}
      />
    </Link>
  );
}

/** Language toggle and the signed-in user. Identical for both audiences. */
function NavFooter({
  userName,
  isAdmin,
  onLogout,
}: {
  userName: string;
  isAdmin: boolean;
  onLogout: () => void;
}) {
  const { t, locale, setLocale } = useI18n();

  return (
    <div className="border-t border-sidebar-border p-4 space-y-3">
      <div className="flex items-center justify-center gap-1 rounded-lg bg-sidebar-accent p-1">
        <button
          onClick={() => setLocale('en')}
          className={cn(
            'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            locale === 'en'
              ? 'bg-sidebar text-sidebar-foreground shadow'
              : 'text-sidebar-foreground/60 hover:text-sidebar-foreground'
          )}
        >
          English
        </button>
        <button
          onClick={() => setLocale('es')}
          className={cn(
            'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            locale === 'es'
              ? 'bg-sidebar text-sidebar-foreground shadow'
              : 'text-sidebar-foreground/60 hover:text-sidebar-foreground'
          )}
        >
          Español
        </button>
      </div>

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
  );
}

/**
 * The crew column — unchanged.
 *
 * Keeps the scroll-into-view effect: this list can still outrun a short phone
 * viewport. The back-office nav no longer needs it, because the panel shows one
 * area at a time rather than all twenty-five links at once.
 */
function CrewNav({ userName, isAdmin, onLogout }: SidebarProps & { onLogout: () => void }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>('[data-active="true"]');
    if (!nav || !active) return;
    const navBox = nav.getBoundingClientRect();
    const itemBox = active.getBoundingClientRect();
    if (itemBox.top < navBox.top || itemBox.bottom > navBox.bottom) {
      nav.scrollTop += itemBox.top - navBox.top - nav.clientHeight / 3;
    }
  }, [pathname]);

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-20 items-center border-b border-sidebar-border px-6">
        <Logo />
      </div>
      <nav ref={navRef} className="flex-1 overflow-y-auto p-4">
        <div className="space-y-1">
          <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/60">
            {t('nav.my_dashboard')}
          </p>
          {employeeNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              data-active={pathname === item.href}
              className={cn(linkClass, pathname === item.href ? activeClass : idleClass)}
            >
              {item.icon}
              {item.titleKey ? t(item.titleKey) : item.fallback}
            </Link>
          ))}
        </div>
      </nav>
      <NavFooter userName={userName} isAdmin={isAdmin} onLogout={onLogout} />
    </div>
  );
}

/** Back office, desktop: rail of areas + panel of the current area's modules. */
function BackOfficeNav({ userName, isAdmin, badges, onLogout }: SidebarProps & { onLogout: () => void }) {
  return (
    <div className="flex h-full bg-sidebar text-sidebar-foreground">
      <AreaRail badges={badges} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-20 items-center border-b border-sidebar-border px-4">
          <Logo />
        </div>
        <AreaPanel badges={badges} />
        <NavFooter userName={userName} isAdmin={isAdmin} onLogout={onLogout} />
      </div>
    </div>
  );
}

/** Back office, touch: one column, areas expand in place. */
function BackOfficeSheetNav({
  userName,
  isAdmin,
  badges,
  onLogout,
}: SidebarProps & { onLogout: () => void }) {
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-20 items-center border-b border-sidebar-border px-6">
        <Logo />
      </div>
      <nav className="flex-1 overflow-y-auto p-4">
        <AreaAccordion badges={badges} />
      </nav>
      <NavFooter userName={userName} isAdmin={isAdmin} onLogout={onLogout} />
    </div>
  );
}

export function Sidebar({ isAdmin, userName, badges }: SidebarProps) {
  const [open, setOpen] = useState(false);
  const { signOut } = useClerk();

  function handleLogout() {
    signOut({ redirectUrl: '/login' });
  }

  const sheetContent = isAdmin ? (
    <BackOfficeSheetNav
      isAdmin={isAdmin}
      userName={userName}
      badges={badges}
      onLogout={handleLogout}
    />
  ) : (
    <CrewNav isAdmin={isAdmin} userName={userName} badges={badges} onLogout={handleLogout} />
  );

  return (
    <>
      {/* Mobile Menu */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 flex h-16 items-center justify-between border-b border-sidebar-border bg-sidebar px-4 text-sidebar-foreground">
        <Logo size="sm" />
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
          <SheetContent side="left" className="w-72 p-0 bg-sidebar border-sidebar-border">
            {sheetContent}
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop Sidebar. Width is a constant per audience so the layout can
          reserve it without knowing the pathname: 296px for the rail + panel,
          256px for the single crew column. */}
      <aside
        className={cn(
          'hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-50 lg:block lg:border-r lg:border-sidebar-border',
          isAdmin ? 'lg:w-[296px]' : 'lg:w-64'
        )}
      >
        {isAdmin ? (
          <BackOfficeNav
            isAdmin={isAdmin}
            userName={userName}
            badges={badges}
            onLogout={handleLogout}
          />
        ) : (
          <CrewNav isAdmin={isAdmin} userName={userName} badges={badges} onLogout={handleLogout} />
        )}
      </aside>
    </>
  );
}
