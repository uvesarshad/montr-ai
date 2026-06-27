// OSS single-tenant override of src/app/api/v2/organizations/social-approval-policy/route.ts — CP-2 hand-patch; org-stripped.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getSession } from '@/lib/get-session';
import { dbConnect } from '@/lib/db/connect';
import { userRepository } from '@/lib/db/repository/user.repository';
import Organization, { IOrgSocialApprovalPolicy } from '@/lib/db/models/organization.model';
import { hasSocialPlanFeature, planFeatureErrorBody } from '@/lib/social/plan-limits';

/**
 * Instance-wide social approval policy (audit C8 §A7).
 *
 * GET  — returns the install's current `socialApprovalPolicy` plus `planAllows`
 *        (the `allowApprovalWorkflow` plan feature) so the UI can lock the
 *        control on plans that don't include it.
 * PATCH — merges a partial policy update. Only admins may write, and enabling
 *        the policy requires the plan feature (402 otherwise).
 *
 * Single-tenant: the policy used to live per-org on the caller's organization
 * record. There is one workspace here, so it lives on the single Organization
 * document (resolved with `findOne()`) and the admin gate is the only access
 * check that survives — the org-membership read is dropped.
 */

const DEFAULT_POLICY: IOrgSocialApprovalPolicy = {
  enabled: false,
  appliesTo: 'non_admins',
  requireFor: ['schedule', 'publish'],
};

const policyPatchSchema = z
  .object({
    enabled: z.boolean().optional(),
    appliesTo: z.enum(['all_members', 'non_admins']).optional(),
    requireFor: z.array(z.enum(['schedule', 'publish'])).optional(),
  })
  .strict();

/**
 * Confirm the caller is an admin from their DB record. The original resolver
 * also returned the caller's org id; single-tenant drops the org (and its
 * "No organization" 403) and keeps only the admin/super_admin gate.
 */
async function requireAdmin(
  userId: string
): Promise<{ ok: true } | { error: NextResponse }> {
  const user = await userRepository.findById(userId);
  const role = (user as { role?: string } | null)?.role;
  if (role !== 'admin' && role !== 'super_admin') {
    return {
      error: NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 }),
    };
  }
  return { ok: true };
}

function readPolicy(raw: Partial<IOrgSocialApprovalPolicy> | undefined): IOrgSocialApprovalPolicy {
  return {
    enabled: raw?.enabled ?? DEFAULT_POLICY.enabled,
    appliesTo: raw?.appliesTo ?? DEFAULT_POLICY.appliesTo,
    requireFor: Array.isArray(raw?.requireFor) ? raw!.requireFor : DEFAULT_POLICY.requireFor,
  };
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();
    const resolved = await requireAdmin(session.user.id);
    if ('error' in resolved) return resolved.error;

    const org = await Organization.findOne().select('socialApprovalPolicy').lean();
    const planAllows = await hasSocialPlanFeature(session.user.id, 'allowApprovalWorkflow');

    return NextResponse.json({
      policy: readPolicy(org?.socialApprovalPolicy as IOrgSocialApprovalPolicy | undefined),
      planAllows,
    });
  } catch (error) {
    console.error('Error fetching social approval policy:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();
    const resolved = await requireAdmin(session.user.id);
    if ('error' in resolved) return resolved.error;

    const body = await req.json();
    const patch = policyPatchSchema.parse(body);

    const org = await Organization.findOne().select('socialApprovalPolicy');
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const current = readPolicy(org.socialApprovalPolicy as IOrgSocialApprovalPolicy | undefined);
    const next: IOrgSocialApprovalPolicy = {
      enabled: patch.enabled ?? current.enabled,
      appliesTo: patch.appliesTo ?? current.appliesTo,
      requireFor: patch.requireFor ?? current.requireFor,
    };

    // Enabling the policy requires the plan's approval-workflow feature.
    if (next.enabled) {
      const planAllows = await hasSocialPlanFeature(session.user.id, 'allowApprovalWorkflow');
      if (!planAllows) {
        return NextResponse.json(planFeatureErrorBody('allowApprovalWorkflow'), { status: 402 });
      }
    }

    org.socialApprovalPolicy = next;
    await org.save();

    return NextResponse.json({ policy: next, planAllows: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.flatten() },
        { status: 400 }
      );
    }
    console.error('Error updating social approval policy:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
