export type DocsOverviewCollectionId = 'modules' | 'systems' | 'flows' | 'reference';

export interface DocsOverviewEntry {
  title: string;
  description: string;
}

export interface DocsOverviewCollection {
  id: DocsOverviewCollectionId;
  label: string;
  description: string;
  items: DocsOverviewEntry[];
}

export interface DocsOverviewMetric {
  id: DocsOverviewCollectionId;
  label: string;
  value: string;
}

export interface DocsStarterTemplate {
  id: string;
  title: string;
  description: string;
  content: string;
}

export interface DocsOverviewChange {
  date: string;
  title: string;
  description: string;
}

export const docsOverviewCollections: DocsOverviewCollection[] = [
  {
    id: 'modules',
    label: 'Modules',
    description: 'Primary product surfaces that teams work in every day.',
    items: [
      { title: 'Unified Canvas', description: 'Automation, orchestration, and content generation flows.' },
      { title: 'Social Media', description: 'Scheduling, calendar, approvals, drafts, and media management.' },
      { title: 'CRM', description: 'Contacts, deals, pipeline, and activity timelines.' },
      { title: 'Forms', description: 'Form builder, public submissions, and lead capture.' },
      { title: 'Docs', description: 'Rich document editing, publishing, and knowledge capture.' },
      { title: 'AI Studio', description: 'Conversational AI workspace and model-driven workflows.' },
      { title: 'WhatsApp', description: 'Messaging, campaigns, and customer engagement.' },
      { title: 'Marketing Email', description: 'Campaigns, templates, and outbound email execution.' },
      { title: 'Admin Panel', description: 'Users, plans, AI models, and platform-wide controls.' },
    ],
  },
  {
    id: 'systems',
    label: 'Systems',
    description: 'Shared platform capabilities that cut across every module.',
    items: [
      { title: 'Auth & RBAC', description: 'Session auth, roles, and guarded access to privileged operations.' },
      { title: 'Settings & Connections', description: 'User settings, provider connections, and billing surfaces.' },
      { title: 'Storage', description: 'AWS S3, Wasabi, and connected Google Drive storage destinations.' },
      { title: 'Media Library', description: 'Brand-scoped media folders, tags, metadata, imports, and reuse.' },
      { title: 'Brand Management', description: 'Brand context for social accounts, storage, and integrations.' },
      { title: 'Credits', description: 'Usage tracking and credit deductions for AI and automation features.' },
      { title: 'AI Layer', description: 'Genkit, Vercel AI SDK, providers, models, and task routing.' },
      { title: 'Agentic Framework', description: 'Tool-use, copilot behavior, and self-healing workflow patterns.' },
      { title: 'Multi-Tenancy', description: 'Organization scoping and isolation across all data access.' },
      { title: 'Queue Jobs', description: 'BullMQ-backed async processing, schedules, and execution fan-out.' },
      { title: 'i18n', description: 'Language support, localization, and RTL-aware interfaces.' },
    ],
  },
  {
    id: 'flows',
    label: 'Flows',
    description: 'Cross-module handoffs that explain how data moves through the product.',
    items: [
      { title: 'Forms to CRM', description: 'Submissions create leads and keep pipeline data current.' },
      { title: 'Canvas to Social', description: 'Generated content turns into scheduled or published social posts.' },
      { title: 'Canvas to Docs', description: 'Automation output can become structured internal documentation.' },
      { title: 'WhatsApp to CRM', description: 'Conversations enrich contact records and timeline history.' },
      { title: 'AI Integration', description: 'AI assistance spans Docs, Canvas, CRM, and Social workflows.' },
    ],
  },
  {
    id: 'reference',
    label: 'Reference',
    description: 'Reference material that keeps implementation and operations aligned.',
    items: [
      { title: 'Environment Variables', description: 'Deployment and provider configuration requirements.' },
      { title: 'External APIs', description: 'Third-party services, OAuth integrations, and external dependencies.' },
      { title: 'Known Issues', description: 'Documented limitations, gaps, and follow-up work.' },
      { title: 'Deployment', description: 'Operational setup notes and production deployment guidance.' },
    ],
  },
];

export const docsOverviewRecentChanges: DocsOverviewChange[] = [
  {
    date: '2026-03-15',
    title: 'Social calendar draft tracking',
    description: 'Drafts now stay visible after scheduling, lock while scheduled, and track repeated-post history.',
  },
  {
    date: '2026-03-11',
    title: 'Drag-and-drop social calendar',
    description: 'Calendar scheduling now supports draft drag-and-drop and direct rescheduling across dates.',
  },
  {
    date: '2026-03-03',
    title: 'Knowledge ingestion expansion',
    description: 'Docs, forms, CRM, inbox, and social signals now feed the platform knowledge layer.',
  },
  {
    date: '2026-02-27',
    title: 'Authentication expansion',
    description: 'Google Sign-In and email OTP login were added to the platform auth stack.',
  },
];

export function getDocsOverviewMetrics(
  collections: DocsOverviewCollection[] = docsOverviewCollections,
): DocsOverviewMetric[] {
  return collections.map((collection) => ({
    id: collection.id,
    label: collection.label,
    value: String(collection.items.length),
  }));
}

export function buildArchitectureStarterHtml(): string {
  const collectionSections = docsOverviewCollections
    .map((collection) => {
      const items = collection.items
        .map((item) => `<li><strong>${item.title}</strong>: ${item.description}</li>`)
        .join('');

      return `<h2>${collection.label}</h2><p>${collection.description}</p><ul>${items}</ul>`;
    })
    .join('');

  const changeItems = docsOverviewRecentChanges
    .map(
      (change) =>
        `<li><strong>${change.date} — ${change.title}</strong>: ${change.description}</li>`,
    )
    .join('');

  return [
    '<h1>Montr AI Platform Overview</h1>',
    '<p>Montr AI is a unified marketing workflow platform combining automation, social media management, CRM, forms, documents, AI tooling, design, WhatsApp, and marketing email inside one multi-tenant system.</p>',
    '<p>This starter document is based on the current platform overview and is intended to give teams a durable baseline for architecture, onboarding, and implementation planning.</p>',
    collectionSections,
    '<h2>Storage Snapshot</h2><p>File handling spans AWS S3, Wasabi, and connected Google Drive storage for supported media workflows.</p>',
    '<h2>Cross-Module Flows</h2><p>These handoffs matter when tracing ownership, automation triggers, and downstream side effects.</p>',
    '<ul>',
    '<li><strong>Forms to CRM</strong>: submissions create and enrich contacts.</li>',
    '<li><strong>Canvas to Social</strong>: generated content moves into scheduling and publishing.</li>',
    '<li><strong>Canvas to Docs</strong>: automation output becomes persistent documentation.</li>',
    '<li><strong>WhatsApp to CRM</strong>: conversations update pipeline context and engagement history.</li>',
    '<li><strong>AI Integration</strong>: AI assistance is available across Docs, Canvas, CRM, and Social.</li>',
    '</ul>',
    '<h2>Recent Platform Changes</h2>',
    `<ul>${changeItems}</ul>`,
  ].join('');
}

export const docsStarterTemplates: DocsStarterTemplate[] = [
  {
    id: 'meeting-notes',
    title: 'Meeting Notes',
    description: 'Capture meeting details, attendees, decisions, and follow-ups.',
    content: '<h1>Meeting Notes</h1><p>Date: </p><p>Attendees: </p><h2>Agenda</h2><ul><li></li></ul><h2>Decisions</h2><ul><li></li></ul><h2>Action Items</h2><ul><li></li></ul>',
  },
  {
    id: 'project-proposal',
    title: 'Project Proposal',
    description: 'Outline goals, scope, owners, delivery plan, and success metrics.',
    content: '<h1>Project Proposal</h1><h2>Executive Summary</h2><p>...</p><h2>Problem</h2><p>...</p><h2>Approach</h2><p>...</p><h2>Success Metrics</h2><ul><li></li></ul>',
  },
  {
    id: 'project-plan',
    title: 'Project Plan',
    description: 'Break work into milestones, owners, dependencies, and dates.',
    content: '<h1>Project Plan</h1><h2>Objectives</h2><ul><li></li></ul><h2>Milestones</h2><ul><li></li></ul><h2>Dependencies</h2><ul><li></li></ul>',
  },
  {
    id: 'system-architecture',
    title: 'Platform Overview',
    description: 'Create a fresh architecture document from the current platform overview.',
    content: buildArchitectureStarterHtml(),
  },
];
