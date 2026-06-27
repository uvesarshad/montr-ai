import { NextResponse } from 'next/server';
import { planRepository } from '@/lib/db/repository/plan.repository';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const plans = await planRepository.findActive();

        // Filter and map to return only necessary public data
        const publicPlans = plans.map(plan => ({
            id: plan._id,
            name: plan.name,
            displayName: plan.displayName,
            description: plan.description,
            price: plan.price,
            currency: plan.currency || process.env.NEXT_PUBLIC_APP_CURRENCY || 'USD',
            billingInterval: plan.billingInterval,
            features: plan.features,
            monthlyCredits: plan.features?.monthlyCredits ?? 0,
            razorpayPlanId: plan.razorpayPlanId,
        }));

        return NextResponse.json(publicPlans);
    } catch (error) {
        console.error('Failed to fetch plans:', error);
        return NextResponse.json(
            { error: 'Failed to fetch plans' },
            { status: 500 }
        );
    }
}
