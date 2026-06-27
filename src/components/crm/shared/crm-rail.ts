import {
  LayoutDashboard,
  Users,
  Building2,
  Target,
  BarChart3,
  ListChecks,
  Mail,
  CalendarDays,
  Phone,
  Tag,
  GitBranch,
  FileUp,
  Settings,
  Trash2,
  CopyCheck,
  ShieldCheck,
  LayoutPanelTop,
  KeyRound,
} from 'lucide-react';

import type { ModuleRailGroup } from '@/components/shell/module-shell';

/**
 * CRM module sub-rail — the sections CRM owns.
 *
 * The legacy Marketing submenu (WhatsApp / marketing-email) was removed when
 * channels moved to the Engagement group: connection/assets live under
 * Channels, outbound sends under Campaigns, inbound under the global Inbox.
 */
export const CRM_RAIL: ModuleRailGroup[] = [
  {
    items: [
      { href: '/crm', label: 'Dashboard', icon: LayoutDashboard, exact: true },
      { href: '/crm/reports', label: 'Reports', icon: BarChart3 },
      { href: '/crm/contacts', label: 'Contacts', icon: Users },
      { href: '/crm/companies', label: 'Companies', icon: Building2 },
      { href: '/crm/deals', label: 'Deals', icon: Target },
      { href: '/crm/activities', label: 'Activities', icon: ListChecks },
      { href: '/crm/duplicates', label: 'Duplicates', icon: CopyCheck },
    ],
  },
  {
    label: 'Communication',
    items: [
      { href: '/crm/emails', label: 'Emails', icon: Mail },
      { href: '/crm/calendar', label: 'Calendar', icon: CalendarDays },
      { href: '/crm/voice/bulk', label: 'Voice', icon: Phone },
    ],
  },
  {
    label: 'Setup',
    items: [
      { href: '/crm/settings/pipelines', label: 'Pipelines', icon: GitBranch },
      { href: '/crm/tags', label: 'Tags', icon: Tag },
      { href: '/crm/import', label: 'Import', icon: FileUp },
      { href: '/crm/settings/dedupe', label: 'Dedupe rules', icon: ShieldCheck },
      { href: '/crm/settings/record-layouts', label: 'Record layouts', icon: LayoutPanelTop },
      { href: '/crm/settings/roles', label: 'Roles & permissions', icon: KeyRound },
      { href: '/crm/trash', label: 'Trash', icon: Trash2 },
      { href: '/crm/settings', label: 'Settings', icon: Settings, exact: true },
    ],
  },
];
