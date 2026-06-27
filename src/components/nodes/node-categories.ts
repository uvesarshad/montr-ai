/**
 * Single source of truth for node taxonomy + visual theming.
 *
 * Every canvas node belongs to exactly one category. The category drives:
 *   - left-border accent on NodeShell
 *   - icon-chip background in the node header
 *   - handle fill color (NodeHandle)
 *   - minimap node color
 *   - QuickNodeSearch grouping
 *
 * Color is NEVER painted on the card body itself — only on the accent edges.
 */

export type NodeCategory =
    | 'input'    // pulls data into the workflow (triggers + data sources)
    | 'ai'       // model-powered nodes (prompt, generate image/video, agentic, chatbot, smart-router)
    | 'logic'    // branch, delay, loop, sub-workflow, group
    | 'action'   // sends data out / mutates external state (publish, whatsapp, email, telegram, http)
    | 'output'   // terminal/visual outputs (document, designer)
    | 'utility'; // sticky note, comment

export interface CategoryTheme {
    /** Hex used for handle fill, ring, header underline, minimap. */
    accent: string;
    /** Tailwind class string for the icon chip background + foreground. */
    iconBg: string;
    /** Human-readable label shown in the node header. */
    label: string;
}

export const CATEGORY_THEME: Record<NodeCategory, CategoryTheme> = {
    input:   { accent: '#F59E0B', iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',     label: 'Input'   },
    ai:      { accent: '#8B5CF6', iconBg: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',  label: 'AI'      },
    logic:   { accent: '#06B6D4', iconBg: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',        label: 'Logic'   },
    action:  { accent: '#10B981', iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', label: 'Action' },
    output:  { accent: '#6366F1', iconBg: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',  label: 'Output'  },
    utility: { accent: '#737373', iconBg: 'bg-neutral-500/10 text-neutral-600 dark:text-neutral-400', label: 'Utility' },
};

export const NODE_CATEGORY: Record<string, NodeCategory> = {
    // input — triggers + data sources
    triggerWebhook:    'input',
    triggerSchedule:   'input',
    triggerManual:     'input',
    triggerWhatsApp:   'input',
    triggerEmail:      'input',
    triggerSocial:     'input',
    triggerKeyword:    'input',
    triggerTelegram:   'input',
    triggerPolling:    'input',
    triggerIntegrationWebhook: 'input',
    triggerAdLead:     'input',
    textInput:         'input',
    fileNode:          'input',
    imageNode:         'input',
    websiteNode:       'input',
    youtubeNode:       'input',
    audioNode:         'input',
    googleSearchNode:  'input',
    adsInsightsNode:   'input',

    // ai — model-powered nodes
    promptNode:        'ai',
    aiChatbot:         'ai',
    generateImage:     'ai',
    generateVideo:     'ai',
    agenticNode:       'ai',
    chatbotNode:       'ai',
    audioBotNode:      'ai',
    smartRouterNode:   'ai',

    // logic — control flow
    logicBranch:       'logic',
    logicDelay:        'logic',
    logicLoop:         'logic',
    groupNode:         'logic',
    subWorkflowNode:   'logic',

    // action — outbound side effects
    publishNode:               'action',
    actionWhatsApp:            'action',
    actionMarketingEmail:      'action',
    actionConversationalEmail: 'action',
    telegramNode:              'action',
    instagramNode:             'action',
    instagramDMNode:           'action',
    linkedinNode:              'action',
    xNode:                     'action',
    redditNode:                'action',
    pinterestNode:             'action',
    facebookNode:              'action',
    googleBusinessNode:        'action',
    notionNode:                'action',
    googleWorkspaceNode:       'action',
    httpRequestNode:           'action',
    // Integrations hub (2026-06 expansion)
    mailchimpNode:             'action',
    hubspotNode:               'action',
    airtableNode:              'action',
    zohoNode:                  'action',
    webflowNode:               'action',
    bloggerNode:               'action',
    wordpressNode:             'action',
    apolloNode:                'action',
    semrushNode:               'action',
    revenuecatNode:            'action',
    n8nNode:                   'action',
    shopifyNode:               'action',
    stripeNode:                'action',

    // output — terminal/visual outputs
    documentNode:      'output',

    // utility
    stickyNote:        'utility',
};

/** Resolve a node type id to its category, falling back to 'utility'. */
export function categoryFor(nodeType: string | undefined): NodeCategory {
    if (!nodeType) return 'utility';
    return NODE_CATEGORY[nodeType] ?? 'utility';
}

/** Resolve a node type id to its theme. */
export function themeFor(nodeType: string | undefined): CategoryTheme {
    return CATEGORY_THEME[categoryFor(nodeType)];
}
