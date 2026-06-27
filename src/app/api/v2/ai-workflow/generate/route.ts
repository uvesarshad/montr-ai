import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/get-session';
import { generateTextWithClient } from '@/ai/client';
import { AISettingsService } from '@/lib/services/ai-settings.service';
import { generateNodeDescriptionForAI, isValidNodeType, NODE_REGISTRY } from '@/lib/canvas/node-registry';
import { applyAiRateLimit } from '@/lib/ai/rate-limit';

// Zod schema for the AI-generated workflow shape — keeps untrusted model output
// from poisoning the canvas with executable strings, prototype-pollution keys,
// or oversized payloads. Anything outside this shape is rejected before it
// reaches step3 / the client.
const MAX_NODES = 50;
const MAX_EDGES = 100;
const _MAX_LABEL_LEN = 200;
const MAX_STRING_LEN = 4000;

const safeKeyRegex = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/;

const safePrimitive: z.ZodType<string | number | boolean | null> = z.union([
    z.string().max(MAX_STRING_LEN),
    z.number().finite(),
    z.boolean(),
    z.null(),
]);

const safeJsonValue: z.ZodType<unknown> = z.lazy(() =>
    z.union([
        safePrimitive,
        z.array(safeJsonValue).max(200),
        z.record(z.string().regex(safeKeyRegex), safeJsonValue),
    ])
);

const generatedNodeSchema = z.object({
    id: z.string().min(1).max(64),
    type: z.string().min(1).max(64),
    position: z.object({
        x: z.number().finite(),
        y: z.number().finite(),
    }),
    data: z.record(z.string().regex(safeKeyRegex), safeJsonValue).default({}),
});

const generatedEdgeSchema = z.object({
    id: z.string().min(1).max(128),
    source: z.string().min(1).max(64),
    target: z.string().min(1).max(64),
    sourceHandle: z.string().max(64).optional(),
    targetHandle: z.string().max(64).optional(),
});

const generatedWorkflowSchema = z.object({
    nodes: z.array(generatedNodeSchema).max(MAX_NODES),
    edges: z.array(generatedEdgeSchema).max(MAX_EDGES),
});

// =============================================================================
// TYPES
// =============================================================================

interface WorkflowNode {
    id: string;
    type: string;
    position: { x: number; y: number };
    data: Record<string, unknown>;
}

interface WorkflowEdge {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
}

interface GeneratedWorkflow {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
}

// =============================================================================
// STEP 1: Natural Language Workflow Description
// =============================================================================

const STEP1_SYSTEM_PROMPT = `You are an expert workflow architect for MontrAI, a content creation and automation platform.

Your job is to describe the ideal workflow for a user's request in plain English. Do NOT generate any JSON or code.

Here are the platform's node capabilities:
${generateNodeDescriptionForAI()}

RULES:
1. Every workflow MUST start with exactly one trigger node (Manual, Schedule, or Webhook).
2. Use ONLY the node types listed above. Do not invent new node types.
3. Keep the workflow practical — use the minimum nodes needed.
4. Describe each step clearly: what node type, what it does, how it connects.
5. Mention the connections between steps (which step feeds into which).

OUTPUT FORMAT:
Workflow Name: [short name]
Description: [1-sentence summary]
Steps:
1. [node name] — [what it does]
2. [node name] — [what it does, receives from step 1]
...
Connections: [step 1] → [step 2] → [step 3], etc.
`;

async function step1_describeWorkflow(
    prompt: string,
    modelId: string,
    routeHint: { sdk: 'genkit' | 'aisdk'; provider: string; keySource: 'user' | 'system' }
): Promise<string> {
    const result = await generateTextWithClient({
        model: modelId,
        system: STEP1_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
        routeHint,
        temperature: 0.7,
        maxTokens: 1500,
    });

    return result;
}

// =============================================================================
// STEP 2: JSON Conversion
// =============================================================================

function buildStep2SystemPrompt(): string {
    const validTypes = NODE_REGISTRY.map(n => `"${n.type}"`).join(', ');

    return `You are a JSON converter for MontrAI canvas workflows. You receive a natural-language workflow description and convert it into a valid React Flow JSON structure.

AVAILABLE NODE TYPES (you MUST use these exact type strings):
${validTypes}

NODE DETAILS:
${generateNodeDescriptionForAI()}

JSON OUTPUT FORMAT:
{
  "nodes": [
    {
      "id": "node_1",
      "type": "<exact type string from the list above>",
      "position": { "x": <number>, "y": <number> },
      "data": { "label": "<node label>", ...other fields }
    }
  ],
  "edges": [
    {
      "id": "edge_1_2",
      "source": "node_1",
      "target": "node_2"
    }
  ]
}

CRITICAL RULES:
1. The "type" field MUST be one of the exact strings: ${validTypes}. Any other value will cause the node to render as a broken rectangle.
2. Every node MUST have a "label" in its data.
3. Node IDs should be "node_1", "node_2", etc.
4. Edge IDs should be "edge_<source>_<target>".
5. Position nodes with x-spacing of 350px between columns and y-spacing of 150px between rows. Start at position (100, 100).
6. For branching (logicBranch), offset the true/false paths vertically (+150px / -150px).
7. Only output valid JSON, no markdown fences, no explanation.`;
}

/**
 * Robustly extract JSON from AI output that may contain markdown fences,
 * explanatory text, or other formatting around the JSON object.
 */
function extractJSON(text: string): Record<string, unknown> | null {
    if (!text || text.trim().length === 0) {
        console.error('[Workflow Gen] Empty text received');
        return null;
    }

    const trimmed = text.trim();

    // 1. Try direct parse first
    try {
        return JSON.parse(trimmed);
    } catch {
        // Continue to other strategies
    }

    // 2. Strip markdown fences (```json ... ``` or ``` ... ```)
    const fenceRegex = /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/;
    const fenceMatch = trimmed.match(fenceRegex);
    if (fenceMatch) {
        try {
            return JSON.parse(fenceMatch[1].trim());
        } catch {
            // Continue
        }
    }

    // 3. Find the outermost { ... } block via bracket matching
    const firstBrace = trimmed.indexOf('{');
    if (firstBrace !== -1) {
        let depth = 0;
        let lastBrace = -1;
        for (let i = firstBrace; i < trimmed.length; i++) {
            if (trimmed[i] === '{') depth++;
            else if (trimmed[i] === '}') {
                depth--;
                if (depth === 0) {
                    lastBrace = i;
                    // Don't break — find the LAST complete top-level object
                    // Actually, we want the first complete one
                    break;
                }
            }
        }

        if (lastBrace !== -1) {
            const candidate = trimmed.substring(firstBrace, lastBrace + 1);
            try {
                return JSON.parse(candidate);
            } catch {
                // Try fixing common issues: trailing commas
                const fixed = candidate
                    .replace(/,\s*}/g, '}')
                    .replace(/,\s*]/g, ']');
                try {
                    return JSON.parse(fixed);
                } catch {
                    console.error('[Workflow Gen] Found JSON-like block but could not parse:', candidate.substring(0, 200));
                }
            }
        }
    }

    return null;
}

async function step2_convertToJSON(
    workflowDescription: string,
    originalPrompt: string,
    modelId: string,
    routeHint: { sdk: 'genkit' | 'aisdk'; provider: string; keySource: 'user' | 'system' }
): Promise<GeneratedWorkflow> {
    const systemPrompt = buildStep2SystemPrompt();

    const userMessage = `Convert this workflow into JSON:

User's original request: "${originalPrompt}"

Workflow description:
${workflowDescription}

Respond with ONLY the JSON object, nothing else.`;

    const result = await generateTextWithClient({
        model: modelId,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        routeHint,
        temperature: 0.2,
        maxTokens: 4000,
    });

    console.log('[Workflow Gen] Step 2 raw output length:', result.length);
    console.log('[Workflow Gen] Step 2 raw output (first 500 chars):', result.substring(0, 500));

    const parsed = extractJSON(result);
    if (!parsed) {
        console.error('[Workflow Gen] Could not extract JSON from output:', result);
        throw new Error('AI returned invalid JSON. Please try again.');
    }

    // Ensure the parsed object has the expected shape before validation
    if (!parsed.nodes || !Array.isArray(parsed.nodes)) {
        parsed.nodes = [];
    }
    if (!parsed.edges || !Array.isArray(parsed.edges)) {
        parsed.edges = [];
    }

    // Strict zod validation — rejects oversize payloads, dangerous keys
    // (e.g. __proto__), and non-primitive values that could carry code.
    const validated = generatedWorkflowSchema.safeParse(parsed);
    if (!validated.success) {
        console.error('[Workflow Gen] Zod validation failed:', validated.error.flatten());
        throw new Error('AI returned a workflow that did not match the expected schema. Please try again.');
    }

    return validated.data as unknown as GeneratedWorkflow;
}

// =============================================================================
// STEP 3: Validation & Layout Fix (Deterministic — No AI)
// =============================================================================

/** Canvas-level invariants the engine needs to run a workflow.
 *  These complement the schema validation in step 2 — they check *structure*,
 *  not shape. Warnings are non-fatal (surfaced to the user in the SSE stream).
 *  Errors get appended to the warnings list with a leading "error:" tag but
 *  we still return the workflow so the user can see and fix it in the editor.
 */
const TRIGGER_TYPE_PREFIX = 'trigger';

/** Nodes that spawn multiple labelled outputs — edges from these MUST carry a sourceHandle. */
const NODES_WITH_LABELLED_OUTPUTS: Record<string, string[]> = {
    logicBranch: ['true', 'false'],
    smartRouterNode: ['match', 'default'],
    logicLoop: ['iteration', 'done'],
};

/** Terminal node types that legitimately have no outgoing edges. */
const TERMINAL_NODE_TYPES = new Set<string>([
    'actionWhatsApp',
    'actionMarketingEmail',
    'actionConversationalEmail',
    'telegramNode',
    'instagramDMNode',
    'publishNode',
    'documentNode',
    'stickyNote',
]);

function step3_validateAndFix(workflow: GeneratedWorkflow): {
    workflow: GeneratedWorkflow;
    warnings: string[];
} {
    const warnings: string[] = [];

    // 3a. Validate and fix node types
    const validNodes: WorkflowNode[] = [];
    const invalidTypes: string[] = [];

    for (const node of workflow.nodes) {
        if (!isValidNodeType(node.type)) {
            invalidTypes.push(node.type);
            // Try to find the closest match
            const closest = findClosestNodeType(node.type);
            if (closest) {
                warnings.push(`Fixed node type "${node.type}" → "${closest}"`);
                node.type = closest;
                validNodes.push(node);
            } else {
                warnings.push(`Removed node "${node.id}" with unknown type "${node.type}"`);
            }
        } else {
            validNodes.push(node);
        }
    }

    // 3b. Ensure all nodes have required data fields
    for (const node of validNodes) {
        if (!node.data) node.data = {};
        if (!node.data.label) {
            const entry = NODE_REGISTRY.find(n => n.type === node.type);
            node.data.label = entry?.name || node.type;
        }
    }

    // 3c. Validate edges — remove edges referencing invalid nodes
    const nodeIds = new Set(validNodes.map(n => n.id));
    const validEdges = workflow.edges.filter(edge => {
        if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
            warnings.push(`Removed edge "${edge.id}" — references missing node`);
            return false;
        }
        return true;
    });

    // 3d. Structural validation — trigger placement, handles, connectivity.
    //     Non-fatal: the engine will also complain at run time, but catching
    //     these at merge time lets us show a clearer error in the UI.
    validateStructure(validNodes, validEdges, warnings);

    // 3e. Re-layout nodes (clean horizontal flow)
    const layoutNodes = applyAutoLayout(validNodes, validEdges);

    return {
        workflow: { nodes: layoutNodes, edges: validEdges },
        warnings,
    };
}

/**
 * Cross-check structural invariants the engine relies on. Mutates `warnings`
 * rather than returning anything — the caller decides whether to treat any of
 * them as fatal.
 */
function validateStructure(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    warnings: string[]
): void {
    // ---- Trigger placement ----
    const triggerNodes = nodes.filter(n => n.type.startsWith(TRIGGER_TYPE_PREFIX));
    if (triggerNodes.length === 0) {
        warnings.push('error: Workflow has no trigger node. Add a manual, webhook, or schedule trigger so it can run.');
    } else if (triggerNodes.length > 1) {
        warnings.push(
            `Workflow has ${triggerNodes.length} trigger nodes — the engine only uses the first (${triggerNodes[0].id}). Remove the extras or the rest are unreachable.`
        );
    } else {
        // Single trigger — make sure it actually leads somewhere.
        const t = triggerNodes[0];
        const outgoing = edges.filter(e => e.source === t.id);
        if (outgoing.length === 0 && nodes.length > 1) {
            warnings.push(`Trigger "${t.id}" has no outgoing edges — nothing downstream will ever fire.`);
        }
    }

    // ---- Missing / wrong handles on labelled-output nodes ----
    for (const node of nodes) {
        const requiredHandles = NODES_WITH_LABELLED_OUTPUTS[node.type];
        if (!requiredHandles) continue;
        const outs = edges.filter(e => e.source === node.id);
        if (outs.length === 0) {
            warnings.push(`${node.type} "${node.id}" has no outgoing edges — downstream branches will never run.`);
            continue;
        }
        const seenHandles = new Set(outs.map(e => e.sourceHandle).filter(Boolean) as string[]);
        // An edge on a labelled-output node that doesn't set sourceHandle is
        // ambiguous — the engine defaults it to the first handle, which silently
        // hides the "else" branch.
        for (const e of outs) {
            if (!e.sourceHandle) {
                warnings.push(
                    `Edge "${e.id}" from ${node.type} "${node.id}" is missing a sourceHandle (expected one of: ${requiredHandles.join(', ')}).`
                );
            }
        }
        const missing = requiredHandles.filter(h => !seenHandles.has(h));
        if (missing.length > 0 && missing.length < requiredHandles.length) {
            warnings.push(
                `${node.type} "${node.id}" only wires ${[...seenHandles].join(', ')} — ${missing.join(', ')} branch has no continuation.`
            );
        }
    }

    // ---- Dangling nodes (no incoming edges AND not a trigger) ----
    const nonTriggerWithoutIncoming = nodes.filter(n => {
        if (n.type.startsWith(TRIGGER_TYPE_PREFIX)) return false;
        if (n.type === 'stickyNote') return false; // notes are intentionally floating
        return !edges.some(e => e.target === n.id);
    });
    for (const n of nonTriggerWithoutIncoming) {
        warnings.push(`Node "${n.id}" (${n.type}) has no incoming edges — it will never run.`);
    }

    // ---- Nodes with no outgoing edges (that aren't terminal) ----
    const nonTerminalDeadEnds = nodes.filter(n => {
        if (TERMINAL_NODE_TYPES.has(n.type)) return false;
        if (n.type.startsWith(TRIGGER_TYPE_PREFIX) && nodes.length === 1) return false;
        return !edges.some(e => e.source === n.id);
    });
    for (const n of nonTerminalDeadEnds) {
        // Only report for node types that clearly expect something downstream.
        warnings.push(`Node "${n.id}" (${n.type}) has no outgoing edges — the flow stops here.`);
    }
}

/**
 * Applies a clean horizontal layout using topological sort.
 */
function applyAutoLayout(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
    if (nodes.length === 0) return nodes;

    // Build adjacency for topological sort
    const adj = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    for (const node of nodes) {
        adj.set(node.id, []);
        inDegree.set(node.id, 0);
    }

    for (const edge of edges) {
        adj.get(edge.source)?.push(edge.target);
        inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    }

    // Kahn's algorithm for topological sort → column assignment
    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
        if (degree === 0) queue.push(id);
    }

    const columns = new Map<string, number>();
    let col = 0;

    while (queue.length > 0) {
        const nextQueue: string[] = [];
        for (const id of queue) {
            columns.set(id, col);
            for (const neighbor of (adj.get(id) || [])) {
                inDegree.set(neighbor, (inDegree.get(neighbor) || 0) - 1);
                if (inDegree.get(neighbor) === 0) {
                    nextQueue.push(neighbor);
                }
            }
        }
        queue.length = 0;
        queue.push(...nextQueue);
        col++;
    }

    // Handle nodes not reached by topological sort (cycles or disconnected)
    for (const node of nodes) {
        if (!columns.has(node.id)) {
            columns.set(node.id, col++);
        }
    }

    // Group by column for y-positioning
    const byColumn = new Map<number, string[]>();
    for (const [id, c] of columns) {
        if (!byColumn.has(c)) byColumn.set(c, []);
        byColumn.get(c)!.push(id);
    }

    // Apply positions
    const X_SPACING = 350;
    const Y_SPACING = 150;
    const START_X = 100;
    const START_Y = 100;

    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    for (const [c, ids] of byColumn) {
        const totalHeight = (ids.length - 1) * Y_SPACING;
        const startY = START_Y + (nodes.length > 3 ? -totalHeight / 2 + 200 : 0);

        ids.forEach((id, rowIndex) => {
            const node = nodeMap.get(id);
            if (node) {
                node.position = {
                    x: START_X + c * X_SPACING,
                    y: startY + rowIndex * Y_SPACING,
                };
            }
        });
    }

    return nodes;
}

/**
 * Find closest matching node type using simple string similarity.
 */
function findClosestNodeType(input: string): string | null {
    const lower = input.toLowerCase().replace(/[_\-\s]/g, '');
    const validTypes = NODE_REGISTRY.map(n => n.type);

    // Exact match (case-insensitive)
    const exact = validTypes.find(t => t.toLowerCase() === lower);
    if (exact) return exact;

    // Partial match
    const partial = validTypes.find(t =>
        lower.includes(t.toLowerCase()) || t.toLowerCase().includes(lower)
    );
    if (partial) return partial;

    // Keyword match
    const keywords: Record<string, string> = {
        'webhook': 'triggerWebhook',
        'schedule': 'triggerSchedule',
        'manual': 'triggerManual',
        'cron': 'triggerSchedule',
        'text': 'textInput',
        'image': 'imageNode',
        'file': 'fileNode',
        'website': 'websiteNode',
        'web': 'websiteNode',
        'scrape': 'websiteNode',
        'youtube': 'youtubeNode',
        'audio': 'audioNode',
        'instagram': 'instagramNode',
        'linkedin': 'linkedinNode',
        'twitter': 'xNode',
        'reddit': 'redditNode',
        'pinterest': 'pinterestNode',
        'prompt': 'promptNode',
        'generate': 'promptNode',
        'chat': 'aiChatbot',
        'chatbot': 'aiChatbot',
        'genimage': 'generateImage',
        'genvideo': 'generateVideo',
        'whatsapp': 'actionWhatsApp',
        'email': 'actionConversationalEmail',
        'marketing': 'actionMarketingEmail',
        'publish': 'publishNode',
        'branch': 'logicBranch',
        'condition': 'logicBranch',
        'delay': 'logicDelay',
        'wait': 'logicDelay',
        'loop': 'logicLoop',
        'document': 'documentNode',
        'doc': 'documentNode',
        'note': 'stickyNote',
        'sticky': 'stickyNote',
    };

    for (const [keyword, nodeType] of Object.entries(keywords)) {
        if (lower.includes(keyword)) return nodeType;
    }

    return null;
}

// =============================================================================
// API ROUTE
// =============================================================================

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // AI workflow generation runs 2-3 LLM calls per request — keep it tightly
    // capped per user so a scripted client can't bleed credits.
    const limited = await applyAiRateLimit(req, 'ai:workflow-generate', session.user.id!);
    if (limited) return limited;

    try {
        const { prompt } = await req.json();

        if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
            return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
        }

        // Get user's preferred model for workflow generation
        const preference = await AISettingsService.getPreferredModel(
            session.user.id,
            'workflowGenerator'
        );

        const modelId = preference.modelId;
        const routeHint = preference.routeHint || {
            sdk: 'genkit' as const,
            provider: 'google',
            keySource: 'system' as const,
        };

        console.log(`[Workflow Gen] Using model: ${modelId}, route: ${JSON.stringify(routeHint)}`);

        // Use Server-Sent Events for step-by-step progress
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                const sendEvent = (event: string, data: unknown) => {
                    controller.enqueue(
                        encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
                    );
                };

                try {
                    // ── Step 1: Natural Language Description ──
                    sendEvent('step', { step: 1, label: 'Understanding your workflow...' });

                    const description = await step1_describeWorkflow(
                        prompt.trim(),
                        modelId,
                        routeHint
                    );

                    console.log('[Workflow Gen] Step 1 description length:', description.length);

                    if (!description || description.trim().length < 10) {
                        throw new Error('AI returned an empty workflow description. Please try a more specific prompt.');
                    }

                    sendEvent('description', { text: description });

                    // ── Step 2: JSON Conversion ──
                    sendEvent('step', { step: 2, label: 'Building nodes and connections...' });

                    const rawWorkflow = await step2_convertToJSON(
                        description,
                        prompt.trim(),
                        modelId,
                        routeHint
                    );

                    // ── Step 3: Validation & Layout ──
                    sendEvent('step', { step: 3, label: 'Validating and optimizing layout...' });

                    const { workflow, warnings } = step3_validateAndFix(rawWorkflow);

                    if (warnings.length > 0) {
                        console.log('[Workflow Gen] Validation warnings:', warnings);
                        sendEvent('warnings', { warnings });
                    }

                    // ── Done ──
                    sendEvent('result', {
                        nodes: workflow.nodes,
                        edges: workflow.edges,
                        description,
                        nodeCount: workflow.nodes.length,
                        edgeCount: workflow.edges.length,
                    });

                    sendEvent('done', {});
                } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : 'Generation failed';
                    console.error('[Workflow Gen] Error:', error);
                    sendEvent('error', { message });
                }

                controller.close();
            },
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        console.error('[Workflow Gen] Route error:', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
