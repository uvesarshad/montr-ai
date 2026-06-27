/**
 * Multi-Agent System — Agent Definitions
 * 
 * Each specialist agent has:
 * - A unique ID and display name
 * - A specialized system prompt
 * - A list of tools it can access
 * - Intent keywords for routing
 */

export interface AgentDefinition {
    id: string;
    name: string;
    emoji: string;
    description: string;
    systemPromptAddition: string;
    tools: string[];           // Tool names this agent can use
    intentKeywords: string[];  // Keywords for routing
    requiredRole?: string;     // Minimum role to use this agent
}

/**
 * Specialist agents. The coordinator routes to the best match.
 */
export const AGENT_DEFINITIONS: AgentDefinition[] = [
    {
        id: 'crm-agent',
        name: 'CRM Agent',
        emoji: '👥',
        description: 'Handles contacts, deals, and pipeline management.',
        systemPromptAddition: `You are a CRM specialist. Help the user manage contacts, create and track deals, and navigate their sales pipeline. Always provide deal values and stage context when relevant. Use the available CRM tools proactively.`,
        tools: ['createContact', 'getContact', 'listContacts', 'updateContact', 'createActivity',
            'createCompany', 'getCompany', 'listCompanies',
            'createDeal', 'updateDealStage', 'getDealsPipeline', 'listDeals',
            'resolve_contact', 'find_contact_by_attribute', 'merge_contacts',
            'list_workspace_docs', 'read_doc', 'write_workspace_doc', 'sleep_until',
            'createPlan', 'completeMission', 'reportBlocked'],
        intentKeywords: ['contact', 'deal', 'pipeline', 'crm', 'lead', 'customer', 'sale', 'prospect', 'opportunity', 'revenue', 'company', 'account'],
    },
    {
        id: 'social-agent',
        name: 'Social Media Agent',
        emoji: '📱',
        description: 'Creates social content, schedules posts, and analyzes performance.',
        systemPromptAddition: `You are a social media marketing specialist. Help craft engaging posts, schedule content, and analyze social performance. When creating posts, consider platform best practices (character limits, hashtags, emojis). Always ask about target platform and timing preferences.`,
        tools: ['schedulePost', 'getAnalytics', 'getCurrentDate',
            'list_social_accounts', 'list_scheduled_posts', 'get_post_performance',
            'import_social_content', 'analyze_inspiration',
            'list_workspace_docs', 'read_doc', 'write_workspace_doc', 'sleep_until',
            'createPlan', 'completeMission', 'reportBlocked'],
        intentKeywords: ['post', 'social', 'content', 'instagram', 'twitter', 'linkedin', 'facebook', 'schedule', 'draft', 'analytics', 'engagement', 'hashtag'],
    },
    {
        id: 'knowledge-agent',
        name: 'Knowledge Agent',
        emoji: '🧠',
        description: 'Manages brand memory, searches knowledge base, and stores important information.',
        systemPromptAddition: `You are a knowledge management specialist. Help the user find information from their brand's knowledge base, save important facts and guidelines, manage documents, and maintain the brand's working memory. When saving information, create clear, searchable titles. Use the memory tools for durable key-value facts and the doc tools for long-form content.`,
        tools: ['searchKnowledgeBase', 'addToKnowledgeBase',
            'create_doc', 'update_doc',
            'ingest_website', 'analyze_inspiration',
            'read_memory', 'write_memory', 'delete_memory', 'list_memory_keys',
            'list_workspace_docs', 'read_doc', 'write_workspace_doc', 'sleep_until',
            'createPlan', 'completeMission', 'reportBlocked'],
        intentKeywords: ['knowledge', 'memory', 'remember', 'save', 'find', 'search', 'docs', 'document', 'guideline', 'brand info', 'faq'],
    },
    {
        id: 'marketing-agent',
        name: 'Marketing Agent',
        emoji: '🎯',
        description: 'Manages the marketing roadmap, executes tasks, and iterates strategy based on performance.',
        systemPromptAddition: `You are a proactive Marketing Strategist. You manage the user's marketing roadmap and can:
1. SHOW roadmap tasks and progress — use getRoadmapTasks to see what's pending.
2. EXECUTE roadmap tasks by triggering the right actions (creating posts, contacts, campaigns) — use executeRoadmapTask. The user will get approval prompts.
3. COMPLETE tasks when the user confirms they're done — use completeRoadmapTask.
4. ADD new tasks based on strategic insights — use addRoadmapTask.
5. ANALYZE performance across Social, Email, WhatsApp, paid ads, traffic, and search — use getCrossChannelReport, get_ads_insights, and get_marketing_analytics.
6. ITERATE the marketing plan based on analytics — use iterateMarketingPlan.
GOAL MODE: when the user states a measurable business goal (grow X to Y, GTM, scale a channel), NEVER answer with a prose-only strategy — call generate_strategy with their goal so it becomes a versioned, executable artifact, present the result, then offer activate_strategy (requires their approval) to turn it into missions.
Always explain what you're about to do and why. Be proactive: suggest next tasks, highlight wins, and flag underperforming areas.
ADS: you can READ performance (get_ads_insights, get_ad_leads) and DRAFT campaigns with create_ad_campaign — every draft goes to the user as an approval card, is created PAUSED, and the user activates it. You can never modify, pause, or delete live campaigns. Ground every budget recommendation in real insights data.`,
        tools: ['getRoadmapTasks', 'completeRoadmapTask', 'addRoadmapTask', 'executeRoadmapTask',
            'getCrossChannelReport', 'getEmailCampaignMetrics', 'getWhatsAppCampaignMetrics',
            'get_ads_insights', 'get_marketing_analytics', 'get_ad_leads',
            'schedule_campaign', 'get_campaign_metrics',
            'list_ad_accounts', 'create_ad_campaign',
            'list_social_accounts', 'list_scheduled_posts', 'get_post_performance',
            'iterateMarketingPlan', 'schedulePost', 'createContact', 'searchKnowledgeBase',
            'generate_strategy', 'get_strategy', 'activate_strategy', 'iterate_strategy',
            'create_scheduled_task', 'list_scheduled_tasks',
            'delegate_to_agent', 'list_workspace_docs', 'read_doc', 'write_workspace_doc', 'sleep_until',
            'createPlan', 'completeMission', 'reportBlocked'],
        intentKeywords: ['roadmap', 'marketing plan', 'marketing task', 'xp', 'level', 'marketing',
            'strategy', 'performance report', 'analytics report', 'iterate plan', 'adjust plan',
            'execute task', 'campaign results', 'what should I do', 'next task', 'marketing roadmap'],
    },
    // ─── B1-3.2 specialist agents ─────────────────────────────────────────────

    {
        id: 'recruitment-agent',
        name: 'Recruitment Agent',
        emoji: '🔍',
        description: 'Sources candidates, manages hiring pipelines, and automates outreach.',
        systemPromptAddition: `You are a recruitment and talent-acquisition specialist. Help the user source candidates, manage hiring pipelines, draft job descriptions, and automate candidate outreach via WhatsApp or email. Always confirm candidate details before sending outreach. Use CRM tools to track candidates as contacts.`,
        tools: [
            'resolve_contact', 'find_contact_by_attribute', 'getContact', 'listContacts', 'createContact',
            'send_whatsapp_text', 'send_whatsapp_template', 'send_whatsapp_image', 'send_inbox_email',
            'list_conversations', 'read_conversation',
            'check_availability', 'create_calendar_event',
            'list_workspace_docs', 'read_doc', 'write_workspace_doc', 'sleep_until',
            'createPlan', 'completeMission', 'reportBlocked',
        ],
        intentKeywords: [
            'recruit', 'hire', 'hiring', 'candidate', 'job', 'talent', 'sourcing',
            'interview', 'onboard', 'cv', 'resume', 'applicant', 'vacancy', 'position',
        ],
    },
    {
        id: 'content-factory-agent',
        name: 'Content Factory Agent',
        emoji: '🏭',
        description: 'Generates bulk content — posts, copy, images, and videos — using AI Studio.',
        systemPromptAddition: `You are a content production specialist. Batch-generate marketing copy, social posts, images, videos, and audio assets. Use AI Studio tools to create media, then schedule posts across platforms. Always confirm tone, format, and target audience before bulk creation.`,
        tools: [
            'generate_text', 'generate_image', 'generate_video', 'generate_audio', 'list_characters',
            'schedulePost', 'getAnalytics', 'searchKnowledgeBase', 'addToKnowledgeBase',
            'list_social_accounts', 'list_scheduled_posts', 'get_post_performance',
            'ingest_website', 'import_social_content', 'analyze_inspiration',
            'create_doc', 'update_doc',
            'list_workspace_docs', 'read_doc', 'write_workspace_doc', 'sleep_until',
            'createPlan', 'completeMission', 'reportBlocked',
        ],
        intentKeywords: [
            'content', 'copy', 'copywriting', 'generate', 'bulk', 'batch', 'image', 'video',
            'audio', 'asset', 'caption', 'ad creative', 'blog', 'article', 'script',
        ],
    },
    {
        id: 'inbox-agent',
        name: 'Inbox Agent',
        emoji: '📬',
        description: 'Handles omnichannel conversations, drafts replies, and escalates as needed.',
        systemPromptAddition: `You are an omnichannel inbox specialist. Help the user manage conversations across WhatsApp, email, and chat. Draft replies, summarise threads, escalate to humans when needed, and resolve contact identities. Always read the full conversation before replying.`,
        tools: [
            'list_conversations', 'read_conversation', 'send_reply', 'assign_to_user', 'escalate_conversation',
            'resolve_contact', 'find_contact_by_attribute', 'getContact',
            'get_inbox_thread',
            'send_whatsapp_text', 'send_whatsapp_image', 'send_whatsapp_buttons', 'send_inbox_email',
            'list_workspace_docs', 'read_doc', 'write_workspace_doc', 'sleep_until',
            'createPlan', 'completeMission', 'reportBlocked',
        ],
        intentKeywords: [
            'inbox', 'conversation', 'reply', 'message', 'thread', 'chat', 'ticket',
            'escalate', 'assign', 'respond', 'unread', 'customer message',
        ],
    },
    {
        id: 'strategy-agent',
        name: 'Strategy Agent',
        emoji: '🗺️',
        description: 'Turns business goals into executing strategies — generates, activates, and iterates multi-mission marketing strategies.',
        systemPromptAddition: `You are a senior marketing strategist and the owner of Goal Mode. When the user states a measurable business goal (grow orders/users/revenue, launch GTM, scale a channel):
1. GENERATE — call generate_strategy with their goal and constraints. Ground it in analytics (getCrossChannelReport, get_marketing_analytics, get_ads_insights) and the knowledge base.
2. PRESENT — show the strategy concisely: goals/KPIs, channels, content mix, cadence. Refine via generate_strategy again if the user pushes back.
3. ACTIVATE — when the user is happy, call activate_strategy. This requests their approval once, then decomposes the strategy into a roadmap and spawns dependency-ordered missions automatically.
4. ITERATE — on a cadence (offer create_scheduled_task for a weekly iterate_strategy check) or on demand, call iterate_strategy to produce the next data-driven version.
5. DISTILL — when a strategy or campaign measurably works, write the approach into the workspace Playbooks/ folder (write_workspace_doc): what was done, the numbers, and when to reuse it. Playbooks automatically ground future strategies for this brand.
Always explain strategic reasoning. Never just "double the ad spend" — diversify across owned, earned, and paid channels.`,
        tools: [
            'generate_strategy', 'get_strategy', 'activate_strategy', 'iterate_strategy',
            'getAnalytics', 'getCrossChannelReport', 'getEmailCampaignMetrics', 'getWhatsAppCampaignMetrics',
            'get_ads_insights', 'get_marketing_analytics', 'get_ad_leads',
            'list_ad_accounts', 'create_ad_campaign',
            'getRoadmapTasks', 'addRoadmapTask', 'completeRoadmapTask', 'iterateMarketingPlan',
            'searchKnowledgeBase', 'addToKnowledgeBase',
            'create_scheduled_task', 'list_scheduled_tasks',
            'create_mission_trigger', 'list_mission_triggers',
            'delegate_to_agent', 'list_workspace_docs', 'read_doc', 'write_workspace_doc', 'sleep_until',
            'createPlan', 'completeMission', 'reportBlocked',
        ],
        intentKeywords: [
            'strategy', 'strategic', 'roadmap', 'plan', 'planning', 'vision', 'goals',
            'iterate', 'pivot', 'growth', 'market', 'positioning', 'audience', 'funnel',
            'scale', 'double', 'gtm', 'go to market', 'grow my', 'increase revenue',
            'more orders', 'more users', 'more customers', 'business goal',
        ],
    },
    {
        id: 'ops-agent',
        name: 'Ops Agent',
        emoji: '⚙️',
        description: 'Handles operational tasks — workflows, automation, approvals, forms, and integrations.',
        systemPromptAddition: `You are an operations and automation specialist. Trigger and manage workflows, set up automated processes, handle approval queues, manage forms and submissions, and coordinate data operations. Always confirm workflow details and destructive operations before executing, and explain what each automation will do. Prefer reversible actions when possible.`,
        tools: [
            'list_workflows', 'get_execution_status', 'cancel_execution', 'triggerWorkflow',
            'list_integrations',
            'list_form_submissions', 'create_form', 'request_approval', 'get_approval_status',
            'create_scheduled_task', 'list_scheduled_tasks', 'cancel_scheduled_task',
            'create_mission_trigger', 'list_mission_triggers', 'delete_mission_trigger',
            'getCurrentDate', 'searchKnowledgeBase',
            'delegate_to_agent', 'list_workspace_docs', 'read_doc', 'write_workspace_doc', 'sleep_until',
            'createPlan', 'completeMission', 'reportBlocked',
        ],
        intentKeywords: [
            'workflow', 'automation', 'trigger', 'automate', 'cron', 'execute', 'run', 'ops', 'operation',
            'approval', 'form', 'submission', 'export', 'integration', 'process', 'task queue',
        ],
    },
    {
        id: 'voice-agent',
        name: 'Voice Agent',
        emoji: '📞',
        description: 'Places and schedules phone calls, runs call campaigns, and retrieves transcripts.',
        systemPromptAddition: `You are a voice-calling specialist. Help the user place outbound calls, schedule calls for later, run bulk call campaigns, and review call transcripts. Always resolve and confirm the contact and the purpose of the call before initiating. Calls are gated for approval — clearly state the goal, talking points, and expected duration in every call request.`,
        tools: [
            'initiate_call', 'schedule_call', 'get_call_transcript', 'bulk_call',
            'resolve_contact', 'find_contact_by_attribute', 'getContact', 'listContacts',
            'check_availability', 'create_calendar_event', 'getCurrentDate',
            'list_workspace_docs', 'read_doc', 'write_workspace_doc', 'sleep_until',
            'createPlan', 'completeMission', 'reportBlocked',
        ],
        intentKeywords: [
            'call', 'phone', 'dial', 'ring', 'voice', 'voicemail', 'transcript',
            'callback', 'call campaign', 'cold call', 'phone call', 'call them',
        ],
    },

    {
        id: 'general-agent',
        name: 'General Assistant',
        emoji: '✨',
        description: 'General-purpose assistant for questions, planning, and multi-domain tasks.',
        systemPromptAddition: `You are a versatile marketing assistant. Help with general questions, planning, brainstorming, and any task that doesn't fit a specific specialist. You can use any available tool.`,
        tools: ['*'], // All tools
        intentKeywords: [], // Catch-all — handles anything not matched by specialists
    },
];

/**
 * Get an agent definition by ID.
 */
export function getAgentById(agentId: string): AgentDefinition | undefined {
    return AGENT_DEFINITIONS.find(a => a.id === agentId);
}

/**
 * Get all agents accessible to a given user role.
 */
export function getAccessibleAgents(userRole: string = 'user'): AgentDefinition[] {
    const rolePriority: Record<string, number> = {
        'user': 1,
        'admin': 2,
        'super_admin': 3,
    };

    const userLevel = rolePriority[userRole] || 1;

    return AGENT_DEFINITIONS.filter(agent => {
        if (!agent.requiredRole) return true;
        return (rolePriority[agent.requiredRole] || 1) <= userLevel;
    });
}
