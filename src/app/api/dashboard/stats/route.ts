import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { getSession } from '@/lib/get-session';
import User from '@/lib/db/models/user.model';
import CreditUsage from '@/lib/db/models/credit-usage.model';
import { dbConnect } from '@/lib/db/connect';

export async function GET() {
    try {
        const session = await getSession();

        const sessionUser = session?.user as
            | { id?: string; email?: string }
            | undefined;
        if (!sessionUser?.id) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        await dbConnect();

        // Look up by _id (indexed PK) instead of email — faster, no case-fold
        // pitfalls. Cast to ObjectId because the user model has typed _id.
        const currentUser = await User.findById(new ObjectId(sessionUser.id));

        if (!currentUser) {
            return new NextResponse('User not found', { status: 404 });
        }
        // If no org, return 0 for everything or just user stats
        const orgFilter = { _id: currentUser._id };
        const usageFilter = { userId: currentUser._id };
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

        // Run the three independent queries in parallel. Previously they ran
        // sequentially, which made p50 latency ~3× the slowest of the trio.
        const [collaboratorsCount, activeNowCount, creditUsage] = await Promise.all([
            User.countDocuments(orgFilter),
            User.countDocuments({
                ...orgFilter,
                updatedAt: { $gte: fifteenMinutesAgo },
            }),
            CreditUsage.aggregate([
                { $match: usageFilter },
                {
                    $group: {
                        _id: null,
                        totalGenerations: { $sum: '$creditsUsed' },
                    },
                },
            ]),
        ]);

        const aiGenerationsCount = creditUsage[0]?.totalGenerations || 0;

        return NextResponse.json({
            collaborators: collaboratorsCount,
            activeNow: activeNowCount,
            aiGenerations: aiGenerationsCount,
        });

    } catch (error) {
        console.error('[DASHBOARD_STATS_GET]', error);
        return new NextResponse('Internal Error', { status: 500 });
    }
}
