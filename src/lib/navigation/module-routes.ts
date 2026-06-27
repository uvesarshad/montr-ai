export const conversationRoutes = {
  root: '/conversations',
  leaderboard: '/conversations/leaderboard',
  channels: '/conversations/channels',
  analytics: '/conversations/analytics',
  knowledgeBase: '/conversations/knowledge-base',
} as const;

export const marketingRoutes = {
  root: '/marketing',
  whatsapp: {
    root: '/marketing/whatsapp',
    inbox: '/marketing/whatsapp/inbox',
    automation: '/marketing/whatsapp/automation',
    campaigns: '/marketing/whatsapp/campaigns',
    contacts: '/marketing/whatsapp/contacts',
    templates: '/marketing/whatsapp/templates',
    settings: '/marketing/whatsapp/settings',
    analytics: '/marketing/whatsapp/analytics',
  },
  email: {
    root: '/marketing/email',
    dashboard: '/marketing/email/dashboard',
    campaigns: '/marketing/email/campaigns',
    templates: '/marketing/email/templates',
    providers: '/marketing/email/providers',
  },
} as const;

const LEGACY_PREFIX_REDIRECTS = [
  {
    from: '/crm/inbox',
    to: conversationRoutes.root,
  },
  {
    from: '/crm/whatsapp',
    to: marketingRoutes.whatsapp.root,
  },
  {
    from: '/crm/marketing-email',
    to: marketingRoutes.email.root,
  },
] as const;

export function getLegacyModuleRedirect(pathname: string) {
  for (const redirect of LEGACY_PREFIX_REDIRECTS) {
    if (pathname === redirect.from) {
      return redirect.to;
    }

    if (pathname.startsWith(`${redirect.from}/`)) {
      return pathname.replace(redirect.from, redirect.to);
    }
  }

  return null;
}
