/**
 * MCP (Model Context Protocol) HTTP endpoint for the social module (Epic 4.4).
 *
 * Speaks JSON-RPC 2.0 over a single HTTP POST so external MCP-capable agents can
 * introspect a tenant's social accounts + scheduled posts and schedule new
 * posts via MontrAI. The MCP wire surface is implemented directly (no
 * `@modelcontextprotocol/sdk` dependency) — this is a small, robust surface:
 *
 *   - `initialize`                  → server capabilities + info.
 *   - `tools/list`                  → the MCP tool catalog.
 *   - `tools/call`                  → execute a tool (delegates to callMcpTool).
 *   - `notifications/initialized`   → acknowledged with HTTP 202 (no body).
 *
 * Auth: every request must carry a valid `x-api-key` (see `authenticateApiKey`).
 * Multi-tenancy hard rule — the organization comes ONLY from the resolved key,
 * never from request params. Tool calls additionally require the `apiAccess`
 * plan feature and per-tool API-key scopes (enforced inside `callMcpTool`).
 *
 * GET returns a tiny discovery/health descriptor.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/social/api-auth';
import { getOrgPlanFeatures } from '@/lib/plan-enforcement';
import { MCP_TOOLS, callMcpTool } from '@/lib/social/mcp-tools';

const SERVER_INFO = { name: 'montrai-social', version: '1.0.0' } as const;
const PROTOCOL_VERSION = '2024-11-05';

// JSON-RPC error codes — standard + a custom auth/plan range.
const JSONRPC_PARSE_ERROR = -32700;
const JSONRPC_INVALID_REQUEST = -32600;
const JSONRPC_METHOD_NOT_FOUND = -32601;
const JSONRPC_INTERNAL_ERROR = -32603;
const JSONRPC_AUTH_ERROR = -32001; // missing/invalid API key
const JSONRPC_PLAN_ERROR = -32002; // plan does not include apiAccess

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
    jsonrpc?: string;
    id?: JsonRpcId;
    method?: string;
    params?: unknown;
}

function rpcResult(id: JsonRpcId, result: unknown) {
    return { jsonrpc: '2.0', id: id ?? null, result };
}

function rpcError(id: JsonRpcId, code: number, message: string, data?: unknown) {
    const error: { code: number; message: string; data?: unknown } = { code, message };
    if (data !== undefined) error.data = data;
    return { jsonrpc: '2.0', id: id ?? null, error };
}

/** Is this a JSON-RPC notification (no id ⇒ no response expected)? */
function isNotification(req: JsonRpcRequest): boolean {
    return req.id === undefined || req.id === null;
}

interface DispatchContext {
    scopes: string[];
    userId: string;
}

/**
 * Handle a single JSON-RPC request object. Returns a JSON-RPC response object,
 * or `null` for accepted notifications that warrant no response body.
 */
async function handleRpc(
    req: JsonRpcRequest,
    ctx: DispatchContext,
): Promise<Record<string, unknown> | null> {
    const id: JsonRpcId = req.id ?? null;

    if (req.jsonrpc !== '2.0' || typeof req.method !== 'string') {
        return rpcError(id, JSONRPC_INVALID_REQUEST, 'Invalid JSON-RPC request');
    }

    try {
        switch (req.method) {
            case 'initialize':
                return rpcResult(id, {
                    protocolVersion: PROTOCOL_VERSION,
                    capabilities: { tools: {} },
                    serverInfo: SERVER_INFO,
                });

            case 'notifications/initialized':
                // Client handshake completion — acknowledge, no response body.
                return null;

            case 'tools/list':
                return rpcResult(id, { tools: MCP_TOOLS });

            case 'tools/call': {
                const params = (req.params || {}) as { name?: unknown; arguments?: unknown };
                if (typeof params.name !== 'string' || !params.name) {
                    return rpcError(id, JSONRPC_INVALID_REQUEST, 'tools/call requires a string "name"');
                }
                const toolResult = await callMcpTool(params.name, params.arguments ?? {}, {
                    scopes: ctx.scopes,
                    userId: ctx.userId,
                });
                // MCP tool results are returned as the JSON-RPC result; tool-level
                // failures are conveyed via isError on the result, not a protocol error.
                return rpcResult(id, toolResult);
            }

            default:
                if (req.method.startsWith('notifications/')) {
                    // Any other client notification — accept silently.
                    return isNotification(req) ? null : rpcResult(id, {});
                }
                return rpcError(id, JSONRPC_METHOD_NOT_FOUND, `Method not found: ${req.method}`);
        }
    } catch (error) {
        console.error(`[mcp] method "${req.method}" failed:`, error);
        // Never leak stack traces.
        return rpcError(id, JSONRPC_INTERNAL_ERROR, 'Internal server error');
    }
}

export async function POST(request: NextRequest) {
    // 1) Authenticate the API key — org comes ONLY from the resolved key.
    const auth = await authenticateApiKey(request);
    if (!auth) {
        return NextResponse.json(
            rpcError(null, JSONRPC_AUTH_ERROR, 'Invalid or missing API key'),
            { status: 401 },
        );
    }

    // 2) Plan gate — the MCP endpoint requires the apiAccess feature.
    try {
        const features = await getOrgPlanFeatures(auth.createdByUserId);
        if (!features.apiAccess) {
            return NextResponse.json(
                rpcError(
                    null,
                    JSONRPC_PLAN_ERROR,
                    'Your plan does not include API access. Upgrade to use the MCP endpoint.',
                ),
                { status: 402 },
            );
        }
    } catch (error) {
        console.error('[mcp] plan resolution failed:', error);
        return NextResponse.json(
            rpcError(null, JSONRPC_INTERNAL_ERROR, 'Failed to resolve plan'),
            { status: 500 },
        );
    }

    // 3) Parse the JSON-RPC body (single object or batch array).
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            rpcError(null, JSONRPC_PARSE_ERROR, 'Parse error: invalid JSON'),
            { status: 400 },
        );
    }

    const ctx: DispatchContext = {
        scopes: auth.scopes,
        userId: auth.createdByUserId,
    };

    // Batch: array of requests → array of responses (notifications omitted).
    if (Array.isArray(body)) {
        if (body.length === 0) {
            return NextResponse.json(
                rpcError(null, JSONRPC_INVALID_REQUEST, 'Invalid Request: empty batch'),
                { status: 400 },
            );
        }
        const responses = await Promise.all(
            body.map((item) => handleRpc((item || {}) as JsonRpcRequest, ctx)),
        );
        const filtered = responses.filter((r): r is Record<string, unknown> => r !== null);
        // All-notifications batch → 202, no body.
        if (filtered.length === 0) {
            return new NextResponse(null, { status: 202 });
        }
        return NextResponse.json(filtered, { status: 200 });
    }

    // Single request object.
    const req = (body || {}) as JsonRpcRequest;
    const response = await handleRpc(req, ctx);

    // Notification (e.g. notifications/initialized) → 202, no body.
    if (response === null) {
        return new NextResponse(null, { status: 202 });
    }

    return NextResponse.json(response, { status: 200 });
}

/** Discovery / health descriptor. */
export async function GET() {
    return NextResponse.json({
        server: SERVER_INFO,
        protocol: 'Model Context Protocol (JSON-RPC 2.0)',
        protocolVersion: PROTOCOL_VERSION,
        transport: 'http',
        endpoint: 'POST this URL with a JSON-RPC 2.0 body to use the MCP endpoint.',
        auth: 'Provide a valid API key via the x-api-key header. Requires the apiAccess plan feature.',
        methods: ['initialize', 'tools/list', 'tools/call', 'notifications/initialized'],
        tools: MCP_TOOLS.map((t) => t.name),
    });
}
