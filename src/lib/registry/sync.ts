/**
 * Capability-registry adapters (the M3 Capability-Hub seam).
 *
 * Thin, additive bridges that ENUMERATE existing definitions and register them
 * as Capability descriptors. The source-of-truth definitions (agent tools,
 * mission templates, starter playbooks) are NOT modified — this layer reads
 * them and projects each into the shared catalog so a future marketplace can
 * publish/install any of them through one surface.
 *
 * `syncCoreCapabilities()` is idempotent: it clears and re-projects, so it's
 * safe to call lazily from an API route or a worker on demand.
 */

import { capabilityRegistry, type CapabilityInput } from './capability-registry';

// Importing the barrel self-registers every agent tool into the toolRegistry.
import '@/lib/agent/tools/index';
import { toolRegistry } from '@/lib/agent/tool-registry';
import { getMissionTemplates } from '@/lib/agent/mission-templates';
import {
    STARTER_PLAYBOOKS,
    UNIVERSAL_PLAYBOOKS,
    type StarterPlaybook,
} from '@/lib/agent/playbook-starters';

const DEFAULT_VERSION = '1.0.0';

/** Stable slug for a playbook (no id field on the source type). */
function playbookSlug(playbook: StarterPlaybook): string {
    return playbook.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

/** Extract a lightweight param-name summary from a tool's zod schema. */
function summarizeToolSchema(parameters: unknown): string[] | undefined {
    const shape = (parameters as { shape?: Record<string, unknown> } | undefined)?.shape;
    if (!shape || typeof shape !== 'object') return undefined;
    return Object.keys(shape);
}

/** Project the registered agent tools into capability descriptors. */
export function collectToolCapabilities(): CapabilityInput[] {
    return toolRegistry.getAllTools().map((tool) => ({
        id: `tool:${tool.name}`,
        kind: 'tool' as const,
        name: tool.name,
        description: tool.description,
        version: DEFAULT_VERSION,
        source: 'core' as const,
        schema: summarizeToolSchema(tool.parameters),
        publishable: false,
        metadata: {
            hitlPolicy: tool.hitlPolicy,
        },
    }));
}

/** Project the mission templates into capability descriptors. */
export function collectMissionCapabilities(): CapabilityInput[] {
    return getMissionTemplates().map((template) => ({
        id: `mission:${template.id}`,
        kind: 'mission' as const,
        name: template.title,
        description: template.description,
        version: DEFAULT_VERSION,
        source: 'core' as const,
        publishable: false,
        metadata: {
            badgeLabel: template.badgeLabel,
            summary: template.summary,
            recurring: template.recurring,
            onComplete: template.onComplete,
        },
    }));
}

/** Project the starter + universal playbooks into capability descriptors. */
export function collectPlaybookCapabilities(): CapabilityInput[] {
    const all = [...STARTER_PLAYBOOKS, ...UNIVERSAL_PLAYBOOKS];
    return all.map((playbook) => ({
        id: `playbook:${playbookSlug(playbook)}`,
        kind: 'playbook' as const,
        name: playbook.title,
        // Playbooks carry HTML bodies, not a short description — derive one.
        description: playbook.title,
        version: DEFAULT_VERSION,
        source: 'core' as const,
        publishable: false,
        metadata: {
            industryMatch: playbook.industryMatch,
            universal: playbook.industryMatch.length === 0,
        },
    }));
}

/** Every core capability, across all kinds. */
export function collectCoreCapabilities(): CapabilityInput[] {
    return [
        ...collectToolCapabilities(),
        ...collectMissionCapabilities(),
        ...collectPlaybookCapabilities(),
    ];
}

let synced = false;

/**
 * Populate the shared registry with all core capabilities. Idempotent: clears
 * and re-projects each call. Pass `force=false` (default after first run) to
 * skip if already synced — useful in hot request paths.
 */
export function syncCoreCapabilities(options: { force?: boolean } = {}): void {
    if (synced && !options.force) return;
    capabilityRegistry.clear();
    capabilityRegistry.registerAll(collectCoreCapabilities());
    synced = true;
}

/** Ensure the registry is populated (sync once), then return it. */
export function ensureCapabilityRegistry() {
    syncCoreCapabilities();
    return capabilityRegistry;
}
