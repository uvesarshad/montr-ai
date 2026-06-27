// OSS single-tenant override of src/ai/flows/onboarding-agent-flow.ts — CP-2 hand-patch; org-stripped.
'use server';

import { Types } from 'mongoose';
import { revalidatePath } from 'next/cache';

import { generateTextWithClient } from '@/ai/client';
import { getSession } from '@/lib/get-session';
import { dbConnect } from '@/lib/db/connect';
import BrandContext from '@/lib/db/models/brand-context.model';
import KnowledgeBase from '@/lib/db/models/knowledge-base.model';
import { marketingPlanRepository } from '@/lib/db/repository/marketing-plan.repository';
import { userRepository } from '@/lib/db/repository/user.repository';
import { findModelById } from '@/lib/model-groups';

import { parseGeneratedRoadmap } from './onboarding-helpers';
import { OnboardingInput, OnboardingOutput, OnboardingStructuredData } from './onboarding-types';

export type { OnboardingInput, OnboardingOutput };

export async function processOnboardingMessage(input: OnboardingInput): Promise<OnboardingOutput> {
    const session = await getSession();
    if (!session?.user?.id) {
        throw new Error("Unauthorized");
    }

    const userId = session.user.id;
    const { brandId, mode = 'onboarding' } = input;

    if (!brandId) throw new Error("Brand ID is required");

    let plan = await marketingPlanRepository.findByUserAndBrand(userId, brandId);
    if (!plan) {
        plan = await marketingPlanRepository.create({
            userId: new Types.ObjectId(userId),
            brandId: new Types.ObjectId(brandId),
            chatHistory: [],
            goals: [],
            currentLevel: 1,
            currentXp: 0,
            onboardingCompleted: false,
        });
    }

    if (input.structuredData) {
        const sd = input.structuredData;
        if (sd.businessName || sd.websiteAnalysis?.businessName) {
            plan.businessName = sd.businessName || sd.websiteAnalysis?.businessName;
        }
        if (sd.businessType || sd.websiteAnalysis?.businessType) {
            plan.businessType = sd.businessType || sd.websiteAnalysis?.businessType;
        }
        if (sd.targetAudience || sd.websiteAnalysis?.targetAudience) {
            plan.targetAudience = sd.targetAudience || sd.websiteAnalysis?.targetAudience;
        }
        if (sd.goals?.length) {
            plan.goals = sd.goals;
        }

        await upsertBrandContextMemory({
            brandId,
            userId,
            structuredData: sd,
        });
    }

    let modelId = input.model || 'gemini-2.5-flash';

    try {
        const user = await userRepository.findById(userId);
        if (user && user.aiPreferences) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const prefs = user.aiPreferences as any;
            if (prefs instanceof Map) {
                const pref = prefs.get('onboardingAgent');
                if (pref?.modelId) {
                    modelId = pref.modelId;
                }
            } else if (typeof prefs === 'object') {
                const pref = prefs['onboardingAgent'];
                if (pref?.modelId) {
                    modelId = pref.modelId;
                }
            }
        }
    } catch (e) {
        console.warn("Failed to fetch user AI preferences", e);
    }

    const modelDef = findModelById(modelId);
    if (!modelDef) {
        console.warn(`Preferred model '${modelId}' not found, falling back to default.`);
        const defaultModel = findModelById('gemini-2.5-flash');
        if (!defaultModel) throw new Error("Default model configuration missing.");

        const routeHint = {
            sdk: defaultModel.supportsDirectApi ? 'genkit' : 'aisdk',
            provider: defaultModel.provider,
            keySource: 'system'
        } as const;

        return executeAgentFlow(input, plan, 'gemini-2.5-flash', routeHint, mode);
    }

    const routeHint = {
        sdk: modelDef.supportsDirectApi ? 'genkit' : 'aisdk',
        provider: modelDef.provider,
        keySource: 'system'
    } as const;

    return executeAgentFlow(input, plan, modelId, routeHint, mode);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function executeAgentFlow(input: OnboardingInput, plan: any, modelId: string, routeHint: any, mode: string): Promise<OnboardingOutput> {
    plan.chatHistory.push({
        role: 'user',
        content: input.message,
        timestamp: new Date()
    });

    const sd = input.structuredData;
    let systemPrompt: string;

    if (mode === 'adjustment') {
        const currentTasks = plan.tasks?.map((t: { title: string; status: string; description: string }) =>
            `- [${t.status}] ${t.title}: ${t.description}`
        ).join('\n') || 'No tasks yet';

        systemPrompt = `
You are an expert AI Marketing Consultant. The user already has a marketing roadmap and wants to adjust it.

Current Business Info:
- Business Name: ${plan.businessName || 'Unknown'}
- Business Type: ${plan.businessType || 'Unknown'}
- Target Audience: ${plan.targetAudience || 'Unknown'}
- Goals: ${plan.goals?.join(', ') || 'Unknown'}

Current Roadmap Tasks:
${currentTasks}

Instructions:
- Ask what has changed - new goals, strategy pivot, or issues with current tasks.
- Be concise, friendly, and actionable. Keep responses under 3 sentences.
- When you have enough context, output "[PLAN_READY]" at the end.
`;
    } else {
        const analyzedWebsiteInfo = sd?.websiteAnalysis ? [
            sd.websiteAnalysis.summary ? `Website Summary: ${sd.websiteAnalysis.summary}` : '',
            (sd.brandTone || sd.websiteAnalysis.brandTone) ? `Brand Tone: ${sd.brandTone || sd.websiteAnalysis.brandTone}` : '',
            (sd.productsServices?.length || sd.websiteAnalysis.productsServices?.length) ? `Products / Services: ${(sd.productsServices?.length ? sd.productsServices : sd.websiteAnalysis.productsServices)?.join(', ')}` : '',
            sd.websiteAnalysis.brandColors?.length ? `Brand Colors: ${sd.websiteAnalysis.brandColors.join(', ')}` : '',
            sd.websiteAnalysis.brandAssets?.length ? `Brand Assets: ${sd.websiteAnalysis.brandAssets.join(', ')}` : '',
            sd.websiteAnalysis.keyMessages?.length ? `Key Messages: ${sd.websiteAnalysis.keyMessages.join(', ')}` : '',
            sd.websiteAnalysis.openQuestions?.length ? `Open Questions From Website Review: ${sd.websiteAnalysis.openQuestions.join(', ')}` : '',
        ].filter(Boolean).join('\n') : '';

        const structuredInfo = sd ? [
            (sd.businessName || sd.websiteAnalysis?.businessName) ? `Business Name: ${sd.businessName || sd.websiteAnalysis?.businessName}` : '',
            (sd.businessType || sd.websiteAnalysis?.businessType) ? `Business Type: ${sd.businessType || sd.websiteAnalysis?.businessType}` : '',
            sd.website ? `Website: ${sd.website}` : '',
            (sd.industry || sd.websiteAnalysis?.industry) ? `Industry: ${sd.industry || sd.websiteAnalysis?.industry}` : '',
            (sd.targetAudience || sd.websiteAnalysis?.targetAudience) ? `Target Audience: ${sd.targetAudience || sd.websiteAnalysis?.targetAudience}` : '',
            sd.channels?.length ? `Active Channels: ${sd.channels.join(', ')}` : '',
            sd.contentVolume ? `Content Volume: ${sd.contentVolume}` : '',
            sd.goals?.length ? `Marketing Goals: ${sd.goals.join(', ')}` : '',
            sd.budgetRange ? `Monthly Budget: ${sd.budgetRange}` : '',
            sd.timeline ? `Timeline: ${sd.timeline}` : '',
            sd.challenge ? `Biggest Challenge: ${sd.challenge}` : '',
            analyzedWebsiteInfo,
        ].filter(Boolean).join('\n') : 'No structured data provided';

        systemPrompt = `
You are an expert AI Marketing Consultant creating a personalized marketing roadmap.

The user has already filled out a detailed form with their business information:
${structuredInfo}

Instructions:
- You already have comprehensive data. DO NOT re-ask questions they've already answered.
- The website analysis happened first, so prefer using it instead of generic discovery questions.
- Review their info and either:
  a) Ask ONE specific, insightful follow-up question to sharpen the plan. Prefer missing website details, unclear positioning, or channel prioritization.
  b) If you have enough to create a great plan, say something encouraging and output "[PLAN_READY]" at the end.
- Keep your response concise - 2-3 sentences max.
- Be enthusiastic and specific, not generic.
`;
    }

    const response = await generateTextWithClient({
        model: modelId,
        system: systemPrompt,
        messages: plan.chatHistory.map((m: { role: string; content: string }) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        routeHint: routeHint,
    });

    const isPlanReady = response.includes('[PLAN_READY]');
    let finalResponse = response.replace('[PLAN_READY]', '').trim();

    plan.chatHistory.push({
        role: 'assistant',
        content: finalResponse,
        timestamp: new Date()
    });

    let generatedPlan = null;
    if (isPlanReady) {
        const adjustmentContext = mode === 'adjustment'
            ? `\nIMPORTANT: This is an UPDATE to an existing plan. Keep completed tasks intact unless the user explicitly asked to remove them. Adjust or add new tasks based on the user's feedback.`
            : '';

        const channelsContext = sd?.channels?.length
            ? `Active Channels: ${sd.channels.join(', ')}`
            : 'Active Channels: Not specified';
        const budgetContext = sd?.budgetRange
            ? `Monthly Budget: ${sd.budgetRange}`
            : 'Monthly Budget: Not specified';
        const timelineContext = sd?.timeline
            ? `Timeline Pressure: ${sd.timeline}`
            : 'Timeline: Flexible';
        const challengeContext = sd?.challenge
            ? `Biggest Challenge: ${sd.challenge}`
            : '';
        const volumeContext = sd?.contentVolume
            ? `Current Content Volume: ${sd.contentVolume}`
            : '';
        const websiteSummaryContext = sd?.websiteAnalysis?.summary
            ? `Website Summary: ${sd.websiteAnalysis.summary}`
            : '';
        const toneContext = (sd?.brandTone || sd?.websiteAnalysis?.brandTone)
            ? `Brand Tone: ${sd.brandTone || sd.websiteAnalysis?.brandTone}`
            : '';
        const productsServicesContext = (sd?.productsServices?.length || sd?.websiteAnalysis?.productsServices?.length)
            ? `Products / Services: ${(sd?.productsServices?.length ? sd.productsServices : sd?.websiteAnalysis?.productsServices)?.join(', ')}`
            : '';
        const colorsContext = sd?.websiteAnalysis?.brandColors?.length
            ? `Brand Colors: ${sd.websiteAnalysis.brandColors.join(', ')}`
            : '';
        const assetsContext = sd?.websiteAnalysis?.brandAssets?.length
            ? `Brand Assets: ${sd.websiteAnalysis.brandAssets.join(', ')}`
            : '';

        const planPrompt = `
Based on the following information, generate a 4-week marketing roadmap with specific tasks.${adjustmentContext}

Business Name: ${plan.businessName || sd?.websiteAnalysis?.businessName || 'User Business'}
Business Type: ${plan.businessType || sd?.websiteAnalysis?.businessType || 'General'}
Industry: ${sd?.industry || sd?.websiteAnalysis?.industry || 'General'}
Website: ${sd?.website || 'None provided'}
Target Audience: ${plan.targetAudience || sd?.websiteAnalysis?.targetAudience || 'General'}
Goals: ${plan.goals?.join(', ') || 'Growth'}
${channelsContext}
${budgetContext}
${timelineContext}
${volumeContext}
${challengeContext}
${websiteSummaryContext}
${toneContext}
${productsServicesContext}
${colorsContext}
${assetsContext}

Chat Context: ${plan.chatHistory.map((m: { role: string; content: string }) => `${m.role}: ${m.content}`).join('\n')}

IMPORTANT RULES:
- Create 8-12 specific, actionable tasks spread across 4 weeks
- Tasks should be tailored to the user's channels, budget, timeline, and website positioning
- Include a mix of task types: "content", "strategy", "research", "outreach", "campaign", "automation"
- Set difficulty appropriately: quick wins for week 1, harder tasks later
- XP rewards: easy=10, medium=20, hard=50
- If budget is "bootstrap", focus on organic/free strategies
- If timeline is "asap", front-load impactful tasks in week 1

Return valid JSON with the following structure:
{
  "businessName": "Name",
  "businessType": "Type",
  "targetAudience": "Audience",
  "goals": ["Goal 1", "Goal 2"],
  "tasks": [
    {
      "title": "Task Title",
      "description": "Task Description",
      "type": "content" | "strategy" | "research" | "outreach" | "campaign" | "automation",
      "difficulty": "easy" | "medium" | "hard",
      "xpReward": number
    }
  ]
}
`;

        const planResponse = await generateTextWithClient({
            model: modelId,
            system: "You are a JSON generator. Return ONLY valid JSON, no markdown fences.",
            messages: [{ role: 'user', content: planPrompt }],
            routeHint: routeHint,
        });

        const planData = parseGeneratedRoadmap(planResponse);

        if (planData) {
            plan.onboardingCompleted = true;
            plan.businessName = planData.businessName;
            plan.businessType = planData.businessType;
            plan.targetAudience = planData.targetAudience;
            plan.goals = planData.goals;

            plan.tasks = planData.tasks.map((t, index) => ({
                ...t,
                id: `task-${Date.now()}-${index}`,
                status: 'pending',
                dueDate: new Date(Date.now() + (index * 86400000))
            }));

            generatedPlan = planData;
        } else {
            plan.onboardingCompleted = false;
            finalResponse = "I collected your details, but I couldn't turn them into a roadmap yet. Reply once more and I'll retry with the same context.";
        }
    }

    await plan.save();
    revalidatePath('/dashboard');

    return {
        response: finalResponse,
        isCompleted: Boolean(generatedPlan),
        plan: generatedPlan
    };
}

async function upsertBrandContextMemory(args: {
    brandId: string;
    userId: string;
    structuredData: OnboardingStructuredData;
}) {
    const { brandId, userId, structuredData } = args;
    const analysis = structuredData.websiteAnalysis;

    if (!analysis && !structuredData.brandTone && !structuredData.targetAudience && !structuredData.industry) {
        return;
    }

    await dbConnect();

    const brandVoiceParts = [
        analysis?.summary,
        structuredData.brandTone || analysis?.brandTone,
        structuredData.productsServices?.length
            ? `Products / services: ${structuredData.productsServices.join(', ')}`
            : analysis?.productsServices?.length
                ? `Products / services: ${analysis.productsServices.join(', ')}`
                : '',
    ].filter(Boolean);

    await BrandContext.findOneAndUpdate(
        { brandId },
        {
            $set: {
                tone: structuredData.brandTone || analysis?.brandTone || 'Professional',
                brandVoice: brandVoiceParts.join('\n'),
                targetAudience: structuredData.targetAudience || analysis?.targetAudience || '',
                industry: structuredData.industry || analysis?.industry || '',
                keyMessages: analysis?.keyMessages || [],
            },
            $setOnInsert: {
                agentName: 'MontrAI Agent',
            },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    if (!structuredData.website || !analysis) {
        return;
    }

    const productsServices = structuredData.productsServices?.length
        ? structuredData.productsServices
        : analysis.productsServices || [];

    const memoryContent = [
        `Website: ${analysis.normalizedUrl || structuredData.website}`,
        analysis.summary ? `Summary: ${analysis.summary}` : '',
        (structuredData.brandTone || analysis.brandTone) ? `Tone: ${structuredData.brandTone || analysis.brandTone}` : '',
        (structuredData.targetAudience || analysis.targetAudience) ? `Audience: ${structuredData.targetAudience || analysis.targetAudience}` : '',
        productsServices.length ? `Products / Services: ${productsServices.join(', ')}` : '',
        analysis.brandColors?.length ? `Colors: ${analysis.brandColors.join(', ')}` : '',
        analysis.brandAssets?.length ? `Assets: ${analysis.brandAssets.join(', ')}` : '',
        analysis.keyMessages?.length ? `Key Messages: ${analysis.keyMessages.join(', ')}` : '',
    ].filter(Boolean).join('\n');

    await KnowledgeBase.findOneAndUpdate(
        {
            brandId,
            type: 'url',
            'metadata.url': analysis.normalizedUrl || structuredData.website,
        },
        {
            $set: {
                name: `${structuredData.businessName || analysis.businessName || 'Brand'} Website Brief`,
                content: memoryContent,
                type: 'url',
                sourceModule: 'copilot',
                isActive: true,
                metadata: {
                    title: analysis.title || structuredData.businessName || analysis.businessName || 'Website Brief',
                    url: analysis.normalizedUrl || structuredData.website,
                    tags: ['onboarding', 'website', 'brand-profile'],
                },
            },
            $setOnInsert: {
                createdById: new Types.ObjectId(userId),
            },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
}
