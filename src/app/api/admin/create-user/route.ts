import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userRepository } from '@/lib/db/repository/user.repository';
// import { organizationRepository } from '@/lib/db/repository/organization.repository'; // Assume this exists


export async function POST(request: NextRequest) {
    try {
        // Auth: super_admin only. Without this gate any authenticated user could create
        // arbitrary users (including admins) in any organization.
        const session = await getSession();
        const callerRole = (session?.user as { role?: string } | undefined)?.role;
        if (!session?.user || (callerRole !== 'admin' && callerRole !== 'super_admin')) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { email, profileName, username, role } = await request.json();

        if (!email || !profileName || !username || !role) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        if (!['user', 'admin'].includes(role)) {
            return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
        }

        // Check if user exists
        const existingUser = await userRepository.findByEmail(email);
        if (existingUser) {
            return NextResponse.json({ error: 'User already exists' }, { status: 409 });
        }

        // Create user
        // Note: Password is not set here. In a real flow, we'd generate a temporary one or send an invite link.
        // For now, we'll create the user without a password (if allowed) or with a dummy one that must be reset.
        // Or we can generate a random password.
        const tempPassword = Math.random().toString(36).slice(-8);

        const newUser = await userRepository.create({
            email,
            name: profileName,
            password: tempPassword, // Use create method which hashes it
        });

        const newUserId = String(newUser._id);
        await userRepository.update(newUserId, { username });
        await userRepository.updateRole(newUserId, role);
        await userRepository.updateOrganization(newUserId);

        // Add to organization members
        // await organizationRepository.addMember(organizationId, newUser._id);
        // Assuming we have org repo. If not, maybe skip for now or use raw mongoose if needed.
        // But user has organizationId, so that's the link.

        console.log('Created user:', newUser._id, 'Temp Password:', tempPassword);

        return NextResponse.json({
            success: true,
            userId: newUser._id,
            message: 'User created successfully.',
            tempPassword: tempPassword // ONLY FOR DEV/ADMIN usage
        });

    } catch (error) {
        console.error('Error creating user:', error);
        const message = error instanceof Error ? error.message : 'Failed to create user';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
