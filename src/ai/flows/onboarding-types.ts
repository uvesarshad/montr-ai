import { z } from 'zod';

export const OnboardingWebsiteAnalysisSchema = z.object({
    normalizedUrl: z.string().optional(),
    fetchSucceeded: z.boolean().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    businessName: z.string().optional(),
    businessType: z.string().optional(),
    industry: z.string().optional(),
    summary: z.string().optional(),
    targetAudience: z.string().optional(),
    brandTone: z.string().optional(),
    productsServices: z.array(z.string()).optional(),
    brandColors: z.array(z.string()).optional(),
    brandAssets: z.array(z.string()).optional(),
    keyMessages: z.array(z.string()).optional(),
    openQuestions: z.array(z.string()).optional(),
});

export const OnboardingInputSchema = z.object({
    message: z.string().describe("The user's message."),
    brandId: z.string().describe("The brand ID this onboarding is for."),
    mode: z.enum(['onboarding', 'adjustment']).default('onboarding').describe("Whether this is initial onboarding or a roadmap adjustment."),
    model: z.string().optional().default('gemini-2.5-flash'),

    // Structured data from the multi-step form (populated before the AI chat step)
    structuredData: z.object({
        // Step 1: Business Basics
        businessName: z.string().optional(),
        businessType: z.string().optional(),
        website: z.string().optional(),
        industry: z.string().optional(),
        websiteAnalysis: OnboardingWebsiteAnalysisSchema.optional(),

        // Step 2: Brand profile
        targetAudience: z.string().optional(),
        brandTone: z.string().optional(),
        productsServices: z.array(z.string()).optional(),

        // Step 3: Channels & Goals
        channels: z.array(z.string()).optional(),
        contentVolume: z.string().optional(),

        // Step 4 payload
        goals: z.array(z.string()).optional(),
        budgetRange: z.string().optional(),
        timeline: z.string().optional(),
        challenge: z.string().optional(),
    }).optional(),
});

export const OnboardingOutputSchema = z.object({
    response: z.string().describe("The AI's response."),
    isCompleted: z.boolean().describe("Whether the onboarding/adjustment is completed."),
    plan: z.any().optional().describe("The generated marketing plan (if completed)."),
});

export type OnboardingInput = z.input<typeof OnboardingInputSchema>;
export type OnboardingOutput = z.infer<typeof OnboardingOutputSchema>;

// Structured data type for form steps
export type OnboardingStructuredData = NonNullable<OnboardingInput['structuredData']>;
export type OnboardingWebsiteAnalysis = z.infer<typeof OnboardingWebsiteAnalysisSchema>;
