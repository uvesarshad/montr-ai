import { Node, Edge } from 'reactflow';

export interface WorkflowTemplate {
    id: string;
    name: string;
    description: string;
    category: 'support' | 'sales' | 'marketing' | 'onboarding' | 'utility';
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    nodes: Node[];
    edges: Edge[];
    trigger: {
        type: 'message' | 'keywords' | 'time';
        config: Record<string, unknown>;
    };
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
    {
        id: 'welcome-bot',
        name: 'Simple Welcome Bot',
        description: 'Auto-reply to any incoming message with a welcome greeting and menu options.',
        category: 'onboarding',
        difficulty: 'beginner',
        trigger: {
            type: 'message',
            config: {},
        },
        nodes: [
            {
                id: 'node-1',
                type: 'custom',
                position: { x: 250, y: 100 },
                data: {
                    nodeType: 'message',
                    subType: 'send-text',
                    label: 'Welcome Message',
                    config: {
                        message: 'Hi there! Welcome to our service. How can we help you today?'
                    }
                }
            },
            {
                id: 'node-2',
                type: 'custom',
                position: { x: 250, y: 250 },
                data: {
                    nodeType: 'message',
                    subType: 'send-buttons',
                    label: 'Main Menu',
                    config: {
                        message: 'Please choose an option:',
                        buttons: [
                            { id: 'btn-1', title: 'Support' },
                            { id: 'btn-2', title: 'Pricing' },
                            { id: 'btn-3', title: 'Talk to human' }
                        ]
                    }
                }
            }
        ],
        edges: [
            {
                id: 'edge-1',
                source: 'node-1',
                target: 'node-2',
                sourceHandle: 'bottom',
                targetHandle: 'top'
            }
        ]
    },
    {
        id: 'keyword-reply',
        name: 'Keyword Auto-Responder',
        description: 'Respond to specific keywords like "price" or "help" with targeted information.',
        category: 'utility',
        difficulty: 'beginner',
        trigger: {
            type: 'keywords',
            config: {
                keywords: ['price', 'pricing', 'cost'],
                matchType: 'contains'
            }
        },
        nodes: [
            {
                id: 'node-1',
                type: 'custom',
                position: { x: 250, y: 100 },
                data: {
                    nodeType: 'message',
                    subType: 'send-text',
                    label: 'Pricing Info',
                    config: {
                        message: 'Our pricing starts at $10/month. You can find more details at example.com/pricing'
                    }
                }
            },
            {
                id: 'node-2',
                type: 'custom',
                position: { x: 250, y: 250 },
                data: {
                    nodeType: 'logic',
                    subType: 'delay',
                    label: 'Wait 2s',
                    config: {
                        duration: 2,
                        unit: 'seconds'
                    }
                }
            },
            {
                id: 'node-3',
                type: 'custom',
                position: { x: 250, y: 400 },
                data: {
                    nodeType: 'message',
                    subType: 'send-text',
                    label: 'Follow up',
                    config: {
                        message: 'Would you like to speak with a sales representative?'
                    }
                }
            }
        ],
        edges: [
            { id: 'edge-1', source: 'node-1', target: 'node-2' },
            { id: 'edge-2', source: 'node-2', target: 'node-3' }
        ]
    },
    {
        id: 'customer-feedback',
        name: 'Customer Feedback Collection',
        description: 'Collect feedback after a support interaction or purchase.',
        category: 'support',
        difficulty: 'intermediate',
        trigger: {
            type: 'keywords',
            config: {
                keywords: ['feedback'],
                matchType: 'exact'
            }
        },
        nodes: [
            {
                id: 'node-1',
                type: 'custom',
                position: { x: 250, y: 50 },
                data: {
                    nodeType: 'message',
                    subType: 'send-buttons',
                    label: 'Rate Experience',
                    config: {
                        message: 'How would you rate your experience with us?',
                        buttons: [
                            { id: 'good', title: 'Good' },
                            { id: 'bad', title: 'Bad' }
                        ]
                    }
                }
            },
            {
                id: 'node-2',
                type: 'custom',
                position: { x: 250, y: 250 },
                data: {
                    nodeType: 'logic',
                    subType: 'branch',
                    label: 'Check Rating',
                    config: {
                        variable: 'button_reply_id',
                        operator: 'equals',
                        value: 'good'
                    }
                }
            },
            {
                id: 'node-3',
                type: 'custom',
                position: { x: 100, y: 400 },
                data: {
                    nodeType: 'message',
                    subType: 'send-text',
                    label: 'Thank You',
                    config: {
                        message: 'Examples! We are glad you liked it.'
                    }
                }
            },
            {
                id: 'node-4',
                type: 'custom',
                position: { x: 400, y: 400 },
                data: {
                    nodeType: 'message',
                    subType: 'send-text',
                    label: 'Apology',
                    config: {
                        message: 'We are sorry to hear that. How can we improve?'
                    }
                }
            }
        ],
        edges: [
            { id: 'edge-1', source: 'node-1', target: 'node-2' },
            { id: 'edge-2', source: 'node-2', target: 'node-3', sourceHandle: 'true' },
            { id: 'edge-3', source: 'node-2', target: 'node-4', sourceHandle: 'false' }
        ]
    }
];
