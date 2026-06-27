'use server';

import { getSession } from '@/lib/get-session';
import { checkCredits, consumeCredits } from '@/lib/credit-service';
import { getActorByPlatform } from '@/lib/apify-actor-service';
import { processInstagramPost as processInstagramPostFlow } from './process-instagram-post-flow';

/**
 * Server action wrapper for Instagram scraping with credit management
 */
export async function processInstagramPostWithCredits(url: string) {
    const session = await getSession();
    if (!session?.user) {
        throw new Error('Unauthorized - please sign in');
    }

    const userId = session.user.id;
    if (!userId) {
        throw new Error('Unauthorized - missing user id');
    }

    // Get Instagram actor configuration
    const actor = await getActorByPlatform('instagram');
    if (!actor) {
        throw new Error('Instagram scraping is not configured');
    }

    const serviceId = `apify-${actor.actorId}`;

    // Check if user has enough credits
    const creditCheck = await checkCredits(userId, serviceId);
    if (!creditCheck.allowed) {
        if (creditCheck.reason === 'insufficient_credits') {
            throw new Error(`Insufficient credits. This operation costs ${creditCheck.cost} credits, but you only have ${creditCheck.remaining} remaining.`);
        } else {
            throw new Error('No active credit period. Please contact support.');
        }
    }

    // Process the Instagram post
    try {
        const result = await processInstagramPostFlow({ url });

        // Consume credits after successful scraping
        await consumeCredits({
            userId,
            modelOrServiceId: serviceId,
            requestType: 'scraping',
            usingByok: false,
            modelName: actor.name,
        });

        return result;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // Don't consume credits if the scraping failed
        throw new Error(`Failed to scrape Instagram post: ${message}`);
    }
}
