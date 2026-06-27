export interface AgentBrandOption {
  id: string;
  name: string;
  handle?: string;
}

export interface AgentStarterPrompt {
  title: string;
  prompt: string;
  icon: 'campaign' | 'workflow' | 'content' | 'insights' | 'summary' | 'next-step' | 'action';
}

interface AgentBrandSetupOptions {
  returnTo?: string;
}

interface BrandLike {
  _id?: unknown;
  id?: unknown;
  name?: unknown;
  handle?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toBrandOption(value: BrandLike): AgentBrandOption | null {
  const id = typeof value._id === 'string'
    ? value._id
    : typeof value.id === 'string'
      ? value.id
      : null;

  const name = typeof value.name === 'string' && value.name.trim().length > 0
    ? value.name.trim()
    : null;

  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    handle: typeof value.handle === 'string' && value.handle.trim().length > 0
      ? value.handle.trim()
      : undefined,
  };
}

export function normalizeAgentBrandsResponse(payload: unknown): AgentBrandOption[] {
  const brandsValue = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.brands)
      ? payload.brands
      : [];

  return brandsValue
    .map((brand) => (isRecord(brand) ? toBrandOption(brand) : null))
    .filter((brand): brand is AgentBrandOption => brand !== null);
}

export function getAgentStarterPrompts(hasConversation: boolean): AgentStarterPrompt[] {
  if (hasConversation) {
    return [
      {
        title: 'Summarize this mission',
        prompt: 'Summarize this mission into key decisions, blockers, and next actions.',
        icon: 'summary',
      },
      {
        title: 'Recommend next move',
        prompt: 'Based on this mission, recommend the highest-leverage next step.',
        icon: 'next-step',
      },
      {
        title: 'Turn this into tasks',
        prompt: 'Turn this mission into an actionable task list with owners and priorities.',
        icon: 'action',
      },
    ];
  }

  return [
    {
      title: 'Plan a mission',
      prompt: 'Plan a mission for my next campaign with goals, channels, and a 7-day execution outline.',
      icon: 'campaign',
    },
    {
      title: 'Build an automation',
      prompt: 'Design an automation workflow for lead follow-up and re-engagement.',
      icon: 'workflow',
    },
    {
      title: 'Draft launch content',
      prompt: 'Draft launch content for email, WhatsApp, and LinkedIn using my brand voice.',
      icon: 'content',
    },
    {
      title: 'Analyze performance',
      prompt: 'Analyze my recent marketing performance and tell me what to fix first.',
      icon: 'insights',
    },
  ];
}

export function buildAgentBrandSetupHref(options: AgentBrandSetupOptions = {}) {
  const params = new URLSearchParams({
    tab: 'connections',
    createBrand: '1',
    from: 'agent',
  });

  if (options.returnTo) {
    params.set('returnTo', options.returnTo);
  }

  return `/settings?${params.toString()}`;
}
