export type MissionTemplate = {
  id: string;
  title: string;
  description: string;
  summary: string;
  starterPrompt: string;
  badgeLabel: string;
  /** Template IDs to launch when this mission completes (B1-6.3). */
  onComplete?: string[];
  /** Suggested recurring schedule hint shown in the UI (B1-6.1). */
  recurring?: { cron: string; label: string };
};

export type MissionSavedView = {
  id: 'active' | 'approval' | 'scheduled' | 'completed' | 'all';
  label: string;
  status?: 'active' | 'waiting' | 'scheduled' | 'completed';
};

const missionTemplates: MissionTemplate[] = [
  {
    id: 'campaign-launch',
    title: 'Campaign launch',
    description: 'Coordinate launch planning, assets, approvals, and next actions across channels.',
    summary: 'Build a launch mission with planning, execution sequencing, and linked outputs.',
    starterPrompt: 'Create a campaign launch mission. Break the work into launch phases, identify the critical outputs, and tell me what should happen first, what needs approval, and what can run immediately.',
    badgeLabel: 'Launch',
  },
  {
    id: 'content-repurpose',
    title: 'Content repurpose',
    description: 'Turn one source asset into multiple outputs, drafts, and distribution tasks.',
    summary: 'Repurpose an existing source into structured multi-channel outputs.',
    starterPrompt: 'Create a content repurposing mission. Start from one source asset, recommend the highest-value derivative pieces, and organize the work into drafts, tasks, and approvals.',
    badgeLabel: 'Content',
  },
  {
    id: 'lead-follow-up',
    title: 'Lead follow-up',
    description: 'Organize next-touch outreach, task sequencing, and follow-up messaging.',
    summary: 'Build a follow-up mission for pipeline movement and consistent outreach.',
    starterPrompt: 'Create a lead follow-up mission. Identify the highest-priority contacts, suggest the next touch for each, and turn the work into a clear action plan.',
    badgeLabel: 'CRM',
    onComplete: ['analytics-review'],
  },
  {
    id: 'analytics-review',
    title: 'Analytics review',
    description: 'Analyze recent performance, surface findings, and convert them into actions.',
    summary: 'Review performance signals and convert them into prioritized next steps.',
    starterPrompt: 'Create an analytics review mission. Summarize the strongest and weakest performance signals, explain what changed, and turn the findings into concrete actions.',
    badgeLabel: 'Insights',
    recurring: { cron: '0 9 * * 1', label: 'Every Monday 9 am' },
    onComplete: ['campaign-launch'],
  },
  {
    id: 'knowledge-synthesis',
    title: 'Knowledge synthesis',
    description: 'Turn scattered context into reusable knowledge, summaries, and structured next steps.',
    summary: 'Synthesize source material into reusable knowledge and a clear mission brief.',
    starterPrompt: 'Create a knowledge synthesis mission. Pull together the key context, identify what should be saved to Brand Memory, and outline the actions that should follow from it.',
    badgeLabel: 'Knowledge',
  },
  {
    id: 'recruitment',
    title: 'Recruitment campaign',
    description: 'Source candidates, run outreach, schedule interviews, and track hiring funnel.',
    summary: 'End-to-end hiring mission: sourcing → outreach → screening → scheduling.',
    starterPrompt: 'Create a recruitment mission. Define the role, identify sourcing channels (LinkedIn, referrals, job boards), draft outreach messages, and plan the screening and interview schedule.',
    badgeLabel: 'Hiring',
  },
  {
    id: 'content-factory',
    title: 'Content factory',
    description: 'Batch-generate images, copy, videos, and social posts for a campaign.',
    summary: 'Bulk-produce on-brand content assets across channels using AI Studio.',
    starterPrompt: 'Create a content factory mission. Define the creative brief and target channels, then batch-generate copy, images, and video scripts ready for review and publishing.',
    badgeLabel: 'Content',
  },
  {
    id: 'inbox-triage',
    title: 'Inbox triage',
    description: 'Review open conversations, draft replies, escalate high-priority threads.',
    summary: 'Work through the omnichannel inbox: respond, assign, and escalate.',
    starterPrompt: 'Create an inbox triage mission. Review open conversations across WhatsApp, email, and chat. Draft replies for routine queries, flag high-priority threads for escalation, and assign any that need a human touch.',
    badgeLabel: 'Inbox',
  },
  {
    id: 'follow-up-cadence',
    title: 'Follow-up cadence',
    description: 'Run a structured multi-touch follow-up sequence for a contact list.',
    summary: 'Execute email + WhatsApp + call cadence across a lead segment.',
    starterPrompt: 'Create a follow-up cadence mission. Define the contact segment, sequence the touchpoints (email → WhatsApp → call), set timing gaps, and track responses.',
    badgeLabel: 'Outreach',
  },
  {
    id: 'win-back',
    title: 'Win-back campaign',
    description: 'Re-engage churned or dormant customers with targeted offers and messaging.',
    summary: 'Identify lapsed customers, craft win-back offers, and run the outreach.',
    starterPrompt: 'Create a win-back mission. Identify dormant or churned contacts, segment them by last-active date and value, craft tailored win-back offers, and schedule the outreach sequence.',
    badgeLabel: 'Retention',
  },
  {
    id: 'performance-review',
    title: 'Performance review',
    description: 'Audit campaign metrics, identify what worked and what did not, and produce recommendations.',
    summary: 'Deep-dive into recent performance and build an action plan from findings.',
    starterPrompt: 'Create a performance review mission. Pull the last 30 days of campaign and channel metrics, identify top performers and underperformers, explain the causes, and propose concrete actions.',
    badgeLabel: 'Analytics',
    recurring: { cron: '0 8 1 * *', label: '1st of every month 8 am' },
  },
  {
    id: 'prospect-engagement',
    title: 'Prospect engagement',
    description: 'Coordinate one prospect across email, WhatsApp, and calls — one continuous, interconnected thread.',
    summary: 'Cross-channel engagement for a single prospect: grounded in their CRM timeline, sequenced across channels.',
    starterPrompt: `Engage the prospect referenced in this mission's context as ONE continuous conversation across channels. Rules:
1. GROUND FIRST — resolve_contact / getContact and read their full CRM activity timeline before any outreach. Never contact someone you have not looked up.
2. OWNERSHIP — if the mission context says a human owns the conversation, do NOT message the prospect; log a CRM activity and coordinate with the owner instead. If an AI bot handles the live thread, act only OUTSIDE that thread (e.g. schedule a call, send a calendar invite) — never double-reply.
3. SEQUENCE ACROSS CHANNELS — pick the channel that fits the moment: email for detail, WhatsApp for quick coordination and confirmations, calls for reminders and pitches. Example: meeting booked over email → schedule a reminder call before it AND WhatsApp the meeting details.
4. LOG EVERYTHING — after every touch, createActivity on the contact so humans and future missions see the full thread.
5. PACE — use sleep_until between touches; never burst-message a prospect. Respect business hours.
6. All sends and calls go through approval per the brand's settings.`,
    badgeLabel: 'Engage',
  },
];

const defaultMissionViews: MissionSavedView[] = [
  { id: 'active', label: 'Active', status: 'active' },
  { id: 'approval', label: 'Needs approval', status: 'waiting' },
  { id: 'scheduled', label: 'Scheduled', status: 'scheduled' },
  { id: 'completed', label: 'Completed', status: 'completed' },
  { id: 'all', label: 'All missions' },
];

export function getMissionTemplates() {
  return missionTemplates;
}

export function getMissionTemplateById(id: string) {
  return missionTemplates.find((template) => template.id === id) || null;
}

export function getDefaultMissionViews() {
  return defaultMissionViews;
}
