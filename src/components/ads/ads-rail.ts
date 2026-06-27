import {
  LayoutDashboard,
  Megaphone,
  Plug,
  Sparkles,
  UserPlus,
} from 'lucide-react';

import type { ModuleRailGroup } from '@/components/shell/module-shell';

/**
 * Ads module sub-rail. Insights + lead capture + create-only campaign
 * wizard (everything created PAUSED) — see docs/ads-analytics-plan.md.
 */
export const ADS_RAIL: ModuleRailGroup[] = [
  {
    items: [
      { href: '/ads', label: 'Overview', icon: LayoutDashboard, exact: true },
      { href: '/ads/campaigns', label: 'Campaigns', icon: Megaphone },
      { href: '/ads/leads', label: 'Leads', icon: UserPlus },
      { href: '/ads/creatives', label: 'Creatives', icon: Sparkles },
    ],
  },
  {
    label: 'Setup',
    items: [
      { href: '/ads/accounts', label: 'Ad Accounts', icon: Plug },
    ],
  },
];
