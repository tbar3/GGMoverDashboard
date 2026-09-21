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
  ClipboardCheck,
  DollarSign,
  FileSpreadsheet,
  Package,
  BookOpen,
  Target,
  MessageSquare,
  Award,
  Trophy,
  Sunrise,
  FileText,
  FileCheck,
  Truck,
  type LucideIcon,
} from 'lucide-react';

/**
 * The back-office information architecture, in one place.
 *
 * The sidebar rail, its hover flyouts, the pinned area panel, the mobile
 * accordion, the hub home and every area dashboard all render from this list, so
 * a module can never appear in one and not another. When a new module ships: add
 * it here and it turns up in all six places.
 *
 * `status: 'planned'` areas are shown on the hub home as "coming soon" cards but
 * are deliberately NOT rendered in the sidebar — a nav link to a route that
 * doesn't exist is a dead link, and dead links erode trust in the whole nav.
 */

export interface NavItem {
  title: string;
  href: string;
  description: string;
  icon: LucideIcon;
  /**
   * Names a count the sidebar renders as a badge on this link. The layout looks
   * the key up in the `badges` map it passes down; an absent or zero count
   * renders nothing, so a nav item never shows a meaningless "0".
   */
  badgeKey?: string;
  /**
   * Sub-heading this item sits under inside its area's panel and flyout.
   *
   * Only worth setting on the big areas: People has twelve modules and Operations
   * nine, and a flat list of twelve is the thing the two-level nav exists to fix.
   * Items with no group render first, ungrouped. Groups appear in the order they
   * are first declared below, NOT alphabetically — the order is editorial.
   */
  group?: string;
}

export interface NavArea {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  status: 'live' | 'planned';
  /**
   * The area's dashboard — where clicking its rail entry lands.
   *
   * Optional because a planned area has nowhere to go yet. Where an area holds a
   * single module, this points AT that module rather than at a dashboard listing
   * one link to itself (Materials, Policies, Compliance); the panel then drops
   * the duplicate. See `panelItems()` in nav-active.ts.
   */
  href?: string;
  items: NavItem[];
}

export const BACK_OFFICE_AREAS: NavArea[] = [
  {
    key: 'operations',
    label: 'Operations',
    description: 'Jobs, scheduling, and the daily run of the business.',
    icon: Briefcase,
    status: 'live',
    href: '/admin/operations',
    items: [
      {
        title: 'Morning Meeting',
        href: '/admin/morning-meeting',
        description: 'The 7:15 walk-through — recognition, reminders, policy of the day',
        icon: Sunrise,
        group: 'Daily',
      },
      {
        title: 'Jobs',
        href: '/admin/jobs',
        description: 'Every move, its crew, and its outcome',
        icon: Briefcase,
        group: 'Daily',
      },
      {
        title: 'Rental Trucks',
        href: '/admin/rentals',
        description: 'When to book, when it goes back, and what to do before it does',
        icon: Truck,
        group: 'Daily',
      },
      {
        title: 'Crew Responses',
        href: '/admin/responses',
        description: 'Who accepted or declined jobs — and why they declined',
        icon: ClipboardCheck,
        group: 'Daily',
      },
      {
        title: 'Profitability',
        href: '/admin/profitability',
        description: 'P&L, job-by-job margins, weekly & monthly',
        icon: TrendingUp,
        group: 'Revenue',
      },
      {
        title: 'Google Reviews',
        href: '/admin/reviews',
        description: '5-star reviews auto-credited to the crew who earned them',
        icon: Star,
        group: 'Revenue',
      },
      {
        title: 'QuickBooks',
        href: '/admin/quickbooks',
        description: 'Two-way sync with QuickBooks Online',
        icon: Link2,
        group: 'Revenue',
      },
      {
        title: 'Calendar Sync',
        href: '/admin/calendar',
        description: 'Pull jobs in from SmartMoving',
        icon: CalendarSync,
        group: 'Data',
      },
      {
        title: 'Import Data',
        href: '/admin/import',
        description: 'Bulk CSV and Excel import',
        icon: FileSpreadsheet,
        group: 'Data',
      },
    ],
  },
  {
    key: 'people',
    label: 'People',
    description: 'The crew, what they earn, and how they perform.',
    icon: Users,
    status: 'live',
    href: '/admin/people',
    items: [
      {
        title: 'Employees',
        href: '/admin/employees',
        description: 'Roster, roles, and tenure',
        icon: Users,
        group: 'Team',
      },
      {
        title: 'Hiring',
        href: '/admin/hiring',
        description: 'Interview scorecards and candidates',
        icon: UserPlus,
        group: 'Team',
      },
      {
        title: 'Certifications',
        href: '/admin/certifications',
        description: 'Practice requirements, crew-vote surveys, and QR codes',
        icon: Award,
        group: 'Team',
      },
      {
        title: 'Pay Scale & Skills',
        href: '/admin/skills',
        description: 'Base rate and the skills that raise it',
        icon: Award,
        group: 'Team',
      },
      {
        // One entry, five tabs. These used to be four separate nav items — Payroll,
        // Payroll Run, Payroll Audit and Marketing Hours — which split one weekly
        // job across four links and gave no clue about the order to do them in.
        title: 'Payroll',
        href: '/admin/payroll',
        description: 'Import, review, close, and export the week — plus audit and history',
        icon: DollarSign,
        group: 'Pay',
      },
      {
        title: 'Weekly Bonus',
        href: '/admin/weekly-bonus',
        description: 'Attendance, strikes, and positives that drive the weekly bonus',
        icon: Star,
        group: 'Pay',
      },
      {
        title: 'Tenure Bonus',
        href: '/admin/tenure-bonus',
        description: 'Bi-annual pool split by months worked',
        icon: DollarSign,
        group: 'Pay',
      },
      {
        title: 'Mileage',
        href: '/admin/mileage',
        description: 'Reimbursement at $0.76/mi',
        icon: Car,
        group: 'Pay',
      },
      {
        title: 'Weekly Scoreboard',
        href: '/admin/scoreboard',
        description: 'One sortable score per crew member — best to worst last week',
        icon: Trophy,
        group: 'Performance',
      },
      {
        title: 'Damages',
        href: '/admin/damages',
        description: 'Claims and their pool impact',
        icon: AlertTriangle,
        group: 'Performance',
      },
      {
        title: 'Message Board',
        href: '/admin/messages',
        description: 'Post announcements to the crew',
        icon: MessageSquare,
        group: 'Admin',
      },
      {
        title: 'Admin Settings',
        href: '/admin/settings',
        description: 'Admin team roles and company locations',
        icon: ShieldCheck,
        group: 'Admin',
      },
    ],
  },
  {
    key: 'materials',
    label: 'Materials',
    description: 'Trucks, warehouses, and the supply catalog.',
    icon: Package,
    status: 'live',
    // Single module: the area IS the page, so the rail links straight to it.
    href: '/admin/materials',
    items: [
      {
        title: 'Materials',
        href: '/admin/materials',
        description: 'On-hand inventory, receiving, count sheets, and reports',
        icon: Package,
      },
    ],
  },
  {
    key: 'policies',
    label: 'Policies',
    description: 'The handbook, SOPs, and standing company policy in one searchable place.',
    icon: BookOpen,
    status: 'live',
    href: '/admin/policies',
    items: [
      {
        title: 'Policies',
        href: '/admin/policies',
        description: 'Write and publish company policy — crew read it, and it feeds the morning rotation',
        icon: BookOpen,
      },
      {
        title: 'Documents',
        href: '/admin/documents',
        description: 'The handbook file, SOPs, and forms — stored privately, shared with crew',
        icon: FileText,
      },
    ],
  },
  {
    key: 'compliance',
    label: 'Compliance',
    description: 'Registrations, filings, insurance, and the fleet that has to stay legal.',
    icon: ShieldCheck,
    status: 'live',
    href: '/admin/compliance',
    items: [
      {
        title: 'Compliance',
        href: '/admin/compliance',
        description: "What's expired, what's due, and who owns the renewal",
        icon: ShieldCheck,
        badgeKey: 'compliance',
      },
      {
        title: 'Compliance Items',
        href: '/admin/compliance/items',
        description: 'Every registration, filing, permit, policy, and card',
        icon: FileCheck,
      },
      {
        title: 'Fleet & Maintenance',
        href: '/admin/compliance/fleet',
        description: 'Vehicles, preventative maintenance, and service history',
        icon: Truck,
      },
    ],
  },
  {
    key: 'traction',
    label: 'Traction',
    description: 'EOS scorecard, quarterly rocks, and Level 10 meeting notes.',
    icon: Target,
    status: 'planned',
    // No href on purpose: nothing to link to until it ships.
    items: [],
  },
];

/** Areas that have shipped — what the sidebar renders. */
export const LIVE_AREAS = BACK_OFFICE_AREAS.filter((a) => a.status === 'live');

/** Areas still to come — shown on the hub home so the roadmap stays visible. */
export const PLANNED_AREAS = BACK_OFFICE_AREAS.filter((a) => a.status === 'planned');
