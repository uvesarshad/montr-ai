'use server';

import {
    ModelDefinition,
    ModelType,
    getAllBuiltInModels,
    getModelsByType,
    findModelById,
    getCreditCost as getBuiltInCreditCost,
    SCRAPING_SERVICES
} from './model-groups';
import { dbConnect } from './db/connect';
import CustomModel, { ICustomModel } from './db/models/custom-model.model';
import ModelOverride, { IModelOverride } from './db/models/model-override.model';

/**
 * Model Registry Service
 * 
 * Central service for managing all AI models (built-in + custom).
 * Provides a unified interface for model discovery and routing.
 * Supports model overrides for customizing built-in models.
 */

/**
 * Apply overrides to a model
 */
function applyOverride(model: ModelDefinition, override: IModelOverride): ModelDefinition {
    return {
        ...model,
        ...(override.name && { name: override.name }),
        ...(override.tier && { tier: override.tier }),
        ...(override.creditCost !== undefined && { creditCost: override.creditCost }),
    };
}

/**
 * Get all model overrides from database
 */
async function getModelOverrides(): Promise<Map<string, IModelOverride>> {
    try {
        await dbConnect();
        const overrides = await ModelOverride.find({});
        const overrideMap = new Map<string, IModelOverride>();
        overrides.forEach(override => {
            overrideMap.set(override.modelId, override);
        });
        return overrideMap;
    } catch (error) {
        console.error('Failed to fetch model overrides:', error);
        return new Map();
    }
}

/**
 * Convert custom model document to ModelDefinition
 */
function customModelToDefinition(doc: ICustomModel): ModelDefinition {
    return {
        id: doc.openRouterId,
        name: doc.displayName,
        provider: doc.provider || 'openrouter',
        type: doc.type,
        tier: doc.tier || 'pro',
        creditCost: doc.creditCost,
        supportsDirectApi: doc.routing === 'aisdk',
        supportsAiSdk: true,
        isCustom: true,
        openRouterId: doc.openRouterId,
    };
}

/**
 * Get all custom models from database
 */
export async function getCustomModels(): Promise<ModelDefinition[]> {
    try {
        await dbConnect();
        const customModels = await CustomModel.find({ isEnabled: true });
        return customModels.map(customModelToDefinition);
    } catch (error) {
        console.error('Failed to fetch custom models:', error);
        return [];
    }
}

/**
 * Get all models (built-in + custom) with overrides applied
 */
export async function getAllModels(type?: ModelType): Promise<ModelDefinition[]> {
    const builtInModels = type ? getModelsByType(type) : getAllBuiltInModels();
    const customModels = await getCustomModels();
    const overrides = await getModelOverrides();

    // Apply overrides to built-in models and filter out disabled/hidden ones
    const processedBuiltInModels = builtInModels
        .map(model => {
            const override = overrides.get(model.id);
            if (override) {
                // Skip if hidden or disabled
                if (override.isHidden || !override.isEnabled) {
                    return null;
                }
                return applyOverride(model, override);
            }
            return model;
        })
        .filter((model): model is ModelDefinition => model !== null);

    // Filter custom models by type if specified
    const filteredCustomModels = type
        ? customModels.filter(m => m.type === type)
        : customModels;

    return [...processedBuiltInModels, ...filteredCustomModels];
}

/**
 * Find a model by ID (checks both built-in and custom)
 */
export async function findModel(modelId: string): Promise<ModelDefinition | null> {
    // First check built-in models
    const builtIn = findModelById(modelId);
    if (builtIn) return builtIn;

    // Check custom models
    try {
        await dbConnect();
        const customModel = await CustomModel.findOne({
            openRouterId: modelId,
            isEnabled: true
        });

        if (customModel) {
            return customModelToDefinition(customModel);
        }
    } catch (error) {
        console.error('Failed to find custom model:', error);
    }

    return null;
}

/**
 * Get credit cost for a model or service
 */
export async function getCreditCost(modelOrServiceId: string): Promise<number> {
    // Check built-in first
    const builtInCost = getBuiltInCreditCost(modelOrServiceId);
    if (builtInCost !== 10) { // 10 is the default/unknown value
        return builtInCost;
    }

    // Check scraping services
    const scrapingService = SCRAPING_SERVICES.find(s => s.id === modelOrServiceId);
    if (scrapingService) {
        return scrapingService.creditCost;
    }

    // Check Apify actors (dynamic from database)
    if (modelOrServiceId.startsWith('apify-')) {
        try {
            const { getActorCreditCost } = await import('./apify-actor-service');
            const actorId = modelOrServiceId.replace('apify-', '');
            const cost = await getActorCreditCost(actorId);
            if (cost) return cost;
        } catch (error) {
            console.error('Failed to get Apify actor credit cost:', error);
        }
    }

    // Check custom models
    try {
        await dbConnect();
        const customModel = await CustomModel.findOne({
            openRouterId: modelOrServiceId
        }).lean();

        if (customModel) {
            return customModel.creditCost;
        }
    } catch (error) {
        console.error('Failed to get custom model credit cost:', error);
    }

    // Default cost for completely unknown models
    return 10;
}


/**
 * Check if a model exists (built-in or custom)
 */
export async function modelExists(modelId: string): Promise<boolean> {
    const model = await findModel(modelId);
    return model !== null;
}

/**
 * Add a custom model (admin only)
 */
export async function addCustomModel(
    openRouterId: string,
    displayName: string,
    type: ModelType,
    creditCost: number,
    addedBy: string,
    description?: string
): Promise<ICustomModel> {
    await dbConnect();

    const customModel = new CustomModel({
        openRouterId,
        displayName,
        type,
        creditCost,
        addedBy,
        description,
        isEnabled: true,
    });

    return await customModel.save();
}

/**
 * Update a custom model
 */
export async function updateCustomModel(
    openRouterId: string,
    updates: Partial<Pick<ICustomModel, 'displayName' | 'creditCost' | 'isEnabled' | 'description'>>
): Promise<ICustomModel | null> {
    await dbConnect();

    return await CustomModel.findOneAndUpdate(
        { openRouterId },
        { $set: { ...updates, updatedAt: new Date() } },
        { new: true }
    );
}

/**
 * Delete a custom model
 */
export async function deleteCustomModel(openRouterId: string): Promise<boolean> {
    await dbConnect();

    const result = await CustomModel.deleteOne({ openRouterId });
    return result.deletedCount > 0;
}

/**
 * Get all custom models (including disabled) for admin
 */
export async function getAllCustomModelsForAdmin(): Promise<ICustomModel[]> {
    await dbConnect();
    return await CustomModel.find().sort({ createdAt: -1 });
}

/**
 * Toggle custom model enabled status
 */
export async function toggleCustomModel(openRouterId: string): Promise<ICustomModel | null> {
    await dbConnect();

    const model = await CustomModel.findOne({ openRouterId });
    if (!model) return null;

    model.isEnabled = !model.isEnabled;
    await model.save();

    return model.toObject();
}
