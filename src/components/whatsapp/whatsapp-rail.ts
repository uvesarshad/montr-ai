import {
  LayoutDashboard,
  Send,
  FileText,
  Workflow,
  BarChart3,
  Users,
  Settings,
} from 'lucide-react';

import type { ModuleRailGroup } from '@/components/shell/module-shell';

/** WhatsApp marketing module sub-rail. Inbox lives in the omnichannel Inbox, not here. */
export const WHATSAPP_RAIL: ModuleRailGroup[] = [
  {
    items: [
      { href: '/whatsapp', label: 'Overview', icon: LayoutDashboard, exact: true },
      { href: '/whatsapp/campaigns', label: 'Campaigns', icon: Send, badgeKey: 'whatsappActive' },
      { href: '/whatsapp/templates', label: 'Templates', icon: FileText },
      { href: '/whatsapp/automation', label: 'Automation', icon: Workflow },
      { href: '/whatsapp/analytics', label: 'Analytics', icon: BarChart3 },
      { href: '/whatsapp/contacts', label: 'Contacts', icon: Users },
    ],
  },
  {
    label: 'Setup',
    items: [
      { href: '/whatsapp/settings', label: 'Settings', icon: Settings },
    ],
  },
];
