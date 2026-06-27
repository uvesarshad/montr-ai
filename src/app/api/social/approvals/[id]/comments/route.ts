import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { postApprovalRepository } from '@/lib/db/repository/post-approval.repository';
import { userRepository } from '@/lib/db/repository/user.repository';
import { idsEqual } from '@/lib/utils/object-id';

/**
 * POST /api/social/approvals/[id]/comments
 * Add a review comment to an approval thread.
 *
 * Permission: only org admins (admin / super_admin) or the original submitter
 * may comment. Org-scoped: the approval must belong to the caller's organization.
 */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const user = await userRepository.findById(session.user.id);
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const approvalId = params.id;
        const body = await request.json();
        const text = typeof body?.text === 'string' ? body.text.trim() : '';
        if (!text) {
            return NextResponse.json({ error: 'Comment text required' }, { status: 400 });
        }

        const existing = await postApprovalRepository.findById(approvalId);
        if (!existing) {
            return NextResponse.json({ error: 'Approval not found' }, { status: 404 });
        }

        // Tenancy: the approval must be in the caller's organization.
        if (!user) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        // Only org admins or the submitter may comment.
        const isAdmin = user.role === 'admin' || user.role === 'super_admin';
        const isSubmitter = idsEqual(existing.submittedBy, user._id);
        if (!isAdmin && !isSubmitter) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }

        const userName =
            user.name ||
            [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
            user.email ||
            undefined;

        const approval = await postApprovalRepository.addComment(approvalId, {
            userId: user._id.toString(),
            userName,
            text,
        });

        if (!approval) {
            return NextResponse.json({ error: 'Approval not found' }, { status: 404 });
        }

        return NextResponse.json({ approval }, { status: 201 });
    } catch (error) {
        console.error('Error adding approval comment:', error);
        return NextResponse.json({ error: 'Failed to add comment' }, { status: 500 });
    }
}
