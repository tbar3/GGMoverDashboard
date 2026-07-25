import {
  Users,
  UserPlus,
  CalendarSync,
  Car,
  AlertTriangle,
  Star,
  TrendingUp,
  Link2,
  ShieldCheck,
  Briefcase,
  DollarSign,
  FileSpreadsheet,
  Package,
  BookOpen,
  Target,
  MessageSquare,
  Award,
  type LucideIcon,
} from 'lucide-react';

/**
 * The back-office information architecture, in one place.
 *
 * Both the sidebar and the hub home render from this list, so a module can never
 * appear in one and not the other. When a new module ships: add its pages here and
 * flip the area's `status` to 'live'.
 *
 * `status: 'planned'` areas are shown on the hub home as "coming soon" cards but are
 * deliberately NOT rendered in the sidebar — a nav link to a route that doesn't exist
 * is a dead link, and dead links erode trust in the whole nav.
 */

export interface NavItem {
  title: string;
  href: string;
  description: string;
  icon: LucideIcon;
}

export interface NavArea {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  status: 'live' | 'planned';
  items: NavItem[];
}

export const BACK_OFFICE_AREAS: NavArea[] = [
  {
    key: 'operations',
    label: 'Operations',
    description: 'Jobs, scheduling, and the daily run of the business.',
    icon: Briefcase,
    status: 'live',
    items: [
      {
        title: 'Jobs',
        href: '/admin/jobs',
        description: 'Every move, its crew, and its outcome',
        icon: Briefcase,
      },
      {
        title: 'Profitability',
        href: '/admin/profitability',
        description: 'P&L, job-by-job margins, weekly & monthly',
        icon: TrendingUp,
      },
      {
        title: 'Calendar Sync',
        href: '/admin/calendar',
        description: 'Pull jobs in from SmartMoving',
        icon: CalendarSync,
      },
      {
        title: 'Import Data',
        href: '/admin/import',
        description: 'Bulk CSV and Excel import',
        icon: FileSpreadsheet,
      },
      {
        title: 'QuickBooks',
        href: '/admin/quickbooks',
        description: 'Two-way sync with QuickBooks Online',
        icon: Link2,
      },
    ],
  },
  {
    key: 'people',
    label: 'People',
    description: 'The crew, what they earn, and how they perform.',
    icon: Users,
    status: 'live',
    items: [
      {
        title: 'Employees',
        href: '/admin/employees',
        description: 'Roster, roles, and tenure',
        icon: Users,
      },
      {
        title: 'Payroll',
        href: '/admin/payroll',
        description: 'Hours and pay by week',
        icon: DollarSign,
      },
      {
        title: 'Performance',
        href: '/admin/performance',
        description: 'Attendance, strikes, and positives that drive the weekly bonus',
        icon: Star,
      },
      {
        title: 'Damages',
        href: '/admin/damages',
        description: 'Claims and their pool impact',
        icon: AlertTriangle,
      },
      {
        title: 'Mileage',
        href: '/admin/mileage',
        description: 'Reimbursement at $0.60/mi',
        icon: Car,
      },
      {
        title: 'Hiring',
        href: '/admin/hiring',
        description: 'Interview scorecards and candidates',
        icon: UserPlus,
      },
      {
        title: 'Pay Scale & Skills',
        href: '/admin/skills',
        description: 'Base rate and the skills that raise it',
        icon: Award,
      },
      {
        title: 'Tenure Bonus',
        href: '/admin/tenure-bonus',
        description: 'Bi-annual pool split by months worked',
        icon: DollarSign,
      },
      {
        title: 'Message Board',
        href: '/admin/messages',
        description: 'Post announcements to the crew',
        icon: MessageSquare,
      },
      {
        title: 'Admin Settings',
        href: '/admin/settings',
        description: 'Admin team roles and company locations',
        icon: ShieldCheck,
      },
    ],
  },
  {
    key: 'materials',
    label: 'Materials',
    description: 'Trucks, warehouses, and the supply catalog.',
    icon: Package,
    status: 'live',
    items: [
      {
        title: 'Materials Settings',
        href: '/admin/materials',
        description: 'Trucks, warehouses, materials, equipment, routines, crew',
        icon: Package,
      },
    ],
  },
  {
    key: 'policies',
    label: 'Policies',
    description: 'The handbook, SOPs, and standing company policy in one searchable place.',
    icon: BookOpen,
    status: 'planned',
    items: [],
  },
  {
    key: 'traction',
    label: 'Traction',
    description: 'EOS scorecard, quarterly rocks, and Level 10 meeting notes.',
    icon: Target,
    status: 'planned',
    items: [],
  },
];

/** Areas that have shipped — what the sidebar renders. */
export const LIVE_AREAS = BACK_OFFICE_AREAS.filter((a) => a.status === 'live');

/** Areas still to come — shown on the hub home so the roadmap stays visible. */
export const PLANNED_AREAS = BACK_OFFICE_AREAS.filter((a) => a.status === 'planned');
