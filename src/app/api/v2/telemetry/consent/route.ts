import { getSession } from '@/lib/get-session';
import { NextRequest, NextResponse } from 'next/server';
import User from '@/lib/db/models/user.model';
import { dbConnect } from '@/lib/db/connect';
import { isSuperAdminEmail } from '@/lib/auth/super-admin';
import { telemetryRepository } from '@/lib/db/repository/telemetry.repository';
import { TELEMETRY_POLICY_VERSION } from '@/lib/telemetry/flywheel';

/**
 * Install-wide flywheel telemetry consent.
 *
 * GET  — any authenticated user reads the current flag + policy version.
 * POST — admins flip the install-wide opt-in (default OFF). Body: { enabled: boolean }.
 *
 * See docs/plan/oss-telemetry-privacy-spec-2026-06-20.md §6 (consent UX).
 */

function isAdmin(user: { email?: string | null; role?: string | null } | null): boolean {
    if (!user) return false;
    if (user.email && isSuperAdminEmail(user.email)) return true;
    return user.role === 'admin' || user.role === 'super_admin';
}

export async function GET() {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const consent = await telemetryRepository.getConsent();
        return NextResponse.json({
            telemetryEnabled: Boolean(consent?.telemetryEnabled),
            policyVersion: consent?.policyVersion ?? null,
            consentedAt: consent?.consentedAt ?? null,
            currentPolicyVersion: TELEMETRY_POLICY_VERSION,
        });
    } catch (error) {
        console.error('Error reading telemetry consent:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();
        const user = await User.findById(session.user.id);
        if (!isAdmin(user)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await req.json().catch(() => ({}));
        if (typeof body?.enabled !== 'boolean') {
            return NextResponse.json({ error: 'enabled (boolean) is required' }, { status: 400 });
        }

        const updated = await telemetryRepository.setConsent({
            enabled: body.enabled,
            policyVersion: TELEMETRY_POLICY_VERSION,
            updatedBy: session.user.id,
        });

        return NextResponse.json({
            telemetryEnabled: updated.telemetryEnabled,
            policyVersion: updated.policyVersion,
            consentedAt: updated.consentedAt,
        });
    } catch (error) {
        console.error('Error updating telemetry consent:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
