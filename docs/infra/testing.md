# Testing

> Scope: Test strategy, Vitest configuration, and test scope.
> Rendering context: N/A (test runner, not runtime)
> Project tier: 4
> Last updated: 2026-06-04

## Overview

MontrAI uses Vitest for pure unit tests of security primitives and utility functions. The test suite is intentionally narrow — no database, no Redis, no Next.js runtime. Tests run fast and in CI without infrastructure. Integration tests (API contracts, DB operations) are not yet implemented in a test runner; manual verification scripts in scripts/ fill this gap.

## Test Runner

Vitest (vitest package). Configuration: vitest.config.ts at project root.

Run all tests: npm run test (vitest run — single pass, no watch).
Watch mode: npm run test:watch (vitest — interactive watch).

## Test Scope

Include pattern: src/**/*.{test,spec}.ts.
Exclude: node_modules, .next, dist, temp.

Coverage: v8 provider. Reports: text and lcov. Includes: src/lib/**/*.ts. Excludes: src/lib/**/*.test.ts, src/lib/db/** (Mongoose models not in scope for unit coverage).

Environment: node (not jsdom). Tests that import Mongoose or any module with __dirname-style globals will work correctly because the environment is Node-flavoured.

## What Is Tested

The suite has grown well beyond the original security primitives (~80 .test.ts files at last count). The list below is a representative sample of the significant areas, not an exhaustive enumeration.

Current unit test coverage focuses on:
- src/lib/workflow/ssrf-guard.ts — SSRF validation: private IP detection, scheme checking, blocked hostname list. Test file: src/lib/workflow/ssrf-guard.test.ts.
- src/lib/auth/super-admin.ts — Super admin email detection. Test file: src/lib/auth/super-admin.test.ts.
- src/lib/crm/ai-insights.ts — CRM AI insight generation logic. Test file: src/lib/crm/ai-insights.test.ts.
- src/lib/crm/comment-serialization.ts — Comment serialization. Test file: src/lib/crm/comment-serialization.test.ts.
- src/lib/crm/inbox-channel-setup-options.ts — Inbox channel config helpers. Test file: src/lib/crm/inbox-channel-setup-options.test.ts.
- src/lib/agent/launcher.ts — Agent mission launcher logic. Test file: src/lib/agent/launcher.test.ts.
- src/lib/agent/missions.ts — Mission CRUD. Test file: src/lib/agent/missions.test.ts.
- src/lib/agent/mission-context.ts — Mission context builder. Test file: src/lib/agent/mission-context.test.ts.
- src/lib/agent/mission-links.ts — Mission resource links. Test file: src/lib/agent/mission-links.test.ts.
- src/lib/agent/mission-link-groups.ts — Link grouping. Test file: src/lib/agent/mission-link-groups.test.ts.
- src/lib/agent/mission-link-presenter.ts — Link display. Test file: src/lib/agent/mission-link-presenter.test.ts.
- src/lib/agent/mission-templates.ts — Mission template resolution. Test file: src/lib/agent/mission-templates.test.ts.
- src/lib/whatsapp/conversation-summary.ts — Conversation summarization. Test file: src/lib/whatsapp/conversation-summary.test.ts.
- src/lib/inbox/chatbot-origin.ts — Chatbot domain validation. Test file: src/lib/inbox/chatbot-origin.test.ts.
- src/lib/inbox/chatbots.ts — Chatbot configuration. Test file: src/lib/inbox/chatbots.test.ts.
- src/lib/inbox/workspace.ts — Workspace utilities. Test file: src/lib/inbox/workspace.test.ts.

Newer significant coverage areas:
- Voice subsystem — provider config/credential handling and provider selection. Test files: src/lib/voice/providers/twilio.test.ts, src/lib/voice/selection.test.ts, src/lib/voice/ai/barge-in.test.ts.
- Event bus — in-process/cross-process domain event delivery and dedupe. Test file: src/lib/events/domain-bus.test.ts.
- Workflow engine and migrators — unified execution engine, node taxonomy, legacy read-only guard, and CRM/WhatsApp/recurring-post migrators to the unified model. Test files: src/lib/workflow/unified-execution-engine.test.ts, src/lib/workflow/node-taxonomy.test.ts, src/lib/workflow/legacy-workflow-readonly.test.ts, src/lib/workflow/migrators/*.test.ts.
- Agent expansions — HITL gateway, multi-agent coordinator, mission budget, and mission telemetry. Test files: src/lib/agent/hitl-gateway.test.ts, src/lib/agent/multi-agent/agent-coordinator.test.ts, src/lib/agent/mission-budget.test.ts, src/lib/agent/mission-telemetry.test.ts.

## What Is Not Tested (by design)

- MongoDB/Mongoose models and repositories — require a live DB connection. Tested via scripts/test-db.js or manual verification scripts.
- Redis-dependent code (rate limiting, BullMQ) — require a live Redis instance.
- API route handlers — require Next.js runtime. No integration test suite exists yet.
- React components — no component test suite exists yet.

AGENT NOTE: When adding a new security primitive or pure utility function, add a corresponding .test.ts file in the same directory. Do not add tests that require DB, Redis, or the Next.js runtime to this suite.

## Running a Single Test File

npx vitest run src/lib/workflow/ssrf-guard.test.ts

## AGENT UPDATE

Update this file when the testing strategy, Vitest configuration, or test directory structure changes, or when significant new test coverage is added.

## Related Docs

- docs/infra/deployment.md — CI/CD context (no CI pipeline documented yet)
- docs/architecture/folder-structure.md — Test file location conventions
