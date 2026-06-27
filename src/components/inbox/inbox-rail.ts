import {
  MessagesSquare,
  BarChart3,
  Trophy,
  Plug,
  BookOpen,
} from 'lucide-react';

import type { ModuleRailGroup } from '@/components/shell/module-shell';

/** Omnichannel Inbox module sub-rail. */
export const INBOX_RAIL: ModuleRailGroup[] = [
  {
    items: [
      { href: '/inbox', label: 'Conversations', icon: MessagesSquare, exact: true, badgeKey: 'inboxOpen' },
      { href: '/inbox/analytics', label: 'Analytics', icon: BarChart3 },
      { href: '/inbox/leaderboard', label: 'Leaderboard', icon: Trophy },
    ],
  },
  {
    label: 'Setup',
    items: [
      { href: '/inbox/channels', label: 'Channels', icon: Plug },
      { href: '/inbox/knowledge-base', label: 'Knowledge base', icon: BookOpen },
    ],
  },
];
