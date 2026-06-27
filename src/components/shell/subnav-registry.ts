/**
 * SubNav registry — the single source of truth for per-module shell chrome,
 * mirroring the mockup's `SUBNAV` / `HEADER_ACTIONS` / `CREATE_LABEL` data
 * (the v0.6 design mockup (removed) data.jsx + shell.jsx).
 *
 * `(app)/layout.tsx` resolves the pathname here and renders the gutter SubNav;
 * the Topbar derives its breadcrumbs, quick actions and Create CTA from the
 * same entry. Modules WITHOUT an entry render rail-less (full-width card).
 *
 * Extension point: as more modules grow sections (AI Studio, AI Bots, Forms,
 * Docs per the mockup), add an entry here — do not mount per-module subnavs
 * in module layouts.
 */

import {
  CalendarDays,
  Download,
  Inbox,
  LayoutGrid,
  Mail,
  Megaphone,
  MessageCircle,
  Sparkles,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react';

import type { ModuleRailGroup } from '@/components/shell/module-shell';
import { ADS_RAIL } from '@/components/ads/ads-rail';
import { ANALYTICS_RAIL, ANALYTICS_ICON } from '@/components/analytics-hub/analytics-rail';
import { CRM_RAIL } from '@/components/crm/shared/crm-rail';
import { EMAIL_RAIL } from '@/components/marketing/email-rail';
import { INBOX_RAIL } from '@/components/inbox/inbox-rail';
import { SOCIAL_RAIL } from '@/components/social/social-rail';
import { WHATSAPP_RAIL } from '@/components/whatsapp/whatsapp-rail';

export interface SubnavHeaderAction {
  icon: LucideIcon;
  label: string;
  /** Navigate on click. Omit when `run` is set. */
  href?: string;
  /** Built-in behaviour instead of navigation. */
  run?: 'ask-agent';
}

export interface SubnavConfig {
  /** Route prefix that activates this module's chrome (e.g. '/crm'). */
  match: string;
  /** Route prefixes inside `match` that render bare (no shell subnav). */
  exclude?: string[];
  /** Module name shown in the SubNav head and the Topbar breadcrumb. */
  title: string;
  icon: LucideIcon;
  /** SubNav sections. Empty → header-chrome-only module (no gutter panel). */
  groups: ModuleRailGroup[];
  /**
   * Per-module Create CTA in the Topbar (mockup CREATE_LABEL). Without an
   * `href` it opens the command palette — the mockup's Create behaviour.
   */
  create?: { label: string; href?: string };
  /** Module-specific quick actions in the Topbar (mockup HEADER_ACTIONS). */
  headerActions?: SubnavHeaderAction[];
}

export const SUBNAV_REGISTRY: SubnavConfig[] = [
  {
    // Header chrome only (mockup home: ✨ Ask Montr AI + Create) — no SubNav.
    match: '/dashboard',
    title: 'Home',
    icon: LayoutGrid,
    groups: [],
    create: { label: 'Create' },
    headerActions: [{ icon: Sparkles, label: 'Ask Montr AI', run: 'ask-agent' }],
  },
  {
    match: '/crm',
    title: 'CRM',
    icon: Users,
    groups: CRM_RAIL,
    create: { label: 'New contact', href: '/crm/contacts/new' },
    headerActions: [
      { icon: Download, label: 'Import', href: '/crm/import' },
      { icon: TrendingUp, label: 'Reports', href: '/crm' },
    ],
  },
  {
    match: '/campaigns',
    title: 'Email',
    icon: Mail,
    groups: EMAIL_RAIL,
    create: { label: 'New campaign', href: '/campaigns/campaigns' },
    headerActions: [
      { icon: TrendingUp, label: 'Deliverability', href: '/campaigns/dashboard' },
      { icon: LayoutGrid, label: 'Templates', href: '/campaigns/templates' },
    ],
  },
  {
    match: '/inbox',
    exclude: ['/inbox/chatbots'],
    title: 'Inbox',
    icon: Inbox,
    groups: INBOX_RAIL,
    create: { label: 'New conversation' },
    headerActions: [{ icon: TrendingUp, label: 'Analytics', href: '/inbox/analytics' }],
  },
  {
    match: '/social',
    exclude: ['/social/oauth-callback'],
    title: 'Social',
    icon: CalendarDays,
    groups: SOCIAL_RAIL,
    create: { label: 'New post', href: '/social/create-post' },
    headerActions: [{ icon: CalendarDays, label: 'Calendar', href: '/social/calendar' }],
  },
  {
    match: '/whatsapp',
    title: 'WhatsApp',
    icon: MessageCircle,
    groups: WHATSAPP_RAIL,
    create: { label: 'New broadcast', href: '/whatsapp/campaigns' },
    headerActions: [{ icon: LayoutGrid, label: 'Templates', href: '/whatsapp/templates' }],
  },
  {
    match: '/ads',
    title: 'Ads',
    icon: Megaphone,
    groups: ADS_RAIL,
    create: { label: 'New campaign', href: '/ads/campaigns/new' },
    headerActions: [
      { icon: TrendingUp, label: 'Campaigns', href: '/ads/campaigns' },
      { icon: Users, label: 'Leads', href: '/ads/leads' },
    ],
  },
  {
    match: '/analytics',
    title: 'Analytics',
    icon: ANALYTICS_ICON,
    groups: ANALYTICS_RAIL,
    headerActions: [
      { icon: TrendingUp, label: 'Ads', href: '/ads' },
      { icon: Sparkles, label: 'Ask Montr AI', run: 'ask-agent' },
    ],
  },
];

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Longest-prefix match; null when no module owns the route (or it's excluded). */
export function resolveSubnav(pathname: string): SubnavConfig | null {
  let best: SubnavConfig | null = null;
  for (const config of SUBNAV_REGISTRY) {
    if (!matchesPrefix(pathname, config.match)) continue;
    if (config.exclude?.some((ex) => matchesPrefix(pathname, ex))) return null;
    if (!best || config.match.length > best.match.length) best = config;
  }
  return best;
}

/** Label of the subnav item that matches the pathname — the breadcrumb tail. */
export function activeSectionLabel(config: SubnavConfig, pathname: string): string | null {
  let best: { label: string; length: number } | null = null;
  for (const group of config.groups) {
    for (const item of group.items) {
      const active = item.exact
        ? pathname === item.href
        : pathname === item.href || pathname.startsWith(`${item.href}/`);
      if (active && (!best || item.href.length > best.length)) {
        best = { label: item.label, length: item.href.length };
      }
    }
  }
  return best?.label ?? null;
}
