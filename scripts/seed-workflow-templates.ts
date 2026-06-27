/**
 * Seed Workflow Templates (TODO 2.18) — curated marketing/sales template pack.
 *
 * Run with: npx tsx scripts/seed-workflow-templates.ts
 *
 * Style mirrors scripts/seed-plans.ts: connect, upsert-by-name through the
 * Mongoose model (so documents match the WorkflowTemplate schema the install
 * route reads), print a summary, exit. Idempotent — safe to re-run.
 *
 * Every node `subType` below is a REAL engine subType verified against
 * src/lib/workflow/node-processors/index.ts and the engine's category dispatch
 * (unified-execution-engine.ts):
 *   - AI nodes (type:'ai') resolve `ai_${subType}` then `${subType}`
 *     → subType 'generate_text' → ai_generate_text ✓
 *   - action nodes resolve `${subType}` then `action_${subType}`
 *     → send_marketing_email, send_whatsapp_template, send_sms, create_contact,
 *       add_tag, send_telegram, publish_social, http_request ✓
 *   - logic 'branch'/'switch'/'filter'/'router' handled inline ✓
 *   - control 'delay'/'loop' inline; 'wait_for_channel_response' via registry ✓
 *   - data nodes resolve `data_${subType}` then `${subType}`
 *     → find_records, marketing_analytics→data_marketing_analytics,
 *       ads_insights→data_ads_insights ✓
 *
 * The install route copies trigger/nodes/edges verbatim into a UnifiedWorkflow
 * (status 'draft'), replacing `{{param}}` placeholders with install-time values.
 * Required connections are noted in each template description.
 */

import { dbConnect } from '../src/lib/db/connect';
import WorkflowTemplate from '../src/lib/db/models/workflow-template.model';
import { Types } from 'mongoose';

// Deterministic system author id so re-seeds don't churn the author field.
const SYSTEM_AUTHOR_ID = new Types.ObjectId('000000000000000000000001');

interface SeedNode {
  id: string;
  type: 'trigger' | 'action' | 'logic' | 'ai' | 'data' | 'integration' | 'control';
  subType: string;
  position: { x: number; y: number };
  data: { label?: string; description?: string; config: Record<string, unknown> };
}

interface SeedEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

interface SeedTemplate {
  name: string;
  description: string;
  longDescription?: string;
  category: string;
  tags: string[];
  difficulty: 'easy' | 'medium' | 'advanced';
  workflowType: 'whatsapp' | 'crm' | 'marketing_email' | 'unified';
  trigger: { type: string; config: Record<string, unknown> };
  nodes: SeedNode[];
  edges: SeedEdge[];
  variables: Array<Record<string, unknown>>;
  parameters: Array<Record<string, unknown>>;
  requirements: Array<{ type: 'integration' | 'field' | 'credential' | 'feature'; name: string; description: string; required: boolean }>;
  setupTime?: number;
  isFeatured?: boolean;
}

const COMMON = {
  authorId: SYSTEM_AUTHOR_ID,
  authorName: 'MontrAI',
  authorType: 'system' as const,
  isOfficial: true,
  isVerified: true,
  isPublished: true,
  version: 1,
};

const templates: SeedTemplate[] = [
  // 1) Lead form → CRM contact → welcome email
  {
    name: 'Lead Form → CRM Contact → Welcome Email',
    description:
      'When a hosted form is submitted, create a CRM contact and send a welcome email. Requires: a published form and a connected email provider.',
    category: 'marketing',
    tags: ['lead', 'form', 'crm', 'welcome', 'email'],
    difficulty: 'easy',
    workflowType: 'unified',
    setupTime: 5,
    isFeatured: true,
    trigger: { type: 'form_submission', config: {} },
    nodes: [
      {
        id: 'trigger',
        type: 'trigger',
        subType: 'form_submission',
        position: { x: 120, y: 160 },
        data: { label: 'Form submitted', config: {} },
      },
      {
        id: 'create_contact',
        type: 'action',
        subType: 'create_contact',
        position: { x: 420, y: 160 },
        data: {
          label: 'Create contact',
          config: {
            firstName: '{{trigger.payload.firstName}}',
            email: '{{trigger.payload.email}}',
            phone: '{{trigger.payload.phone}}',
            tags: ['lead'],
          },
        },
      },
      {
        id: 'welcome_email',
        type: 'action',
        subType: 'send_marketing_email',
        position: { x: 720, y: 160 },
        data: {
          label: 'Send welcome email',
          config: {
            recipientMode: 'single',
            recipientEmail: '{{trigger.payload.email}}',
            templateId: '{{welcomeTemplateId}}',
            providerId: '{{emailProviderId}}',
          },
        },
      },
    ],
    edges: [
      { id: 'e1', source: 'trigger', target: 'create_contact' },
      { id: 'e2', source: 'create_contact', target: 'welcome_email' },
    ],
    variables: [],
    parameters: [
      { key: 'welcomeTemplateId', label: 'Welcome email template', description: 'Marketing-email template to send', type: 'string', required: false },
      { key: 'emailProviderId', label: 'Email provider', description: 'Connected email provider id', type: 'string', required: false },
    ],
    requirements: [
      { type: 'feature', name: 'Hosted form', description: 'A published public form', required: true },
      { type: 'integration', name: 'Email provider', description: 'A connected marketing-email provider', required: true },
    ],
  },

  // 2) Abandoned cart (Shopify carts/update) → wait → WhatsApp template nudge
  {
    name: 'Abandoned Cart → WhatsApp Nudge',
    description:
      'When a Shopify cart updates, wait, then send an approved WhatsApp template nudge. Requires: connected Shopify store (carts/update webhook) + an approved WhatsApp template.',
    category: 'marketing',
    tags: ['shopify', 'abandoned-cart', 'whatsapp', 'ecommerce', 'recovery'],
    difficulty: 'medium',
    workflowType: 'unified',
    setupTime: 10,
    isFeatured: true,
    trigger: { type: 'integration_webhook', config: { provider: 'shopify', topics: ['carts/update'] } },
    nodes: [
      {
        id: 'trigger',
        type: 'trigger',
        subType: 'integration_webhook',
        position: { x: 120, y: 160 },
        data: { label: 'Shopify cart updated', config: { provider: 'shopify', topics: ['carts/update'] } },
      },
      {
        id: 'wait',
        type: 'control',
        subType: 'delay',
        position: { x: 420, y: 160 },
        data: { label: 'Wait 1 hour', config: { delayMs: 3_600_000 } },
      },
      {
        id: 'nudge',
        type: 'action',
        subType: 'send_whatsapp_template',
        position: { x: 720, y: 160 },
        data: {
          label: 'WhatsApp nudge',
          config: {
            templateId: '{{cartTemplateId}}',
            templateLanguage: 'en_US',
            parameters: [],
          },
        },
      },
    ],
    edges: [
      { id: 'e1', source: 'trigger', target: 'wait' },
      { id: 'e2', source: 'wait', target: 'nudge' },
    ],
    variables: [],
    parameters: [
      { key: 'cartTemplateId', label: 'WhatsApp template', description: 'Approved WhatsApp template id for the nudge', type: 'string', required: false },
    ],
    requirements: [
      { type: 'integration', name: 'Shopify', description: 'Connected Shopify store with the carts/update webhook', required: true },
      { type: 'integration', name: 'WhatsApp', description: 'WhatsApp Business account with an approved template', required: true },
    ],
  },

  // 3) New deal stage → Slack/notify team (via Telegram action as the team channel)
  {
    name: 'Deal Stage Changed → Notify Team',
    description:
      'When a deal moves stage, post an alert to your team channel via Telegram. Requires: a connected Telegram bot + chat id.',
    category: 'sales',
    tags: ['crm', 'deals', 'pipeline', 'notify', 'telegram'],
    difficulty: 'easy',
    workflowType: 'crm',
    setupTime: 5,
    trigger: { type: 'stage_changed', config: {} },
    nodes: [
      {
        id: 'trigger',
        type: 'trigger',
        subType: 'stage_changed',
        position: { x: 120, y: 160 },
        data: { label: 'Deal stage changed', config: {} },
      },
      {
        id: 'notify',
        type: 'action',
        subType: 'send_telegram',
        position: { x: 420, y: 160 },
        data: {
          label: 'Notify team',
          config: {
            chatId: '{{teamChatId}}',
            text: '📈 Deal "{{trigger.record.name}}" moved to {{trigger.record.stage}}.',
          },
        },
      },
    ],
    edges: [{ id: 'e1', source: 'trigger', target: 'notify' }],
    variables: [],
    parameters: [
      { key: 'teamChatId', label: 'Team chat id', description: 'Telegram chat id for the team channel', type: 'string', required: false },
    ],
    requirements: [
      { type: 'credential', name: 'Telegram bot', description: 'A connected Telegram bot token', required: true },
    ],
  },

  // 4) Inbound email → AI classify → route/notify
  {
    name: 'Inbound Email → AI Classify → Route',
    description:
      'When email lands at a connected mailbox, classify it with AI and route urgent mail to your team. Requires: a connected mailbox + a connected Telegram bot for alerts.',
    category: 'support',
    tags: ['email', 'ai', 'classify', 'routing', 'support'],
    difficulty: 'medium',
    workflowType: 'unified',
    setupTime: 10,
    trigger: { type: 'email_received', config: {} },
    nodes: [
      {
        id: 'trigger',
        type: 'trigger',
        subType: 'email_received',
        position: { x: 120, y: 200 },
        data: { label: 'Email received', config: {} },
      },
      {
        id: 'classify',
        type: 'ai',
        subType: 'generate_text',
        position: { x: 420, y: 200 },
        data: {
          label: 'AI classify',
          config: {
            model: 'openai/gpt-4o-mini',
            systemPrompt: 'You are a support triage assistant. Reply with one word: URGENT or NORMAL.',
            prompt: 'Subject: {{trigger.message.subject}}\n\nBody: {{trigger.message.body}}',
          },
        },
      },
      {
        id: 'is_urgent',
        type: 'logic',
        subType: 'branch',
        position: { x: 720, y: 200 },
        data: { label: 'Urgent?', config: { condition: "{{$classify.text}}.includes('URGENT')" } },
      },
      {
        id: 'alert',
        type: 'action',
        subType: 'send_telegram',
        position: { x: 1020, y: 120 },
        data: {
          label: 'Alert team',
          config: { chatId: '{{teamChatId}}', text: '🚨 Urgent email: {{trigger.message.subject}}' },
        },
      },
    ],
    edges: [
      { id: 'e1', source: 'trigger', target: 'classify' },
      { id: 'e2', source: 'classify', target: 'is_urgent' },
      { id: 'e3', source: 'is_urgent', target: 'alert', sourceHandle: 'true' },
    ],
    variables: [],
    parameters: [
      { key: 'teamChatId', label: 'Team chat id', description: 'Telegram chat id for urgent alerts', type: 'string', required: false },
    ],
    requirements: [
      { type: 'integration', name: 'Mailbox', description: 'A connected email channel', required: true },
      { type: 'credential', name: 'Telegram bot', description: 'A connected Telegram bot token for alerts', required: false },
    ],
  },

  // 5) Weekly ads summary trigger → AI summary → email team
  {
    name: 'Weekly Ads Summary → AI Recap → Email Team',
    description:
      'Once a week, pull ad metrics, summarize them with AI, and email the recap to your team. Requires: connected ad accounts + email provider.',
    category: 'marketing',
    tags: ['ads', 'analytics', 'ai', 'weekly', 'report'],
    difficulty: 'medium',
    workflowType: 'unified',
    setupTime: 10,
    trigger: { type: 'ads_weekly_summary', config: {} },
    nodes: [
      {
        id: 'trigger',
        type: 'trigger',
        subType: 'ads_weekly_summary',
        position: { x: 120, y: 200 },
        data: { label: 'Weekly ads summary', config: {} },
      },
      {
        id: 'insights',
        type: 'data',
        subType: 'ads_insights',
        position: { x: 420, y: 200 },
        data: { label: 'Read ad metrics', config: { platform: 'all', entityType: 'account', days: 7 } },
      },
      {
        id: 'summary',
        type: 'ai',
        subType: 'generate_text',
        position: { x: 720, y: 200 },
        data: {
          label: 'AI recap',
          config: {
            model: 'openai/gpt-4o',
            systemPrompt: 'You are a performance-marketing analyst. Write a concise weekly recap with key numbers and one recommendation.',
            prompt: 'Here is this week\'s ad data: {{$insights}}',
          },
        },
      },
      {
        id: 'email',
        type: 'action',
        subType: 'send_marketing_email',
        position: { x: 1020, y: 200 },
        data: {
          label: 'Email team',
          config: {
            recipientMode: 'single',
            recipientEmail: '{{teamEmail}}',
            templateId: '{{recapTemplateId}}',
            providerId: '{{emailProviderId}}',
          },
        },
      },
    ],
    edges: [
      { id: 'e1', source: 'trigger', target: 'insights' },
      { id: 'e2', source: 'insights', target: 'summary' },
      { id: 'e3', source: 'summary', target: 'email' },
    ],
    variables: [],
    parameters: [
      { key: 'teamEmail', label: 'Team email', description: 'Where to send the weekly recap', type: 'string', required: false },
      { key: 'recapTemplateId', label: 'Recap template', description: 'Marketing-email template for the recap', type: 'string', required: false },
      { key: 'emailProviderId', label: 'Email provider', description: 'Connected email provider id', type: 'string', required: false },
    ],
    requirements: [
      { type: 'integration', name: 'Ad accounts', description: 'Connected Google/Meta ad accounts', required: true },
      { type: 'integration', name: 'Email provider', description: 'A connected marketing-email provider', required: true },
    ],
  },

  // 6) Find contacts tagged X → forEach → personalized email
  {
    name: 'Tagged Contacts → Personalized Email Each',
    description:
      'Find contacts with a tag, then email each one a personalized message. Requires: a connected email provider. Set the "Run once per item" toggle on the email node after install.',
    category: 'nurture',
    tags: ['crm', 'segment', 'email', 'personalized', 'bulk'],
    difficulty: 'medium',
    workflowType: 'unified',
    setupTime: 10,
    trigger: { type: 'manual', config: {} },
    nodes: [
      {
        id: 'trigger',
        type: 'trigger',
        subType: 'manual',
        position: { x: 120, y: 200 },
        data: { label: 'Run manually', config: {} },
      },
      {
        id: 'find',
        type: 'data',
        subType: 'find_records',
        position: { x: 420, y: 200 },
        data: {
          label: 'Find tagged contacts',
          config: { entityType: 'contact', tag: '{{tagId}}', limit: 200 },
        },
      },
      {
        id: 'email_each',
        type: 'action',
        subType: 'send_marketing_email',
        position: { x: 720, y: 200 },
        data: {
          label: 'Email each contact',
          // forEach.{enabled,sourcePath} drives the engine's per-item fan-out
          // (1.1). Each iteration exposes `item` in scope → {{item.email}}.
          config: {
            forEach: { enabled: true, sourcePath: '{{$find.records}}' },
            recipientMode: 'single',
            recipientEmail: '{{item.email}}',
            templateId: '{{nurtureTemplateId}}',
            providerId: '{{emailProviderId}}',
          },
        },
      },
    ],
    edges: [
      { id: 'e1', source: 'trigger', target: 'find' },
      { id: 'e2', source: 'find', target: 'email_each' },
    ],
    variables: [],
    parameters: [
      { key: 'tagId', label: 'Tag', description: 'Tag id/name to match contacts', type: 'string', required: false },
      { key: 'nurtureTemplateId', label: 'Email template', description: 'Marketing-email template to send each contact', type: 'string', required: false },
      { key: 'emailProviderId', label: 'Email provider', description: 'Connected email provider id', type: 'string', required: false },
    ],
    requirements: [
      { type: 'integration', name: 'Email provider', description: 'A connected marketing-email provider', required: true },
    ],
  },

  // 7) Missed WhatsApp window → SMS fallback (wait-for-reply + onError/errorPath)
  {
    name: 'WhatsApp Reply Wait → SMS Fallback',
    description:
      'Send a WhatsApp template, wait for a reply; if the WhatsApp send fails (e.g. closed 24h window), fall back to SMS. Requires: WhatsApp Business account + a Twilio voice number for SMS.',
    category: 'engagement',
    tags: ['whatsapp', 'sms', 'fallback', 'wait-for-reply', 'error-handling'],
    difficulty: 'advanced',
    workflowType: 'unified',
    setupTime: 15,
    trigger: { type: 'manual', config: {} },
    nodes: [
      {
        id: 'trigger',
        type: 'trigger',
        subType: 'manual',
        position: { x: 120, y: 200 },
        data: { label: 'Run manually', config: {} },
      },
      {
        id: 'wa',
        type: 'action',
        subType: 'send_whatsapp_template',
        position: { x: 420, y: 200 },
        data: {
          label: 'Send WhatsApp',
          // onError 'errorPath' routes failures down the reserved 'error' handle.
          config: {
            templateId: '{{waTemplateId}}',
            templateLanguage: 'en_US',
            parameters: [],
            onError: 'errorPath',
          },
        },
      },
      {
        id: 'wait_reply',
        type: 'control',
        subType: 'wait_for_channel_response',
        position: { x: 720, y: 120 },
        data: { label: 'Wait for reply', config: { channel: 'whatsapp', maxWaitSec: 86400, outputVar: 'reply' } },
      },
      {
        id: 'sms',
        type: 'action',
        subType: 'send_sms',
        position: { x: 720, y: 300 },
        data: {
          label: 'SMS fallback',
          config: { message: '{{smsBody}}' },
        },
      },
    ],
    edges: [
      { id: 'e1', source: 'trigger', target: 'wa' },
      { id: 'e2', source: 'wa', target: 'wait_reply' },
      // Reserved 'error' handle → SMS fallback when the WhatsApp send fails.
      { id: 'e3', source: 'wa', target: 'sms', sourceHandle: 'error' },
    ],
    variables: [],
    parameters: [
      { key: 'waTemplateId', label: 'WhatsApp template', description: 'Approved WhatsApp template id', type: 'string', required: false },
      { key: 'smsBody', label: 'SMS body', description: 'Fallback SMS message', type: 'string', required: false, defaultValue: 'We tried to reach you on WhatsApp — reply here and we\'ll help.' },
    ],
    requirements: [
      { type: 'integration', name: 'WhatsApp', description: 'WhatsApp Business account with an approved template', required: true },
      { type: 'credential', name: 'Twilio', description: 'A Twilio voice number for SMS fallback', required: true },
    ],
  },

  // 8) RSS new item (poll via HTTP) → AI rewrite → social post draft (pending approval)
  {
    name: 'New Content → AI Rewrite → Social Draft',
    description:
      'On a schedule, fetch a content feed, rewrite the latest item with AI, and create a social post (pending approval — never auto-published). Requires: connected social accounts.',
    category: 'marketing',
    tags: ['rss', 'content', 'ai', 'social', 'draft', 'scheduled'],
    difficulty: 'advanced',
    workflowType: 'unified',
    setupTime: 15,
    trigger: { type: 'scheduled', config: { cronExpression: '0 9 * * *', timezone: 'UTC' } },
    nodes: [
      {
        id: 'trigger',
        type: 'trigger',
        subType: 'scheduled',
        position: { x: 120, y: 200 },
        data: { label: 'Daily at 9am', config: { cronExpression: '0 9 * * *', timezone: 'UTC' } },
      },
      {
        id: 'fetch',
        type: 'integration',
        subType: 'http_request',
        position: { x: 420, y: 200 },
        data: {
          label: 'Fetch feed',
          config: { url: '{{feedUrl}}', method: 'GET', responseFormat: 'text' },
        },
      },
      {
        id: 'rewrite',
        type: 'ai',
        subType: 'generate_text',
        position: { x: 720, y: 200 },
        data: {
          label: 'AI rewrite',
          config: {
            model: 'openai/gpt-4o',
            systemPrompt: 'You are a social-media copywriter. Turn the source into one punchy post under 280 characters.',
            prompt: 'Source content: {{$fetch.body}}',
          },
        },
      },
      {
        id: 'draft',
        type: 'action',
        subType: 'publish_social',
        position: { x: 1020, y: 200 },
        data: {
          label: 'Create social draft',
          // requireApproval makes the post a pending-approval item, not live.
          config: {
            caption: '{{$rewrite.text}}',
            selectedChannels: [],
            requireApproval: true,
          },
        },
      },
    ],
    edges: [
      { id: 'e1', source: 'trigger', target: 'fetch' },
      { id: 'e2', source: 'fetch', target: 'rewrite' },
      { id: 'e3', source: 'rewrite', target: 'draft' },
    ],
    variables: [],
    parameters: [
      { key: 'feedUrl', label: 'Feed URL', description: 'The RSS/content feed URL to poll', type: 'string', required: false },
    ],
    requirements: [
      { type: 'integration', name: 'Social accounts', description: 'At least one connected social account', required: true },
    ],
  },
];

async function seedWorkflowTemplates() {
  try {
    await dbConnect();
    console.log('Connected to database');

    for (const tpl of templates) {
      const doc = { ...COMMON, ...tpl, lastUpdatedAt: new Date(), publishedAt: new Date() };
      const existing = await WorkflowTemplate.findOne({ name: tpl.name, authorType: 'system' });
      if (existing) {
        console.log(`Updating template: ${tpl.name}`);
        await WorkflowTemplate.updateOne({ _id: existing._id }, { $set: doc });
      } else {
        console.log(`Creating template: ${tpl.name}`);
        await WorkflowTemplate.create(doc);
      }
    }

    console.log('\n✅ Workflow templates seeded successfully!');
    console.log(`Total templates: ${templates.length}`);
    console.log('─'.repeat(64));
    for (const tpl of templates) {
      console.log(`${tpl.name.padEnd(44)} | ${tpl.category.padEnd(10)} | ${tpl.difficulty}`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Failed to seed workflow templates:', error);
    process.exit(1);
  }
}

seedWorkflowTemplates();
