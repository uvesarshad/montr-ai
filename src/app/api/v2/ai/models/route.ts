
import { NextResponse } from 'next/server';
import { getAllBuiltInModels, AI_TASKS, ModelDefinition } from '@/lib/model-groups';
import { getSession } from '@/lib/get-session';

export async function GET() {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const allModels = getAllBuiltInModels();

        // Group models by provider for the frontend
        const groupedModels: Record<string, { provider: string, models: { id: string, name: string }[] }> = {};

        allModels.forEach((model: ModelDefinition) => {
            // Capitalize provider name for display
            // special case for xAI
            let providerName = model.provider.charAt(0).toUpperCase() + model.provider.slice(1);
            if (model.provider === 'xai') providerName = 'xAI';
            if (model.provider === 'openai') providerName = 'OpenAI';

            if (!groupedModels[model.provider]) {
                groupedModels[model.provider] = {
                    provider: providerName,
                    models: []
                };
            }

            // Only include available models (could filter by tier here if we had user context)
            groupedModels[model.provider].models.push({
                id: model.id,
                name: model.name
            });
        });

        // Convert to array
        const models = Object.values(groupedModels);

        return NextResponse.json({
            models,
            tasks: AI_TASKS
        });
    } catch (error) {
        console.error('Error fetching AI models:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
