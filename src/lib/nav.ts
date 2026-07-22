import {
  Users,
  CalendarCheck,
  CalendarSync,
  Car,
  AlertTriangle,
  Star,
  Calculator,
  Briefcase,
  DollarSign,
  FileSpreadsheet,
  Package,
  BookOpen,
  Target,
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
        title: 'Attendance',
        href: '/admin/attendance',
        description: 'Who showed up, and who was late',
        icon: CalendarCheck,
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
        title: 'Bonus Calculator',
        href: '/admin/bonus',
        description: 'Monthly pool distribution',
        icon: Calculator,
      },
      {
        title: 'Performance',
        href: '/admin/performance',
        description: 'Reviews, call-outs, and recognition',
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
    ],
  },
  {
    key: 'materials',
    label: 'Materials',
    description: 'Inventory, truck stock, and job counts — moving over from the crew materials app.',
    icon: Package,
    status: 'planned',
    items: [],
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
