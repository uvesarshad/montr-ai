'use server';

import { dbConnect } from './db/connect';
import ApifyActor, { IApifyActor } from './db/models/apify-actor.model';

/**
 * Apify Actor Service
 * 
 * Manages Apify actor configurations for scraping operations.
 * Actors can be added, updated, and deleted by super admins.
 */

export interface ApifyActorInput {
    actorId: string;
    name: string;
    description?: string;
    platform: string;
    creditCost: number;
    addedBy: string;
}

/**
 * Get all Apify actors
 */
export async function getAllActors(): Promise<IApifyActor[]> {
    await dbConnect();
    // @ts-expect-error
    return await ApifyActor.find().sort({ createdAt: -1 }).lean();
}

/**
 * Get only enabled Apify actors
 */
export async function getEnabledActors(): Promise<IApifyActor[]> {
    await dbConnect();
    // @ts-expect-error
    return await ApifyActor.find({ isEnabled: true }).sort({ platform: 1 }).lean();
}

/**
 * Get actor by ID
 */
export async function getActorById(actorId: string): Promise<IApifyActor | null> {
    await dbConnect();
    // @ts-expect-error
    return await ApifyActor.findOne({ actorId }).lean();
}

/**
 * Get actor by platform
 */
export async function getActorByPlatform(platform: string): Promise<IApifyActor | null> {
    await dbConnect();
    // @ts-expect-error
    return await ApifyActor.findOne({
        platform: platform.toLowerCase(),
        isEnabled: true
    }).lean();
}

/**
 * Add new Apify actor (admin only)
 */
export async function addActor(input: ApifyActorInput): Promise<IApifyActor> {
    await dbConnect();

    // Check if actor already exists
    const existing = await ApifyActor.findOne({ actorId: input.actorId });
    if (existing) {
        throw new Error('An actor with this ID already exists');
    }

    const actor = new ApifyActor({
        actorId: input.actorId,
        name: input.name,
        description: input.description,
        platform: input.platform.toLowerCase(),
        creditCost: input.creditCost,
        isEnabled: true,
        addedBy: input.addedBy,
    });

    return await actor.save();
}

/**
 * Update Apify actor
 */
export async function updateActor(
    actorId: string,
    updates: Partial<Pick<IApifyActor, 'name' | 'description' | 'platform' | 'creditCost' | 'isEnabled'>>
): Promise<IApifyActor | null> {
    await dbConnect();

    // @ts-expect-error
    return await ApifyActor.findOneAndUpdate(
        { actorId },
        { $set: { ...updates, updatedAt: new Date() } },
        { new: true }
    ).lean();
}

/**
 * Delete Apify actor
 */
export async function deleteActor(actorId: string): Promise<boolean> {
    await dbConnect();

    const result = await ApifyActor.deleteOne({ actorId });
    return result.deletedCount > 0;
}

/**
 * Toggle actor enabled status
 */
export async function toggleActor(actorId: string): Promise<IApifyActor | null> {
    await dbConnect();

    const actor = await ApifyActor.findOne({ actorId });
    if (!actor) return null;

    actor.isEnabled = !actor.isEnabled;
    await actor.save();

    return actor.toObject();
}

/**
 * Get credit cost for an actor
 */
export async function getActorCreditCost(actorId: string): Promise<number> {
    await dbConnect();

    const actor = await ApifyActor.findOne({ actorId, isEnabled: true });
    if (!actor) {
        // Return default cost if actor not found
        return 10;
    }

    return actor.creditCost;
}

/**
 * Seed initial actors (for development/migration)
 */
export async function seedInitialActors(addedBy: string): Promise<void> {
    await dbConnect();

    const existingCount = await ApifyActor.countDocuments();
    if (existingCount > 0) {
        console.log('Apify actors already exist, skipping seed');
        return;
    }

    const initialActors = [
        {
            actorId: 'shu8hvrXbJbY3Eb9W',
            name: 'Instagram Scraper',
            description: 'Scrapes Instagram posts, reels, and profiles',
            platform: 'instagram',
            creditCost: 10,
            isEnabled: true,
            addedBy,
        },
        {
            actorId: 'voyager',
            name: 'LinkedIn Scraper',
            description: 'Scrapes LinkedIn profiles and posts',
            platform: 'linkedin',
            creditCost: 15,
            isEnabled: true,
            addedBy,
        },
    ];

    await ApifyActor.insertMany(initialActors);
    console.log('Seeded initial Apify actors');
}
