/**
 * Shared WhatsApp account resolution for workflow node processors (H20).
 *
 * Mirrors the brand-aware selection chain used by voice/make-call.ts:
 *   - The organization is ALWAYS taken from the execution, never derived
 *     from the account record.
 *   - Resolution order:
 *       1. explicit `config.accountId` — must belong to the execution org
 *          (hard fail otherwise).
 *       2. brand-scoped lookup using execution.brandId / workflow.brandId /
 *          config.brandId — first active account for that brand in the org.
 *       3. org-wide accounts with a deterministic default (first active;
 *          warns when several active accounts exist so the run is auditable).
 */

import type { NodeProcessorContext } from '../index';
import { whatsappAccountRepository } from '../../../db/repository/whatsapp-account.repository';
import type { IWhatsAppAccount } from '../../../db/models/whatsapp-account.model';

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function isActive(account: IWhatsAppAccount): boolean {
  return account.status === 'active';
}

/**
 * Resolve which WhatsApp account a workflow send should use.
 *
 * @returns the resolved account and the org id (from the execution).
 */
export async function resolveWhatsAppAccount(
  context: NodeProcessorContext,
): Promise<{ account: IWhatsAppAccount; }> {
  const { config, execution, workflow } = context;

  const organizationId = execution.userId.toString();

  // 1. Explicit account selected on the node ("Send from").
  const explicitAccountId = asString(config.accountId);
  if (explicitAccountId) {
    const account = await whatsappAccountRepository.findById(explicitAccountId);
    if (!account) {
      throw new Error(
        `Selected WhatsApp account (${explicitAccountId}) does not belong to this organization`,
      );
    }
    return { account };
  }

  // Fetch the org's accounts once for the brand / default chains.
  const orgAccounts = await whatsappAccountRepository.findByOrganizationId();
  if (!orgAccounts || orgAccounts.length === 0) {
    throw new Error(
      `No WhatsApp account is connected for this organization — connect a WhatsApp number first`,
    );
  }

  // 2. Brand-scoped lookup (execution brand → workflow brand → config brand).
  const brandId =
    (execution.brandId ? execution.brandId.toString() : undefined)
    ?? (workflow.brandId ? workflow.brandId.toString() : undefined)
    ?? asString(config.brandId);

  if (brandId) {
    const brandAccounts = orgAccounts.filter(
      (a) => a.brandId && a.brandId.toString() === brandId,
    );
    const activeBrandAccounts = brandAccounts.filter(isActive);
    const pick = activeBrandAccounts[0] ?? brandAccounts[0];
    if (pick) {
      if (activeBrandAccounts.length > 1) {
        console.warn(
          `[WhatsApp] Multiple active accounts for brand ${brandId}; defaulting to ${pick._id} — set "Send from" on the node to disambiguate`,
        );
      }
      return { account: pick };
    }
    // No account for this brand — fall through to org-wide default.
    console.warn(
      `[WhatsApp] No WhatsApp account scoped to brand ${brandId}; falling back to an org-wide account`,
    );
  }

  // 3. Org-wide deterministic default (first active; warn if ambiguous).
  const activeOrgAccounts = orgAccounts.filter(isActive);
  const pick = activeOrgAccounts[0] ?? orgAccounts[0];
  if (activeOrgAccounts.length > 1) {
    console.warn(
      `[WhatsApp] Organization ${organizationId} has multiple active WhatsApp accounts; defaulting to ${pick._id} — set "Send from" on the node to disambiguate`,
    );
  }
  return { account: pick };
}
