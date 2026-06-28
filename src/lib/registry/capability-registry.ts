/**
 * Capability Registry — the M3 Capability-Hub seam (master §2A.6).
 *
 * A single, kind-agnostic catalog of everything the platform can DO that is
 * potentially publishable to a marketplace: agent **tools**, **missions**
 * (templates), and **playbooks**. This module is the foundation/seam — NOT the
 * full marketplace. It defines the descriptor shape + register/list/get APIs
 * and a `publishable` flag, so future layers (community/overlay sources, a
 * marketplace UI, install flows) bolt onto a stable surface.
 *
 * Existing definitions are NOT rewritten — thin adapters enumerate them and
 * register descriptors here (see ./sync.ts). Keep this module pure: no DB, no
 * network, no framework imports, safe for any layer + unit tests.
 */

/** What kind of capability a descriptor represents. */
export type CapabilityKind = 'tool' | 'mission' | 'playbook';

/**
 * Where the capability came from. `core` ships with the OSS build; `community`
 * is a published/installed third-party capability; `overlay` is a private,
 * tenant- or deployment-specific addition layered on top of core.
 */
export type CapabilitySource = 'core' | 'community' | 'overlay';

/** A single publishable unit in the Capability Hub. */
export interface Capability {
    /** Globally-unique, namespaced id, e.g. "tool:createContact". */
    id: string;
    kind: CapabilityKind;
    /** Human-facing display name. */
    name: string;
    description: string;
    /** Semantic-ish version string; defaults to "1.0.0" for core definitions. */
    version: string;
    source: CapabilitySource;
    /**
     * Optional machine-readable schema describing inputs/shape. For tools this is
     * a lightweight param summary; missions/playbooks may omit it. Kept loose
     * (`unknown`) so the seam doesn't force a serialization format yet.
     */
    schema?: unknown;
    /** Whether this capability may be published to the marketplace. */
    publishable: boolean;
    /** Free-form, source-specific extras (e.g. scope, industryMatch, badge). */
    metadata?: Record<string, unknown>;
}

/** Optional input for registration — applies sensible defaults. */
export type CapabilityInput =
    Omit<Capability, 'version' | 'source' | 'publishable'>
    & Partial<Pick<Capability, 'version' | 'source' | 'publishable'>>;

export interface CapabilityFilter {
    kind?: CapabilityKind;
    source?: CapabilitySource;
    publishable?: boolean;
    /** Case-insensitive substring match over id/name/description. */
    search?: string;
}

/**
 * In-memory catalog. The seam is intentionally process-local: persistence,
 * versioning history, and install flows are future marketplace work that can
 * wrap this without changing its contract.
 */
export class CapabilityRegistry {
    private capabilities = new Map<string, Capability>();

    /** Register (or overwrite) a capability. Returns the stored descriptor. */
    register(input: CapabilityInput): Capability {
        if (!input.id) throw new Error('Capability.id is required');
        if (!input.kind) throw new Error(`Capability ${input.id} is missing kind`);

        const capability: Capability = {
            id: input.id,
            kind: input.kind,
            name: input.name,
            description: input.description ?? '',
            version: input.version ?? '1.0.0',
            source: input.source ?? 'core',
            schema: input.schema,
            publishable: input.publishable ?? false,
            metadata: input.metadata,
        };

        this.capabilities.set(capability.id, capability);
        return capability;
    }

    /** Register many at once. */
    registerAll(inputs: CapabilityInput[]): Capability[] {
        return inputs.map((input) => this.register(input));
    }

    get(id: string): Capability | undefined {
        return this.capabilities.get(id);
    }

    has(id: string): boolean {
        return this.capabilities.has(id);
    }

    /** List all capabilities, optionally filtered. */
    list(filter?: CapabilityFilter): Capability[] {
        let items = Array.from(this.capabilities.values());
        if (filter) {
            if (filter.kind) items = items.filter((c) => c.kind === filter.kind);
            if (filter.source) items = items.filter((c) => c.source === filter.source);
            if (typeof filter.publishable === 'boolean') {
                items = items.filter((c) => c.publishable === filter.publishable);
            }
            if (filter.search) {
                const needle = filter.search.toLowerCase();
                items = items.filter((c) =>
                    c.id.toLowerCase().includes(needle)
                    || c.name.toLowerCase().includes(needle)
                    || c.description.toLowerCase().includes(needle),
                );
            }
        }
        return items;
    }

    /** Count, optionally filtered. */
    count(filter?: CapabilityFilter): number {
        return this.list(filter).length;
    }

    /**
     * Mark a capability publishable (or not). Returns the updated descriptor,
     * or undefined if the id is unknown.
     */
    markPublishable(id: string, publishable = true): Capability | undefined {
        const capability = this.capabilities.get(id);
        if (!capability) return undefined;
        capability.publishable = publishable;
        return capability;
    }

    /** Remove a capability. Returns true if it existed. */
    unregister(id: string): boolean {
        return this.capabilities.delete(id);
    }

    /** Drop everything — primarily for tests and re-sync. */
    clear(): void {
        this.capabilities.clear();
    }
}

/** Process-wide singleton seam other layers register into and read from. */
export const capabilityRegistry = new CapabilityRegistry();
