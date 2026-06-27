import {
  LayoutDashboard,
  CalendarDays,
  PencilLine,
  FileText,
  LayoutTemplate,
  ShieldCheck,
  Activity,
  BarChart3,
  FileImage,
  Inbox,
  Rss,
  Plug,
  Palette,
} from 'lucide-react';

import type { ModuleRailGroup } from '@/components/shell/module-shell';

/** Social module sub-rail — mirrors `socialNavSections` in `@/lib/social/social-shell`. */
export const SOCIAL_RAIL: ModuleRailGroup[] = [
  {
    label: 'Workspace',
    items: [
      { href: '/social', label: 'Overview', icon: LayoutDashboard, exact: true },
      { href: '/social/calendar', label: 'Calendar', icon: CalendarDays },
      { href: '/social/create-post', label: 'Composer', icon: PencilLine },
      { href: '/social/drafts', label: 'Drafts', icon: FileText },
      { href: '/social/templates', label: 'Templates', icon: LayoutTemplate },
      { href: '/social/autopost', label: 'Autopost', icon: Rss },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/social/inbox', label: 'Inbox', icon: Inbox },
      { href: '/social/approvals', label: 'Approvals', icon: ShieldCheck },
      { href: '/social/activity', label: 'Activity', icon: Activity },
      { href: '/social/analytics', label: 'Analytics', icon: BarChart3 },
      { href: '/social/media', label: 'Media', icon: FileImage },
      { href: '/social/settings/white-label', label: 'White-label', icon: Palette },
      { href: '/social/integrations', label: 'Integrations', icon: Plug },
    ],
  },
];
