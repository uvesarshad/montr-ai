export type CanvasTemplateCategory =
  | 'marketing'
  | 'sales'
  | 'customer-support'
  | 'social-media'
  | 'automation'
  | 'ai-assistants'
  | 'data-processing'
  | 'notifications'
  | 'integrations'
  | 'other';

export type CanvasTemplateDifficulty = 'beginner' | 'intermediate' | 'advanced';
export type CanvasTemplateSource = 'official' | 'community';

export interface CanvasTemplateFlowData {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
  variables?: Array<Record<string, unknown>>;
}

export interface CanvasTemplateSummary {
  _id: string;
  name: string;
  description: string;
  category: CanvasTemplateCategory;
  difficulty: CanvasTemplateDifficulty;
  tags: string[];
  previewImageUrl?: string;
  screenshots: string[];
  authorName: string;
  usageCount: number;
  rating: number;
  ratingCount: number;
  isFeatured: boolean;
  isOfficial: boolean;
  source: CanvasTemplateSource;
  isBuiltIn: boolean;
  stepCount: number;
  setupTime?: number;
  version: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CanvasTemplateDetail extends CanvasTemplateSummary {
  longDescription?: string;
  useCases: string[];
  requirements: string[];
  compatibleTriggers: string[];
  status?: string;
  rejectionReason?: string;
  flowData: CanvasTemplateFlowData;
}

interface CanvasTemplateFilters {
  category?: string | null;
  difficulty?: string | null;
  search?: string | null;
  featured?: boolean;
}

const BUILT_IN_CANVAS_TEMPLATES: CanvasTemplateDetail[] = [
  {
    _id: 'official_welcome_follow_up',
    name: 'Welcome Follow-up Sequence',
    description:
      'Start with a trigger, wait briefly, and send a WhatsApp welcome message to move new leads into an active conversation.',
    category: 'automation',
    difficulty: 'beginner',
    tags: ['welcome', 'whatsapp', 'follow-up'],
    screenshots: [],
    useCases: ['Onboard new leads', 'Send automated WhatsApp welcome messages', 'Reduce response time on new signups'],
    requirements: ['WhatsApp account connected'],
    compatibleTriggers: ['triggerManual', 'triggerCRM'],
    authorName: 'Montr AI',
    usageCount: 1240,
    rating: 4.8,
    ratingCount: 84,
    isFeatured: true,
    isOfficial: true,
    source: 'official',
    isBuiltIn: true,
    stepCount: 3,
    setupTime: 5,
    version: '1.0.0',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    flowData: {
      nodes: [
        {
          id: 'trigger_manual',
          type: 'triggerManual',
          position: { x: 0, y: 40 },
          data: {},
        },
        {
          id: 'delay_welcome',
          type: 'logicDelay',
          position: { x: 320, y: 40 },
          data: { duration: 5, unit: 'minutes' },
        },
        {
          id: 'send_whatsapp',
          type: 'actionWhatsApp',
          position: { x: 640, y: 40 },
          data: {
            messageType: 'text',
            recipientField: '{{$trigger.contact.phone}}',
            message:
              'Hi {{$trigger.contact.firstName}}! Thanks for reaching out to us. Reply here and our team will help you with the next step.',
          },
        },
      ],
      edges: [
        {
          id: 'edge_trigger_delay',
          source: 'trigger_manual',
          target: 'delay_welcome',
          type: 'custom-edge',
        },
        {
          id: 'edge_delay_whatsapp',
          source: 'delay_welcome',
          target: 'send_whatsapp',
          type: 'custom-edge',
        },
      ],
      variables: [],
    },
  },
  {
    _id: 'official_lead_nurture_email',
    name: 'Lead Nurture Email Drip',
    description:
      'Generate personalized copy from a prompt, then send a campaign-style follow-up email to a saved segment or list.',
    category: 'marketing',
    difficulty: 'intermediate',
    tags: ['email', 'drip', 'lead-nurture'],
    screenshots: [],
    useCases: ['Automate lead nurturing sequences', 'Send AI-personalized follow-up emails', 'Warm up cold leads'],
    requirements: ['Email provider configured', 'Contact list available'],
    compatibleTriggers: ['triggerSchedule', 'triggerCRM'],
    authorName: 'Montr AI',
    usageCount: 890,
    rating: 4.7,
    ratingCount: 61,
    isFeatured: true,
    isOfficial: true,
    source: 'official',
    isBuiltIn: true,
    stepCount: 4,
    setupTime: 12,
    version: '1.0.0',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    flowData: {
      nodes: [
        {
          id: 'schedule_trigger',
          type: 'triggerSchedule',
          position: { x: 0, y: 40 },
          data: {},
        },
        {
          id: 'email_delay',
          type: 'logicDelay',
          position: { x: 300, y: 40 },
          data: { duration: 1, unit: 'days' },
        },
        {
          id: 'email_prompt',
          type: 'promptNode',
          position: { x: 620, y: 10 },
          data: {
            prompt:
              'Write a concise nurture email for {{$trigger.contact.firstName}} that references their interest and ends with a clear call to action.',
          },
        },
        {
          id: 'send_email',
          type: 'actionMarketingEmail',
          position: { x: 980, y: 10 },
          data: {
            fromName: 'Montr Team',
            subject: 'A quick next step for {{$trigger.contact.firstName}}',
            listId: 'lead-nurture',
            content:
              'Hi {{$trigger.contact.firstName}}, here is a short follow-up based on your recent activity. Adjust the segment, sender, and final copy before activation.',
          },
        },
      ],
      edges: [
        {
          id: 'edge_schedule_delay',
          source: 'schedule_trigger',
          target: 'email_delay',
          type: 'custom-edge',
        },
        {
          id: 'edge_delay_prompt',
          source: 'email_delay',
          target: 'email_prompt',
          type: 'custom-edge',
        },
        {
          id: 'edge_prompt_email',
          source: 'email_prompt',
          target: 'send_email',
          type: 'custom-edge',
        },
      ],
      variables: [],
    },
  },
  {
    _id: 'official_support_triage',
    name: 'Support Triage Assistant',
    description:
      'Route an incoming support request through AI-assisted drafting, then respond with WhatsApp while leaving room for human escalation.',
    category: 'customer-support',
    difficulty: 'intermediate',
    tags: ['support', 'triage', 'whatsapp'],
    screenshots: [],
    useCases: ['Auto-respond to customer support messages', 'Triage and classify incoming requests', 'Draft AI-powered first responses'],
    requirements: ['WhatsApp account connected'],
    compatibleTriggers: ['triggerWhatsApp'],
    authorName: 'Montr AI',
    usageCount: 1560,
    rating: 4.9,
    ratingCount: 112,
    isFeatured: true,
    isOfficial: true,
    source: 'official',
    isBuiltIn: true,
    stepCount: 3,
    setupTime: 8,
    version: '1.0.0',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    flowData: {
      nodes: [
        {
          id: 'whatsapp_trigger',
          type: 'triggerWhatsApp',
          position: { x: 0, y: 40 },
          data: {},
        },
        {
          id: 'support_prompt',
          type: 'promptNode',
          position: { x: 320, y: 10 },
          data: {
            prompt:
              'Classify the customer issue, draft a calm first response, and mention whether this should be escalated.',
          },
        },
        {
          id: 'support_reply',
          type: 'actionWhatsApp',
          position: { x: 680, y: 40 },
          data: {
            messageType: 'text',
            recipientField: '{{$trigger.contact.phone}}',
            message:
              'Thanks for the message. We have received your request and are reviewing the best next step for you.',
          },
        },
      ],
      edges: [
        {
          id: 'edge_whatsapp_prompt',
          source: 'whatsapp_trigger',
          target: 'support_prompt',
          type: 'custom-edge',
        },
        {
          id: 'edge_prompt_reply',
          source: 'support_prompt',
          target: 'support_reply',
          type: 'custom-edge',
        },
      ],
      variables: [],
    },
  },
  {
    _id: 'official_lead_qualification',
    name: 'Lead Qualification Pipeline',
    description:
      'Accept a webhook lead, enrich the message with an AI prompt, and push a qualified follow-up sequence for the sales team.',
    category: 'sales',
    difficulty: 'advanced',
    tags: ['sales', 'qualification', 'webhook'],
    screenshots: [],
    useCases: ['Qualify inbound leads automatically', 'Route qualified leads to the sales team', 'Generate AI lead scores'],
    requirements: ['Webhook endpoint configured', 'Email provider configured'],
    compatibleTriggers: ['triggerWebhook'],
    authorName: 'Montr AI',
    usageCount: 430,
    rating: 4.5,
    ratingCount: 29,
    isFeatured: false,
    isOfficial: true,
    source: 'official',
    isBuiltIn: true,
    stepCount: 4,
    setupTime: 15,
    version: '1.0.0',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    flowData: {
      nodes: [
        {
          id: 'webhook_trigger',
          type: 'triggerWebhook',
          position: { x: 0, y: 40 },
          data: {},
        },
        {
          id: 'qualification_prompt',
          type: 'promptNode',
          position: { x: 320, y: 10 },
          data: {
            prompt:
              'Review the incoming lead details, identify urgency, and propose the strongest next sales action in one short paragraph.',
          },
        },
        {
          id: 'qualification_delay',
          type: 'logicDelay',
          position: { x: 680, y: 40 },
          data: { duration: 30, unit: 'minutes' },
        },
        {
          id: 'qualification_email',
          type: 'actionMarketingEmail',
          position: { x: 1000, y: 10 },
          data: {
            fromName: 'Sales Team',
            subject: 'Next step for {{$trigger.contact.firstName}}',
            listId: 'qualified-leads',
            content:
              'Review the qualification summary from the previous step, then tailor the outreach before sending.',
          },
        },
      ],
      edges: [
        {
          id: 'edge_webhook_prompt',
          source: 'webhook_trigger',
          target: 'qualification_prompt',
          type: 'custom-edge',
        },
        {
          id: 'edge_prompt_delay',
          source: 'qualification_prompt',
          target: 'qualification_delay',
          type: 'custom-edge',
        },
        {
          id: 'edge_delay_email',
          source: 'qualification_delay',
          target: 'qualification_email',
          type: 'custom-edge',
        },
      ],
      variables: [],
    },
  },
  {
    _id: 'official_content_repurpose',
    name: 'Content Repurposing Starter',
    description:
      'Take one source idea, transform it through an AI prompt, then send the result into document output for review and publishing.',
    category: 'ai-assistants',
    difficulty: 'beginner',
    tags: ['content', 'ai', 'repurposing'],
    screenshots: [],
    useCases: ['Repurpose blog posts into emails', 'Transform ideas into structured documents', 'Generate multi-format content from one source'],
    requirements: [],
    compatibleTriggers: ['textInput'],
    authorName: 'Montr AI',
    usageCount: 720,
    rating: 4.6,
    ratingCount: 47,
    isFeatured: true,
    isOfficial: true,
    source: 'official',
    isBuiltIn: true,
    stepCount: 3,
    setupTime: 6,
    version: '1.0.0',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    flowData: {
      nodes: [
        {
          id: 'content_source',
          type: 'textInput',
          position: { x: 0, y: 40 },
          data: {
            text: 'Paste a source idea, transcript, or campaign brief here.',
          },
        },
        {
          id: 'content_prompt',
          type: 'promptNode',
          position: { x: 340, y: 10 },
          data: {
            prompt:
              'Turn the source material into a short post, an email angle, and a document outline with clear sections.',
          },
        },
        {
          id: 'content_document',
          type: 'documentNode',
          position: { x: 700, y: 40 },
          data: {},
        },
      ],
      edges: [
        {
          id: 'edge_source_prompt',
          source: 'content_source',
          target: 'content_prompt',
          type: 'custom-edge',
        },
        {
          id: 'edge_prompt_document',
          source: 'content_prompt',
          target: 'content_document',
          type: 'custom-edge',
        },
      ],
      variables: [],
    },
  },
];

export function cloneCanvasTemplateFlowData(flowData: CanvasTemplateFlowData): CanvasTemplateFlowData {
  return JSON.parse(JSON.stringify(flowData)) as CanvasTemplateFlowData;
}

export function listBuiltInCanvasTemplates(): CanvasTemplateDetail[] {
  return BUILT_IN_CANVAS_TEMPLATES.map((template) => ({
    ...template,
    flowData: cloneCanvasTemplateFlowData(template.flowData),
  }));
}

export function getBuiltInCanvasTemplateById(id: string): CanvasTemplateDetail | null {
  const template = BUILT_IN_CANVAS_TEMPLATES.find((item) => item._id === id);
  if (!template) {
    return null;
  }

  return {
    ...template,
    flowData: cloneCanvasTemplateFlowData(template.flowData),
  };
}

export function matchesCanvasTemplateFilters(
  template: CanvasTemplateSummary,
  filters: CanvasTemplateFilters,
): boolean {
  const category = filters.category?.trim();
  const difficulty = filters.difficulty?.trim();
  const search = filters.search?.trim().toLowerCase();

  if (category && category !== 'all' && template.category !== category) {
    return false;
  }

  if (difficulty && difficulty !== 'all' && template.difficulty !== difficulty) {
    return false;
  }

  if (filters.featured && !template.isFeatured) {
    return false;
  }

  if (search) {
    const haystack = [
      template.name,
      template.description,
      template.category,
      template.authorName,
      ...(template.tags || []),
    ]
      .join(' ')
      .toLowerCase();

    if (!haystack.includes(search)) {
      return false;
    }
  }

  return true;
}
