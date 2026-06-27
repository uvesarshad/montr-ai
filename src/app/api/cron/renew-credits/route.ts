import { NextRequest, NextResponse } from 'next/server';
import { dbConnect } from '@/lib/db/connect';
import User from '@/lib/db/models/user.model';
import { planRepository } from '@/lib/db/repository/plan.repository';
import { allocateCredits } from '@/lib/credit-service';
import { logger } from '@/lib/logger';
import { Types } from 'mongoose';

interface LeanUser {
    _id: Types.ObjectId;
    planId?: string;
}

/**
 * POST /api/cron/renew-credits
 * Monthly cron job to renew credits for all active subscribers.
 * Should be called by a cron service (e.g., Vercel Cron, GitHub Actions) on the 1st of each month.
 * Protected by CRON_SECRET environment variable.
 */
export async function POST(request: NextRequest) {
    try {
        // Verify cron secret. Fail closed if CRON_SECRET is unset — previously
        // a missing env var left the endpoint open, which allowed credit
        // allocation to be triggered by anyone able to reach the URL.
        const cronSecret = process.env.CRON_SECRET;
        if (!cronSecret) {
            console.error('[Cron] CRON_SECRET is not configured');
            return NextResponse.json(
                { error: 'Cron endpoint not configured' },
                { status: 503 }
            );
        }

        const authHeader = request.headers.get('authorization');
        if (authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await dbConnect();

        // Self-heal: users without a planId should be assigned the free plan
        const usersWithoutPlan = await User.find({
            $or: [
                { planId: { $exists: false } },
                { planId: null }
            ]
        }).lean();

        let healed = 0;
        if (usersWithoutPlan.length > 0) {
            const freePlan = await planRepository.findByName('free');
            if (freePlan) {
                const userIdsWithoutPlan = (usersWithoutPlan as LeanUser[]).map(u => u._id);
                const updateResult = await User.updateMany(
                    { _id: { $in: userIdsWithoutPlan } },
                    { $set: { planId: freePlan._id.toString() } }
                );
                healed = updateResult.modifiedCount;
                logger.info({
                    event: 'cron.renew_credits.self_heal',
                    component: 'cron/renew-credits',
                    healed,
                });
            }
        }

        // Find all users with an active plan (including newly healed ones)
        const usersWithPlan = await User.find({
            planId: { $exists: true, $ne: null }
        }).lean();

        let renewed = 0;
        let skipped = 0;
        const errors: string[] = [];

        for (const user of usersWithPlan as LeanUser[]) {
            try {
                const userId = user._id.toString();
                const planId = user.planId;

                if (!planId) {
                    skipped++;
                    continue;
                }

                const plan = await planRepository.findById(planId);
                if (!plan || plan.status !== 'active') {
                    skipped++;
                    continue;
                }

                const monthlyCredits = plan.features?.monthlyCredits ?? 0;
                if (monthlyCredits <= 0) {
                    skipped++;
                    continue;
                }

                // Calculate period end based on billing interval
                const periodEnd = new Date();
                if (plan.billingInterval === 'yearly') {
                    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
                } else if (plan.billingInterval === 'lifetime') {
                    periodEnd.setFullYear(periodEnd.getFullYear() + 100);
                } else {
                    periodEnd.setMonth(periodEnd.getMonth() + 1);
                }

                await allocateCredits(userId, monthlyCredits, periodEnd);
                renewed++;
            } catch (err) {
                errors.push(`User ${user._id}: ${(err instanceof Error ? err.message : String(err))}`);
            }
        }

        return NextResponse.json({
            success: true,
            message: `Credit renewal complete`,
            stats: { renewed, skipped, healed, errors: errors.length },
            errors: errors.length > 0 ? errors : undefined,
        });

    } catch (error) {
        logger.error(
            {
                event: 'cron.renew_credits.failed',
                component: 'cron/renew-credits',
            },
            error,
        );
        return NextResponse.json(
            { error: (error instanceof Error ? error.message : String(error)) || 'Credit renewal failed' },
            { status: 500 }
        );
    }
}
