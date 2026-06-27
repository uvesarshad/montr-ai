import {
  BarChart3,
  Globe,
  LayoutDashboard,
  Plug,
  Search,
  Share2,
} from 'lucide-react';

import type { ModuleRailGroup } from '@/components/shell/module-shell';

/**
 * Analytics module sub-rail — cross-source insights over the unified
 * metrics store (ads, GA4, Search Console, account-level social).
 */
export const ANALYTICS_RAIL: ModuleRailGroup[] = [
  {
    items: [
      { href: '/analytics', label: 'Overview', icon: LayoutDashboard, exact: true },
      { href: '/analytics/traffic', label: 'Traffic', icon: Globe },
      { href: '/analytics/search', label: 'Search', icon: Search },
      { href: '/analytics/social', label: 'Social', icon: Share2 },
    ],
  },
  {
    label: 'Setup',
    items: [
      { href: '/analytics/sources', label: 'Sources', icon: Plug },
    ],
  },
];

export const ANALYTICS_ICON = BarChart3;
