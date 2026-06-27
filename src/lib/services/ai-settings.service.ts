
import { userRepository } from '@/lib/db/repository/user.repository';
import SystemSettings, { ISystemSettings } from '@/lib/db/models/system-settings.model';
import { dbConnect } from '@/lib/db/connect';
import { AI_TASKS, findModelById } from '@/lib/model-groups';
import { RouteHint } from '@/ai/types';

export interface AIPreference {
    modelId: string;
    providerId: string;
    routeHint?: RouteHint;
    /** Where this preference came from. 'fallback' = nobody chose it — callers may substitute a plan-tier default. */
    source?: 'user' | 'system' | 'fallback';
}

export class AISettingsService {
    private static readonly FALLBACK_DEFAULTS: Record<string, AIPreference> = AI_TASKS.reduce((acc, task) => {
        const model = findModelById(task.defaultModel);
        let routeHint: RouteHint | undefined;

        if (model) {
            if (model.supportsDirectApi) {
                routeHint = { sdk: 'genkit', provider: model.provider, keySource: 'system' };
            } else if (model.supportsAiSdk) {
                routeHint = { sdk: 'aisdk', provider: model.provider, keySource: 'system' }; // Or openrouter if that's how we route non-direct
            }
        }

        acc[task.id] = {
            modelId: task.defaultModel,
            providerId: model?.provider || 'unknown',
            routeHint: routeHint
        };
        return acc;
    }, {} as Record<string, AIPreference>);

    /**
     * Retrieves the preferred model for a specific task.
     * Priority: User Preference > System Default > Hardcoded Fallback
     */
    static async getPreferredModel(userId: string | undefined, taskType: string): Promise<AIPreference> {
        await dbConnect();

        let preference: AIPreference | undefined;

        // 1. Check User Preference
        if (userId) {
            const user = await userRepository.findById(userId);
            if (user && user.aiPreferences && user.aiPreferences.get(taskType)) {
                const userPref = user.aiPreferences.get(taskType);
                if (userPref) {
                    preference = {
                        modelId: userPref.modelId,
                        providerId: userPref.providerId,
                        source: 'user'
                    };
                }
            }
        }

        // 2. Check System Defaults
        if (!preference) {
            const systemSettings = await SystemSettings.findOne({ type: 'ai-defaults' });
            if (systemSettings && systemSettings.settings && systemSettings.settings[taskType]) {
                preference = { ...(systemSettings.settings[taskType] as AIPreference), source: 'system' };
            }
        }

        // 3. Fallback
        if (!preference) {
            preference = { ...(this.FALLBACK_DEFAULTS[taskType] || this.FALLBACK_DEFAULTS.summarization), source: 'fallback' };
        }

        // 4. Enrich with RouteHint if missing (it won't be saved in DB usually, so we re-generate it)
        if (preference && !preference.routeHint) {
            const model = findModelById(preference.modelId);
            if (model) {
                // Determine route hint based on model capabilities
                // This logic must match client.ts expectations
                if (model.supportsDirectApi) {
                    preference.routeHint = { sdk: 'genkit', provider: model.provider, keySource: 'system' };
                } else if (model.supportsAiSdk) {
                    // For AI SDK, we might route via OpenRouter or direct provider if supported
                    // For now, let's assume if it supports AiSdk but not DirectApi, we use AISDK
                    // We need to know if we are using OpenRouter or specific provider
                    // The client.ts handles 'aisdk' + 'openrouter'. 
                    // Does model-groups define this?
                    // PROVIDERS list has 'openrouter'.
                    // If provider is NOT one of the direct ones, maybe we use openrouter?
                    // Or maybe we map provider to 'openrouter' if it is not supported directly?

                    // Simple heuristic for now:
                    if (['openai', 'google', 'anthropic', 'xai'].includes(model.provider) && model.supportsDirectApi) {
                        preference.routeHint = { sdk: 'genkit', provider: model.provider, keySource: 'system' };
                    } else {
                        // Default to AI SDK / OpenRouter for others
                        preference.routeHint = { sdk: 'aisdk', provider: 'openrouter', keySource: 'system' };
                    }
                }
            }
        }

        return preference!;
    }

    /**
     * Retrieves all system defaults.
     */
    static async getSystemDefaults(): Promise<Record<string, AIPreference>> {
        await dbConnect();
        const systemSettings = await SystemSettings.findOne({ type: 'ai-defaults' });
        return (systemSettings?.settings as Record<string, AIPreference>) || {};
    }

    /**
     * Updates system defaults (Admin only).
     */
    static async updateSystemDefaults(settings: Record<string, AIPreference>, adminId: string): Promise<ISystemSettings> {
        await dbConnect();
        return SystemSettings.findOneAndUpdate(
            { type: 'ai-defaults' },
            {
                $set: { settings, updatedBy: adminId }
            },
            { upsert: true, new: true }
        );
    }
}
