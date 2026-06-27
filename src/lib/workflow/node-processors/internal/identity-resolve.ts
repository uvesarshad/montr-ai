/**
 * Identity Resolve Processor.
 *
 * Wraps B3's `resolveContact()` from `src/lib/identity/`. Maps a workflow
 * node's `{ email, phone, socialHandles, brandId }` config onto the resolver
 * and writes the result into a node-scoped variable so downstream nodes can
 * branch on whether the contact existed or was newly created.
 *
 * Cross-branch note: this processor's import of `@/lib/identity` is dynamic
 * so the file typechecks on `bundle-2-strengthening` (where the module isn't
 * present) and resolves correctly post-merge into v0.5. The runtime falls
 * through to a clear error if the module is missing.
 */

import { NodeProcessor, NodeProcessorContext } from '../index';

interface ResolveContactArgs {
  brandId?: string | null;
  email?: string;
  phone?: string;
  socialHandles?: Record<string, string>;
  source?: string;
  createIfMissing?: boolean;
}

interface ResolveContactResult {
  contact: { _id: string | { toString(): string }; [key: string]: unknown };
  created: boolean;
  matchedBy: string;
}

interface IdentityModule {
  resolveContact: (args: ResolveContactArgs) => Promise<ResolveContactResult>;
}

async function loadIdentityModule(): Promise<IdentityModule> {
  try {
    // Dynamic import via a string-variable specifier so the module is NOT
    // statically resolved at typecheck time. The `@/lib/identity` module
    // ships on B3's branch and lands when bundle-3-strengthening merges
    // into v0.5; this processor compiles cleanly on either side of that
    // merge and resolves at runtime.
    const modulePath = '@/lib/identity';
    const mod = (await import(/* webpackIgnore: true */ modulePath)) as unknown as IdentityModule;
    if (typeof mod.resolveContact !== 'function') {
      throw new Error('@/lib/identity has no resolveContact export');
    }
    return mod;
  } catch (error) {
    throw new Error(
      `identity_resolve processor requires the @/lib/identity module (B3 X2). ` +
      `Module not loadable — merge B3's bundle-3-strengthening into v0.5 first. ` +
      `Underlying error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export class IdentityResolveProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, execution } = context;

    const email = typeof config.email === 'string' ? config.email : undefined;
    const phone = typeof config.phone === 'string' ? config.phone : undefined;
    const socialHandles = (config.socialHandles && typeof config.socialHandles === 'object')
      ? (config.socialHandles as Record<string, string>)
      : undefined;
    const createIfMissing = config.createIfMissing !== false;
    const source = typeof config.source === 'string' ? config.source : 'workflow';

    if (!email && !phone && (!socialHandles || Object.keys(socialHandles).length === 0)) {
      throw new Error('identity_resolve: at least one of email / phone / socialHandles is required');
    }

    // Prefer the workflow's brandId when set, then fall back to the per-node config.
    const workflowBrand = (context.workflow as { brandId?: { toString(): string } | null | undefined }).brandId;
    const brandId = workflowBrand
      ? workflowBrand.toString()
      : (typeof config.brandId === 'string' ? config.brandId : undefined);

    const { resolveContact } = await loadIdentityModule();
    const result = await resolveContact({
      brandId,
      email,
      phone,
      socialHandles,
      source,
      createIfMissing,
    });

    return {
      contactId: typeof result.contact._id === 'string' ? result.contact._id : result.contact._id.toString(),
      created: result.created,
      matchedBy: result.matchedBy,
    };
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    const hasEmail = typeof config.email === 'string' && config.email.length > 0;
    const hasPhone = typeof config.phone === 'string' && config.phone.length > 0;
    const hasHandle = config.socialHandles && typeof config.socialHandles === 'object'
      && Object.keys(config.socialHandles as Record<string, unknown>).length > 0;
    if (!hasEmail && !hasPhone && !hasHandle) {
      errors.push('At least one of email / phone / socialHandles is required.');
    }
    return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
  }
}
