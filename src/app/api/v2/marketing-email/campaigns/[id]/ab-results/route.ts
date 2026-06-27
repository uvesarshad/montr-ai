import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { connectDB } from '@/lib/mongodb';
import mongoose from 'mongoose';

/**
 * GET /api/v2/marketing-email/campaigns/[id]/ab-results
 *
 * Returns A/B test results for a campaign, aggregating open/click/sent
 * counts per variant (A and B) from the MarketingTracking collection.
 */
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await connectDB();

        // Aggregate tracking events by variant and event type
        const results = await mongoose.models.MarketingTracking.aggregate([
            {
                $match: {
                    'metadata.campaignId': params.id,
                    'metadata.abVariant': { $in: ['A', 'B'] },
                }
            },
            {
                $group: {
                    _id: {
                        variant: '$metadata.abVariant',
                        eventType: '$eventType',
                    },
                    count: { $sum: 1 },
                    // Count unique contacts for opens/clicks
                    uniqueContacts: { $addToSet: '$metadata.contactId' },
                }
            },
            {
                $group: {
                    _id: '$_id.variant',
                    events: {
                        $push: {
                            type: '$_id.eventType',
                            count: '$count',
                            uniqueCount: { $size: '$uniqueContacts' },
                        }
                    }
                }
            }
        ]);

        // Format results into a clean structure
        const formatted: Record<string, Record<string, { total: number; unique: number }>> = { A: {}, B: {} };

        for (const variantResult of results) {
            const variant = variantResult._id as 'A' | 'B';
            for (const event of variantResult.events) {
                formatted[variant][event.type] = {
                    total: event.count,
                    unique: event.uniqueCount,
                };
            }
        }

        // Calculate rates
        const buildVariantStats = (variant: 'A' | 'B') => {
            const data = formatted[variant];
            const sent = data.sent?.total ?? 0;
            const opened = data.opened?.unique ?? 0;
            const clicked = data.clicked?.unique ?? 0;

            return {
                sent,
                opened,
                clicked,
                openRate: sent > 0 ? ((opened / sent) * 100).toFixed(2) : '0.00',
                clickRate: sent > 0 ? ((clicked / sent) * 100).toFixed(2) : '0.00',
                clickToOpenRate: opened > 0 ? ((clicked / opened) * 100).toFixed(2) : '0.00',
            };
        };

        return NextResponse.json({
            campaignId: params.id,
            variantA: buildVariantStats('A'),
            variantB: buildVariantStats('B'),
            winner: (() => {
                const a = parseFloat(buildVariantStats('A').openRate);
                const b = parseFloat(buildVariantStats('B').openRate);
                if (a === b) return 'tie';
                return a > b ? 'A' : 'B';
            })(),
        });

    } catch (error) {
        console.error('A/B results error:', error);
        return NextResponse.json({ error: (error instanceof Error ? error.message : String(error)) }, { status: 500 });
    }
}
