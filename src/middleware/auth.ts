import { getSession } from '@/lib/get-session';
import { connectMongoose } from '@/lib/mongodb';
import User from '@/lib/db/models/user.model';
import { redirect } from 'next/navigation';

export async function requireSuperAdmin() {
    const session = await getSession();
    const sessionUser = session?.user as { id?: string; email?: string } | undefined;

    if (!sessionUser?.id) {
        redirect('/auth/signin');
    }

    await connectMongoose();
    // PK lookup is faster than email and skips the email-case-folding pitfall.
    const user = await User.findById(sessionUser.id);

    if (!user || user.role !== 'super_admin') {
        redirect('/');
    }

    return user;
}

export async function getUserFromSession() {
    const session = await getSession();
    const sessionUser = session?.user as { id?: string; email?: string } | undefined;
    if (!sessionUser?.id) return null;

    await connectMongoose();
    return User.findById(sessionUser.id);
}
