// Node type definitions for WhatsApp Automation Builder
export type NodeType = 'trigger' | 'message' | 'logic' | 'ai' | 'data' | 'api';

export interface NodeDefinition {
    type: NodeType;
    subType: string;
    label: string;
    description: string;
    icon: string;
    color: string;
    category: string;
    defaultData?: Record<string, unknown>;
}

// Trigger Nodes
export const TRIGGER_NODES: NodeDefinition[] = [
    {
        type: 'trigger',
        subType: 'on-message',
        label: 'On Message',
        description: 'Triggers when any message is received',
        icon: '📨',
        color: '#10b981',
        category: 'Triggers',
        defaultData: {
            accountFilter: null,
            contactFilter: null,
        },
    },
    {
        type: 'trigger',
        subType: 'keywords',
        label: 'Keywords',
        description: 'Triggers on specific keywords or phrases',
        icon: '🔑',
        color: '#10b981',
        category: 'Triggers',
        defaultData: {
            keywords: [],
            matchType: 'contains',
            caseSensitive: false,
        },
    },
    {
        type: 'trigger',
        subType: 'time',
        label: 'Time-based',
        description: 'Triggers at scheduled times',
        icon: '⏰',
        color: '#10b981',
        category: 'Triggers',
        defaultData: {
            cronExpression: '0 9 * * *',
            timezone: 'UTC',
            isRecurring: true,
        },
    },
];

// Message Nodes
export const MESSAGE_NODES: NodeDefinition[] = [
    {
        type: 'message',
        subType: 'send-text',
        label: 'Send Text',
        description: 'Send a text message',
        icon: '💬',
        color: '#3b82f6',
        category: 'Messages',
        defaultData: {
            message: '',
            variables: [],
        },
    },
    {
        type: 'message',
        subType: 'send-image',
        label: 'Send Image',
        description: 'Send an image with optional caption',
        icon: '🖼️',
        color: '#3b82f6',
        category: 'Messages',
        defaultData: {
            imageUrl: '',
            caption: '',
        },
    },
    {
        type: 'message',
        subType: 'send-pdf',
        label: 'Send PDF',
        description: 'Send a PDF document',
        icon: '📄',
        color: '#3b82f6',
        category: 'Messages',
        defaultData: {
            pdfUrl: '',
            filename: 'document.pdf',
        },
    },
    {
        type: 'message',
        subType: 'send-video',
        label: 'Send Video',
        description: 'Send a video with optional caption',
        icon: '🎥',
        color: '#3b82f6',
        category: 'Messages',
        defaultData: {
            videoUrl: '',
            caption: '',
        },
    },
    {
        type: 'message',
        subType: 'send-template',
        label: 'Send Template',
        description: 'Send a WhatsApp template message',
        icon: '📋',
        color: '#3b82f6',
        category: 'Messages',
        defaultData: {
            templateId: '',
            parameters: [],
        },
    },
    {
        type: 'message',
        subType: 'send-buttons',
        label: 'Message with Buttons',
        description: 'Send interactive button message',
        icon: '🔘',
        color: '#3b82f6',
        category: 'Messages',
        defaultData: {
            text: '',
            buttons: [
                { id: '1', title: 'Button 1' },
                { id: '2', title: 'Button 2' },
            ],
        },
    },
    {
        type: 'message',
        subType: 'send-list',
        label: 'Send List',
        description: 'Send interactive list message',
        icon: '📝',
        color: '#3b82f6',
        category: 'Messages',
        defaultData: {
            header: 'Choose an option',
            body: '',
            buttonText: 'View Options',
            sections: [
                {
                    title: 'Section 1',
                    rows: [
                        { id: '1', title: 'Option 1', description: '' },
                    ],
                },
            ],
        },
    },
];

// Logic Nodes
export const LOGIC_NODES: NodeDefinition[] = [
    {
        type: 'logic',
        subType: 'branch',
        label: 'Branch',
        description: 'Conditional routing based on conditions',
        icon: '🔀',
        color: '#f59e0b',
        category: 'Logic',
        defaultData: {
            conditions: [
                {
                    variable: '',
                    operator: 'equals',
                    value: '',
                    output: 'true',
                },
            ],
            defaultOutput: 'false',
        },
    },
    {
        type: 'logic',
        subType: 'counter',
        label: 'Counter',
        description: 'Increment or decrement a counter',
        icon: '🔢',
        color: '#f59e0b',
        category: 'Logic',
        defaultData: {
            variable: 'counter',
            operation: 'increment',
            value: 1,
        },
    },
    {
        type: 'logic',
        subType: 'delay',
        label: 'Delay',
        description: 'Pause execution for specified time',
        icon: '⏱️',
        color: '#f59e0b',
        category: 'Logic',
        defaultData: {
            duration: 60,
            unit: 'seconds',
        },
    },
    {
        type: 'logic',
        subType: 'end',
        label: 'End',
        description: 'Terminate workflow execution',
        icon: '🛑',
        color: '#ef4444',
        category: 'Logic',
        defaultData: {
            status: 'success',
            message: 'Workflow completed',
        },
    },
];

// AI Nodes
export const AI_NODES: NodeDefinition[] = [
    {
        type: 'ai',
        subType: 'agentic',
        label: 'AI Agent',
        description: 'AI-powered response generation',
        icon: '🤖',
        color: '#8b5cf6',
        category: 'AI',
        defaultData: {
            systemPrompt: 'You are a helpful customer service assistant.',
            contextVariables: [],
            model: 'gpt-4',
            temperature: 0.7,
        },
    },
];

// Data Nodes
export const DATA_NODES: NodeDefinition[] = [
    {
        type: 'data',
        subType: 'variables',
        label: 'Set Variable',
        description: 'Set or update workflow variables',
        icon: '📦',
        color: '#06b6d4',
        category: 'Data',
        defaultData: {
            operations: [
                {
                    variable: '',
                    operation: 'set',
                    value: '',
                },
            ],
        },
    },
    {
        type: 'data',
        subType: 'knowledge-base',
        label: 'Knowledge Base',
        description: 'Query knowledge base',
        icon: '📚',
        color: '#06b6d4',
        category: 'Data',
        defaultData: {
            query: '',
            knowledgeBaseId: '',
            maxResults: 5,
        },
    },
    {
        type: 'data',
        subType: 'bot-config',
        label: 'Bot Config',
        description: 'Configure bot behavior',
        icon: '⚙️',
        color: '#06b6d4',
        category: 'Data',
        defaultData: {
            personality: 'friendly',
            language: 'en',
            tone: 'professional',
        },
    },
];

// API Nodes
export const API_NODES: NodeDefinition[] = [
    {
        type: 'api',
        subType: 'http-request',
        label: 'HTTP Request',
        description: 'Make external API calls',
        icon: '🌐',
        color: '#ec4899',
        category: 'API',
        defaultData: {
            url: '',
            method: 'GET',
            headers: {},
            body: {},
        },
    },
    {
        type: 'api',
        subType: 'assign-agent',
        label: 'Assign to Agent',
        description: 'Assign conversation to human agent',
        icon: '👤',
        color: '#ec4899',
        category: 'API',
        defaultData: {
            agentId: '',
            priority: 'normal',
            note: '',
        },
    },
    {
        type: 'api',
        subType: 'assign-group',
        label: 'Assign to Group',
        description: 'Assign to agent group',
        icon: '👥',
        color: '#ec4899',
        category: 'API',
        defaultData: {
            groupId: '',
            routingStrategy: 'round-robin',
        },
    },
];

// All nodes combined
export const ALL_NODES = [
    ...TRIGGER_NODES,
    ...MESSAGE_NODES,
    ...LOGIC_NODES,
    ...AI_NODES,
    ...DATA_NODES,
    ...API_NODES,
];

// Get node definition by type and subtype
export function getNodeDefinition(type: NodeType, subType: string): NodeDefinition | undefined {
    return ALL_NODES.find((n) => n.type === type && n.subType === subType);
}

// Group nodes by category
export function getNodesByCategory(): Record<string, NodeDefinition[]> {
    const grouped: Record<string, NodeDefinition[]> = {};

    ALL_NODES.forEach((node) => {
        if (!grouped[node.category]) {
            grouped[node.category] = [];
        }
        grouped[node.category].push(node);
    });

    return grouped;
}
