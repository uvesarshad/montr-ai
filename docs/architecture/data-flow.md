# Data Flow

> Scope: How data enters, transforms, and exits the system at every major boundary.
> Rendering context: Isomorphic (boundary spans server and client)
> Project tier: 4
> Last updated: 2026-05-20

## Overview

Data in MontrAI flows through four distinct layers: the client UI (TanStack Query + React state), Next.js route handlers (auth + validation + orchestration), domain services and repositories (business logic + DB), and external services (AI providers, queues, third-party APIs). Cross-process real-time events flow via Redis pub/sub from the BullMQ worker back to the Socket.io HTTP server.

## Primary Data Path — User Request

1. Client component calls fetch (via TanStack Query or direct) to an API route under src/app/api/v2/.
2. middleware.ts runs first: validates CSRF origin header for mutations, checks JWT session for protected paths, enforces admin-only routes.
3. Route handler calls auth() to extract the session. Reads organizationId from the session user's DB record (never from request body).
4. Route handler validates the request body against a Zod schema defined in src/validations/.
5. Route handler calls a repository method (src/lib/db/repository/) which calls connectDB(), then executes a Mongoose query always scoped by organizationId.
6. Route handler returns a JSON response. Errors are caught in a try/catch and returned as { error: string } with the appropriate HTTP status code.
7. TanStack Query receives the response, updates its cache, and re-renders the relevant client component.

AGENT NOTE: Step 3 is critical — organizationId must always come from the server-side session lookup, not from request parameters or body. Any route that skips this check violates multi-tenancy.

## Workflow Execution Path

1. User triggers workflow execution (canvas UI button or scheduled trigger).
2. Route handler at src/app/api/v2/canvases/[id]/execute/route.ts or a similar workflow trigger route creates a UnifiedWorkflowExecution record in MongoDB.
3. For short runs, the unified-execution-engine.ts runs inline in the HTTP process. For long runs or explicit queue submissions, the execution job is enqueued via BullMQ (src/lib/workflow/queue/execution-queue.ts).
4. The BullMQ worker (npm run worker, scripts/workflow-worker.ts) picks up the job and calls the same unified-execution-engine.ts.
5. The engine processes each node by looking up the node's subType in NodeProcessorRegistry and calling processor.execute(context).
6. Each node processor reads input from the VariableResolver (src/lib/workflow/variable-resolver.ts), which resolves {{variable}} templates against the current run context.
7. On completion or step update, the engine calls publishWorkflowEventAsync (src/lib/workflow/events/bus.ts), which publishes a JSON envelope to the Redis channel workflow:events.
8. The HTTP process (server.js) has a subscriber on that channel (subscribeWorkflowEvents). It re-emits each event into the matching Socket.io room (workflow:<id> or execution:<id>).
9. The client canvas page receives the socket event and updates the execution indicator UI.

AGENT SEE: docs/modules/canvas.md — Canvas execution UI components

## AI Generation Path

1. Node processor or route handler assembles a CommonGenerationInput object with model, system, messages, userProfile, userPlan, userApiKeys, and routeHint.
2. generateTextWithClient or streamText is called from src/ai/client.ts.
3. client.ts reads the routeHint.sdk field and dispatches to either the Genkit instance (src/ai/genkit.ts) or the Vercel AI SDK (createOpenAI or similar).
4. If keySource is byok, the user's own API key from userApiKeys is used. If keySource is platform, the platform-level key from environment variables is used.
5. Before the call, credit consumption is checked and recorded via credit-service.ts (src/lib/credit-service.ts).
6. The response (text, stream, or structured object) is returned to the caller. Token usage is reported via the onFinish callback.

AGENT AVOID: Importing @genkit-ai/googleai, genkitx-openai, @ai-sdk/openai, or openai directly in node processors or route handlers. All AI calls go through src/ai/client.ts.

## File Upload Path

1. Client calls the upload endpoint (src/app/api/upload/route.ts or CRM attachment endpoint).
2. Route handler validates file type against a magic-byte check and enforces size limits.
3. The storage service (src/lib/storage/storage-service.ts) selects a provider (S3 or Google Drive) based on configuration and uploads the file.
4. The S3/Wasabi key and a presigned URL are returned to the client.
5. For canvas previews, the key is stored on the Canvas document; presigned URLs are generated on-demand (not stored).

## Data Boundaries and Serialization

- MongoDB → Route Handler: Mongoose documents are converted to plain JS objects via .lean() or .toObject(). Dates serialize as ISO strings in JSON responses.
- Route Handler → Client: JSON responses. Pagination responses always use the shape { data: [], pagination: { page, limit, total, totalPages, hasMore } }.
- Worker → HTTP: Workflow events cross the process boundary as JSON strings through Redis pub/sub. The WorkflowEventEnvelope type in src/lib/workflow/events/bus.ts defines the wire shape.

## Error Propagation

Route handler errors are caught in try/catch blocks. Expected domain errors return { error: string } with 4xx status. Unexpected errors return 500 and are forwarded to Sentry via logger.error. The BullMQ worker has a per-job retry policy; on exhaustion it marks the execution FAILED and emits an execution:failed event.

## Update Triggers

Update this file when a new data source is added, when the fetch or mutation pattern changes, or when a new data boundary is introduced (e.g., a new queue, a new external service).

## Related Docs

- docs/api/route-handlers-part1.md and docs/api/route-handlers-part2.md — Route-level detail
- docs/api/external-services.md — Third-party integrations
- docs/state/server-state.md — BullMQ and background job detail
- docs/auth/authorization.md — organizationId enforcement
