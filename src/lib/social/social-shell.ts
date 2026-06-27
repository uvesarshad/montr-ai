export interface SocialShellAction {
  label: string;
  href: string;
}

export interface SocialShellMeta {
  title: string;
  section: string;
  primaryAction: SocialShellAction;
  showShell: boolean;
}

export interface SocialNavItem {
  label: string;
  href: string;
  exact?: boolean;
  icon: 'overview' | 'calendar' | 'compose' | 'drafts' | 'templates' | 'analytics' | 'approvals' | 'activity' | 'media' | 'inbox' | 'autopost' | 'integrations' | 'white-label';
}

export interface SocialNavSection {
  title: string;
  items: SocialNavItem[];
}

export const socialNavSections: SocialNavSection[] = [
  {
    title: 'Workspace',
    items: [
      { label: 'Overview', href: '/social', exact: true, icon: 'overview' },
      { label: 'Calendar', href: '/social/calendar', icon: 'calendar' },
      { label: 'Composer', href: '/social/create-post', icon: 'compose' },
      { label: 'Drafts', href: '/social/drafts', icon: 'drafts' },
      { label: 'Templates', href: '/social/templates', icon: 'templates' },
      { label: 'Autopost', href: '/social/autopost', icon: 'autopost' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Inbox', href: '/social/inbox', icon: 'inbox' },
      { label: 'Approvals', href: '/social/approvals', icon: 'approvals' },
      { label: 'Activity', href: '/social/activity', icon: 'activity' },
      { label: 'Analytics', href: '/social/analytics', icon: 'analytics' },
      { label: 'Media', href: '/social/media', icon: 'media' },
      { label: 'White-label', href: '/social/settings/white-label', icon: 'white-label' },
      { label: 'Integrations', href: '/social/integrations', icon: 'integrations' },
    ],
  },
];

const defaultMeta: SocialShellMeta = {
  title: 'Social',
  section: 'Workspace',
  primaryAction: {
    label: 'Create post',
    href: '/social/create-post',
  },
  showShell: true,
};

export function getSocialShellMeta(pathname: string): SocialShellMeta {
  if (pathname === '/social') {
    return {
      title: 'Overview',
      section: 'Command center',
      primaryAction: {
        label: 'Create post',
        href: '/social/create-post',
      },
      showShell: true,
    };
  }

  if (pathname.startsWith('/social/oauth-callback')) {
    return {
      title: 'Social',
      section: 'Utility',
      primaryAction: {
        label: 'Back to Social',
        href: '/social',
      },
      showShell: false,
    };
  }

  if (pathname.startsWith('/social/create-post/bulk')) {
    return {
      title: 'Bulk planner',
      section: 'Planning',
      primaryAction: {
        label: 'Single composer',
        href: '/social/create-post',
      },
      showShell: true,
    };
  }

  if (pathname.startsWith('/social/create-post')) {
    return {
      title: 'Composer',
      section: 'Planning',
      primaryAction: {
        label: 'Open calendar',
        href: '/social/calendar',
      },
      showShell: true,
    };
  }

  if (pathname.startsWith('/social/calendar')) {
    return {
      title: 'Calendar',
      section: 'Publishing',
      primaryAction: {
        label: 'New scheduled post',
        href: '/social/create-post',
      },
      showShell: true,
    };
  }

  if (pathname.startsWith('/social/drafts')) {
    return {
      title: 'Drafts',
      section: 'Planning',
      primaryAction: {
        label: 'Create draft',
        href: '/social/create-post',
      },
      showShell: true,
    };
  }

  if (pathname.startsWith('/social/templates')) {
    return {
      title: 'Templates',
      section: 'Planning',
      primaryAction: {
        label: 'Create post',
        href: '/social/create-post',
      },
      showShell: true,
    };
  }

  if (pathname.startsWith('/social/analytics')) {
    return {
      title: 'Analytics',
      section: 'Performance',
      primaryAction: {
        label: 'Open calendar',
        href: '/social/calendar',
      },
      showShell: true,
    };
  }

  if (pathname.startsWith('/social/approvals')) {
    return {
      title: 'Approvals',
      section: 'Operations',
      primaryAction: {
        label: 'Open drafts',
        href: '/social/drafts',
      },
      showShell: true,
    };
  }

  if (pathname.startsWith('/social/activity')) {
    return {
      title: 'Activity',
      section: 'Operations',
      primaryAction: {
        label: 'View analytics',
        href: '/social/analytics',
      },
      showShell: true,
    };
  }

  if (pathname.startsWith('/social/media')) {
    return {
      title: 'Media library',
      section: 'Assets',
      primaryAction: {
        label: 'Open composer',
        href: '/social/create-post',
      },
      showShell: true,
    };
  }

  return defaultMeta;
}
