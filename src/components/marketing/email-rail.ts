import {
  LayoutDashboard,
  BarChart3,
  Send,
  FileText,
  Settings,
} from 'lucide-react';

import type { ModuleRailGroup } from '@/components/shell/module-shell';

/**
 * Email marketing module sub-rail. The route is `/campaigns` for historical
 * reasons, but the module is email marketing (`MarketingEmailOverview`).
 */
export const EMAIL_RAIL: ModuleRailGroup[] = [
  {
    items: [
      { href: '/campaigns', label: 'Overview', icon: LayoutDashboard, exact: true },
      { href: '/campaigns/dashboard', label: 'Dashboard', icon: BarChart3 },
      { href: '/campaigns/campaigns', label: 'Campaigns', icon: Send },
      { href: '/campaigns/templates', label: 'Templates', icon: FileText },
    ],
  },
  {
    label: 'Setup',
    items: [
      { href: '/campaigns/providers', label: 'Providers', icon: Settings },
    ],
  },
];
