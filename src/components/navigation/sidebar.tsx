'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  CalendarCheck,
  CalendarSync,
  Car,
  AlertTriangle,
  Star,
  Calculator,
  BarChart3,
  Briefcase,
  DollarSign,
  FileSpreadsheet,
  LogOut,
  Menu,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useState } from 'react';
import { useClerk } from '@clerk/nextjs';
import { useI18n, Locale } from '@/lib/i18n';

interface NavItem {
  titleKey: string;
  fallback: string;
  href: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

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
];

const adminNavItems: NavItem[] = [
  { titleKey: '', fallback: 'Admin Dashboard', href: '/admin', icon: <LayoutDashboard className="h-5 w-5" />, adminOnly: true },
  { titleKey: '', fallback: 'Employees', href: '/admin/employees', icon: <Users className="h-5 w-5" />, adminOnly: true },
  { titleKey: '', fallback: 'Jobs', href: '/admin/jobs', icon: <Briefcase className="h-5 w-5" />, adminOnly: true },
  { titleKey: '', fallback: 'Attendance', href: '/admin/attendance', icon: <CalendarCheck className="h-5 w-5" />, adminOnly: true },
  { titleKey: '', fallback: 'Damages', href: '/admin/damages', icon: <AlertTriangle className="h-5 w-5" />, adminOnly: true },
  { titleKey: '', fallback: 'Performance', href: '/admin/performance', icon: <Star className="h-5 w-5" />, adminOnly: true },
  { titleKey: '', fallback: 'Mileage', href: '/admin/mileage', icon: <Car className="h-5 w-5" />, adminOnly: true },
  { titleKey: '', fallback: 'Payroll', href: '/admin/payroll', icon: <DollarSign className="h-5 w-5" />, adminOnly: true },
  { titleKey: '', fallback: 'Calendar Sync', href: '/admin/calendar', icon: <CalendarSync className="h-5 w-5" />, adminOnly: true },
  { titleKey: '', fallback: 'Import Data', href: '/admin/import', icon: <FileSpreadsheet className="h-5 w-5" />, adminOnly: true },
  { titleKey: '', fallback: 'Bonus Calculator', href: '/admin/bonus', icon: <Calculator className="h-5 w-5" />, adminOnly: true },
];

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
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center border-b px-6">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="text-xl font-bold text-blue-600">Good</span>
          <span className="text-xl font-bold text-yellow-500">Guys</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4">
        {/* Employee Section */}
        <div className="space-y-1">
          <p className="px-3 text-xs font-semibold uppercase text-gray-500">
            {t('nav.my_dashboard')}
          </p>
          {employeeNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                pathname === item.href
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-700 hover:bg-gray-100'
              )}
            >
              {item.icon}
              {getTitle(item)}
            </Link>
          ))}
        </div>

        {/* Admin Section */}
        {isAdmin && (
          <div className="mt-6 space-y-1">
            <p className="px-3 text-xs font-semibold uppercase text-gray-500">
              Admin
            </p>
            {adminNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  pathname === item.href
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-700 hover:bg-gray-100'
                )}
              >
                {item.icon}
                {getTitle(item)}
              </Link>
            ))}
          </div>
        )}
      </nav>

      {/* Language Toggle + User Section */}
      <div className="border-t p-4 space-y-3">
        {/* Language Toggle */}
        <div className="flex items-center justify-center gap-1 rounded-lg bg-gray-100 p-1">
          <button
            onClick={() => setLocale('en')}
            className={cn(
              'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              locale === 'en' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            English
          </button>
          <button
            onClick={() => setLocale('es')}
            className={cn(
              'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              locale === 'es' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            Español
          </button>
        </div>

        {/* User */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-blue-600 font-medium">
              {userName.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-medium">{userName}</p>
              <p className="text-xs text-gray-500">{isAdmin ? 'Admin' : t('nav.crew')}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onLogout}>
            <LogOut className="h-5 w-5 text-gray-500" />
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
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 flex h-16 items-center justify-between border-b bg-white px-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="text-xl font-bold text-blue-600">Good</span>
          <span className="text-xl font-bold text-yellow-500">Guys</span>
        </Link>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <NavContent isAdmin={isAdmin} userName={userName} onLogout={handleLogout} />
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-50 lg:block lg:w-64 lg:border-r lg:bg-white">
        <NavContent isAdmin={isAdmin} userName={userName} onLogout={handleLogout} />
      </aside>
    </>
  );
}
