import { marketingRoutes } from '@/lib/navigation/module-routes';

type ReportPeriod = '7d' | '30d' | '90d';

type RoadmapTaskStatus = 'pending' | 'in_progress' | 'completed';

type RoadmapTaskType = 'campaign' | 'email' | 'analytics' | 'automation' | string;

export interface MarketingWorkspaceInput {
  brandName: string | null;
  hasBrands: boolean;
  totalAutomations: number;
  activeAutomations: number;
  connectedProviders: number;
  connectedWhatsAppAccounts: number;
  openWhatsAppConversations: number;
  report: {
    period: ReportPeriod;
    social: {
      totalPosts: number;
      totalEngagement: number;
      avgEngagementRate: number;
      momentum: number;
      topPlatform: string | null;
      topPostPreview: string | null;
    };
    email: {
      campaignsSent: number;
      totalSent: number;
      totalOpened: number;
      totalClicked: number;
      totalBounced: number;
      avgOpenRate: number;
      avgClickRate: number;
    };
    whatsapp: {
      campaignsSent: number;
      totalSent: number;
      totalDelivered: number;
      totalRead: number;
      totalFailed: number;
      deliveryRate: number;
      readRate: number;
    };
    summary: string;
  } | null;
  roadmap: {
    currentLevel: number;
    currentXp: number;
    tasks: Array<{
      id: string;
      title: string;
      status: RoadmapTaskStatus;
      xpReward?: number;
      type?: RoadmapTaskType;
      description?: string;
    }>;
  } | null;
}

export interface MarketingWorkspace {
  hero: {
    title: string;
    summary: string;
    badge: string;
  };
  scorecards: Array<{
    label: string;
    value: string;
    caption: string;
  }>;
  channels: Array<{
    title: string;
    href: string;
    metric: string;
    description: string;
  }>;
  priorities: Array<{
    title: string;
    description: string;
    href: string;
    status: 'focus' | 'setup';
  }>;
}

export const marketingSidebarSections = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', href: marketingRoutes.root, iconKey: 'layout-dashboard' },
    ],
  },
  {
    title: 'Channels',
    items: [
      { label: 'WhatsApp', href: marketingRoutes.whatsapp.root, iconKey: 'message-square' },
      { label: 'Email', href: marketingRoutes.email.root, iconKey: 'mail' },
    ],
  },
  {
    title: 'Automation',
    items: [
      { label: 'Canvas Workspace', href: '/canvas', iconKey: 'workflow' },
      { label: 'Templates', href: '/canvas/templates', iconKey: 'layout-template' },
    ],
  },
] as const;

export function buildMarketingWorkspace(input: MarketingWorkspaceInput): MarketingWorkspace {
  const roadmapTasks = input.roadmap?.tasks ?? [];
  const completedTasks = roadmapTasks.filter((task) => task.status === 'completed').length;
  const roadmapProgress = roadmapTasks.length > 0
    ? Math.round((completedTasks / roadmapTasks.length) * 100)
    : 0;

  const emailOpenRate = input.report?.email.avgOpenRate ?? 0;
  const whatsappDeliveryRate = input.report?.whatsapp.deliveryRate ?? 0;
  const periodLabel = input.report?.period ?? '30d';

  const heroSummary = input.hasBrands
    ? `${input.brandName || 'Your team'} is running ${input.activeAutomations} live automations across email and WhatsApp, with ${formatPercent(emailOpenRate)} email opens and ${formatPercent(whatsappDeliveryRate)} WhatsApp delivery over the last ${periodLabel}.`
    : 'Connect your first brand to turn Marketing into a live command center for campaigns, conversations, and automation.';

  return {
    hero: {
      title: 'Marketing command center',
      summary: heroSummary,
      badge: input.hasBrands ? 'Live workspace' : 'Setup required',
    },
    scorecards: [
      {
        label: 'Active automations',
        value: String(input.activeAutomations),
        caption: `${input.totalAutomations} total workflows in canvas`,
      },
      {
        label: 'Email open rate',
        value: formatPercent(emailOpenRate),
        caption: `${input.report?.email.campaignsSent ?? 0} campaigns sent`,
      },
      {
        label: 'WhatsApp delivery',
        value: formatPercent(whatsappDeliveryRate),
        caption: `${input.openWhatsAppConversations} open conversations`,
      },
      {
        label: 'Roadmap progress',
        value: `${roadmapProgress}%`,
        caption: roadmapTasks.length > 0
          ? `${completedTasks}/${roadmapTasks.length} tasks complete`
          : 'No roadmap tasks yet',
      },
    ],
    channels: [
      {
        title: 'WhatsApp',
        href: marketingRoutes.whatsapp.root,
        metric: `${input.connectedWhatsAppAccounts} account${input.connectedWhatsAppAccounts === 1 ? '' : 's'}`,
        description: input.report
          ? `${input.report.whatsapp.campaignsSent} campaigns, ${formatPercent(input.report.whatsapp.readRate)} read rate`
          : 'Inbox, broadcasts, contacts, and automations',
      },
      {
        title: 'Email',
        href: marketingRoutes.email.root,
        metric: `${input.connectedProviders} provider${input.connectedProviders === 1 ? '' : 's'}`,
        description: input.report
          ? `${input.report.email.campaignsSent} campaigns, ${formatPercent(input.report.email.avgClickRate)} click rate`
          : 'Campaigns, templates, and deliverability',
      },
      {
        title: 'Automation',
        href: '/canvas',
        metric: `${input.totalAutomations} workflow${input.totalAutomations === 1 ? '' : 's'}`,
        description: input.activeAutomations > 0
          ? `${input.activeAutomations} active workflows bridging channels`
          : 'Build cross-channel automations in canvas',
      },
    ],
    priorities: buildPriorities(input, roadmapProgress),
  };
}

function buildPriorities(
  input: MarketingWorkspaceInput,
  roadmapProgress: number,
): MarketingWorkspace['priorities'] {
  const tasks = [...(input.roadmap?.tasks ?? [])]
    .filter((task) => task.status !== 'completed')
    .sort((left, right) => {
      const statusDelta = statusWeight(right.status) - statusWeight(left.status);
      if (statusDelta !== 0) {
        return statusDelta;
      }

      return (right.xpReward ?? 0) - (left.xpReward ?? 0);
    });

  if (tasks.length > 0) {
    return tasks.slice(0, 3).map((task) => ({
      title: task.title,
      description: task.description || `Keep ${task.type || 'marketing'} work moving.`,
      href: taskHref(task.type),
      status: 'focus' as const,
    }));
  }

  if (!input.hasBrands) {
    return [
      {
        title: 'Connect a brand workspace',
        description: 'Attach a brand so Marketing can load analytics, plans, and channel data.',
        href: '/settings',
        status: 'setup',
      },
      {
        title: 'Link your first delivery channel',
        description: 'Connect WhatsApp or Email before launching campaigns.',
        href: marketingRoutes.whatsapp.settings,
        status: 'setup',
      },
      {
        title: 'Create a launch automation',
        description: 'Set up the first workflow in canvas so campaigns can hand off cleanly.',
        href: '/canvas',
        status: 'setup',
      },
    ];
  }

  return [
    {
      title: 'Open the WhatsApp workspace',
      description: 'Review inbox activity and campaign readiness from the channel view.',
      href: marketingRoutes.whatsapp.root,
      status: 'setup',
    },
    {
      title: 'Review email campaign health',
      description: 'Check providers, templates, and delivery quality before the next send.',
      href: marketingRoutes.email.root,
      status: 'setup',
    },
    {
      title: 'Plan the next automation',
      description: roadmapProgress > 0
        ? 'Expand the current marketing playbook with one more workflow.'
        : 'Build the first workflow to connect campaigns with the rest of the workspace.',
      href: '/canvas',
      status: 'setup',
    },
  ];
}

function formatPercent(value: number): string {
  if (value === 0) {
    return '0%';
  }

  return `${value.toFixed(1)}%`;
}

function statusWeight(status: RoadmapTaskStatus): number {
  switch (status) {
    case 'in_progress':
      return 3;
    case 'pending':
      return 2;
    case 'completed':
      return 1;
    default:
      return 0;
  }
}

function taskHref(type?: RoadmapTaskType): string {
  switch (type) {
    case 'email':
      return marketingRoutes.email.root;
    case 'analytics':
      return marketingRoutes.root;
    case 'automation':
      return '/canvas';
    case 'campaign':
    default:
      return marketingRoutes.whatsapp.root;
  }
}


