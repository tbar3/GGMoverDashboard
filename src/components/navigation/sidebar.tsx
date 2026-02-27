'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  CalendarCheck,
  Car,
  AlertTriangle,
  Star,
  Calculator,
  BarChart3,
  Briefcase,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

interface NavItem {
  title: string;
  href: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const employeeNavItems: NavItem[] = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: <LayoutDashboard className="h-5 w-5" />,
  },
  {
    title: 'My Checklists',
    href: '/checklists',
    icon: <ClipboardList className="h-5 w-5" />,
  },
  {
    title: 'My Stats',
    href: '/stats',
    icon: <BarChart3 className="h-5 w-5" />,
  },
];

const adminNavItems: NavItem[] = [
  {
    title: 'Admin Dashboard',
    href: '/admin',
    icon: <LayoutDashboard className="h-5 w-5" />,
    adminOnly: true,
  },
  {
    title: 'Employees',
    href: '/admin/employees',
    icon: <Users className="h-5 w-5" />,
    adminOnly: true,
  },
  {
    title: 'Jobs',
    href: '/admin/jobs',
    icon: <Briefcase className="h-5 w-5" />,
    adminOnly: true,
  },
  {
    title: 'Attendance',
    href: '/admin/attendance',
    icon: <CalendarCheck className="h-5 w-5" />,
    adminOnly: true,
  },
  {
    title: 'Damages',
    href: '/admin/damages',
    icon: <AlertTriangle className="h-5 w-5" />,
    adminOnly: true,
  },
  {
    title: 'Performance',
    href: '/admin/performance',
    icon: <Star className="h-5 w-5" />,
    adminOnly: true,
  },
  {
    title: 'Mileage',
    href: '/admin/mileage',
    icon: <Car className="h-5 w-5" />,
    adminOnly: true,
  },
  {
    title: 'Bonus Calculator',
    href: '/admin/bonus',
    icon: <Calculator className="h-5 w-5" />,
    adminOnly: true,
  },
];

interface SidebarProps {
  isAdmin: boolean;
  userName: string;
}

function NavContent({ isAdmin, userName, onLogout }: SidebarProps & { onLogout: () => void }) {
  const pathname = usePathname();

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
            My Dashboard
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
              {item.title}
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
                {item.title}
              </Link>
            ))}
          </div>
        )}
      </nav>

      {/* User Section */}
      <div className="border-t p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-blue-600 font-medium">
              {userName.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-medium">{userName}</p>
              <p className="text-xs text-gray-500">{isAdmin ? 'Admin' : 'Crew'}</p>
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
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
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
