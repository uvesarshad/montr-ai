/**
 * Seed Script for Plans with AI Model Access
 * 
 * Run with: npx ts-node scripts/seed-plans.ts
 * Or add to package.json: "seed:plans": "ts-node scripts/seed-plans.ts"
 */

import { dbConnect } from '../src/lib/db/connect';
import Plan from '../src/lib/db/models/plan.model';

const plans = [
    {
        name: 'free',
        displayName: 'Free',
        description: 'Get started with basic AI features',
        price: 0,
        billingInterval: 'monthly',
        status: 'active',
        features: {
            // Core features
            aiGeneration: true,
            customBranding: false,
            analytics: false,
            prioritySupport: false,
            apiAccess: false,
            teamCollaboration: false,

            // Limits
            maxDocuments: 10,
            maxCanvases: 5,
            maxBrands: 1,
            maxSocialAccountsPerBrand: 3,

            // Social media
            allowedPlatforms: ['x', 'linkedin'],

            // Social media operational caps (audit C9) — free tier: tight caps, no approvals/bulk.
            allowApprovalWorkflow: false,
            maxScheduledPostsPerMonth: 30,
            maxPostsPerDay: 5,
            maxDraftsPerBrand: 20,
            maxPostTemplates: 10,
            maxMediaStorageMb: 250,
            allowBulkPublishing: false,
            allowSocialAI: true,
            maxSocialAIGenerationsPerMonth: 50,

            // Workflow Queue Fairness (audit C1) — free tier: small, low-priority lane.
            maxConcurrentExecutions: 2,
            maxQueuedExecutions: 200,
            executionPriority: 10,

            // Execution History Retention (audit H4) — free tier: shortest windows.
            executionRetentionDays: 30,
            failedExecutionRetentionDays: 90,
            maxStoredExecutions: 5000,

            // AI Model Access
            allowedModelTiers: ['free'],
            allowedModelTypes: ['text', 'image'],

            // BYOK
            allowByok: false,
            byokProviders: [],

            // Credits (100 credits/month for free tier)
            monthlyCredits: 100,

            // Custom Models
            allowCustomOpenRouterModels: false,
        },
    },
    {
        name: 'pro',
        displayName: 'Pro',
        description: 'For creators and small teams',
        price: 29,
        billingInterval: 'monthly',
        status: 'active',
        features: {
            // Core features
            aiGeneration: true,
            customBranding: true,
            analytics: true,
            prioritySupport: false,
            apiAccess: true,
            teamCollaboration: false,

            // Limits
            maxDocuments: 100,
            maxCanvases: 50,
            maxBrands: 5,
            maxSocialAccountsPerBrand: 10,

            // Social media
            allowedPlatforms: ['x', 'linkedin', 'instagram', 'facebook', 'pinterest', 'tiktok'],

            // Social media operational caps (audit C9) — pro tier: roomy caps + approvals + bulk.
            allowApprovalWorkflow: true,
            maxScheduledPostsPerMonth: 500,
            maxPostsPerDay: 25,
            maxDraftsPerBrand: 200,
            maxPostTemplates: 100,
            maxMediaStorageMb: 5120,
            allowBulkPublishing: true,
            allowSocialAI: true,
            maxSocialAIGenerationsPerMonth: 1000,

            // Workflow Queue Fairness (audit C1) — pro tier: mid lane.
            maxConcurrentExecutions: 5,
            maxQueuedExecutions: 1000,
            executionPriority: 5,

            // Execution History Retention (audit H4) — pro tier: mid windows.
            executionRetentionDays: 60,
            failedExecutionRetentionDays: 180,
            maxStoredExecutions: 50000,

            // AI Model Access
            allowedModelTiers: ['free', 'pro'],
            allowedModelTypes: ['text', 'image'],

            // BYOK
            allowByok: true,
            byokProviders: ['openai', 'anthropic', 'google', 'deepseek', 'openrouter'],

            // Credits (1000 credits/month for pro tier)
            monthlyCredits: 1000,

            // Custom Models
            allowCustomOpenRouterModels: false,
        },
    },
    {
        name: 'enterprise',
        displayName: 'Enterprise',
        description: 'For businesses and agencies',
        price: 99,
        billingInterval: 'monthly',
        status: 'active',
        features: {
            // Core features
            aiGeneration: true,
            customBranding: true,
            analytics: true,
            prioritySupport: true,
            apiAccess: true,
            teamCollaboration: true,

            // Limits
            maxDocuments: -1, // Unlimited
            maxCanvases: -1,
            maxBrands: -1,
            maxSocialAccountsPerBrand: -1,

            // Social media
            allowedPlatforms: ['x', 'linkedin', 'instagram', 'facebook', 'pinterest', 'tiktok', 'reddit', 'telegram', 'wordpress', 'dribbble'],

            // Social media operational caps (audit C9) — enterprise: unlimited.
            allowApprovalWorkflow: true,
            maxScheduledPostsPerMonth: -1,
            maxPostsPerDay: -1,
            maxDraftsPerBrand: -1,
            maxPostTemplates: -1,
            maxMediaStorageMb: -1,
            allowBulkPublishing: true,
            allowSocialAI: true,
            maxSocialAIGenerationsPerMonth: -1,

            // Workflow Queue Fairness (audit C1) — enterprise: large, top lane.
            maxConcurrentExecutions: 10,
            maxQueuedExecutions: 5000,
            executionPriority: 3,

            // Execution History Retention (audit H4) — enterprise: longest windows.
            executionRetentionDays: 90,
            failedExecutionRetentionDays: 365,
            maxStoredExecutions: -1,

            // AI Model Access
            allowedModelTiers: ['free', 'pro', 'enterprise'],
            allowedModelTypes: ['text', 'image', 'video'],

            // BYOK
            allowByok: true,
            byokProviders: ['openai', 'anthropic', 'google', 'xai', 'deepseek', 'mistral', 'cohere', 'groq', 'perplexity', 'openrouter'],

            // Credits (5000 credits/month for enterprise tier)
            monthlyCredits: 5000,

            // Custom Models
            allowCustomOpenRouterModels: true,
        },
    },
    {
        name: 'enterprise-yearly',
        displayName: 'Enterprise Yearly',
        description: 'Enterprise plan with yearly billing (2 months free)',
        price: 990,
        billingInterval: 'yearly',
        status: 'active',
        features: {
            // Same as enterprise, but with yearly credits
            aiGeneration: true,
            customBranding: true,
            analytics: true,
            prioritySupport: true,
            apiAccess: true,
            teamCollaboration: true,

            maxDocuments: -1,
            maxCanvases: -1,
            maxBrands: -1,
            maxSocialAccountsPerBrand: -1,

            allowedPlatforms: ['x', 'linkedin', 'instagram', 'facebook', 'pinterest', 'tiktok', 'reddit', 'telegram', 'wordpress', 'dribbble'],

            // Social media operational caps (audit C9) — same as enterprise.
            allowApprovalWorkflow: true,
            maxScheduledPostsPerMonth: -1,
            maxPostsPerDay: -1,
            maxDraftsPerBrand: -1,
            maxPostTemplates: -1,
            maxMediaStorageMb: -1,
            allowBulkPublishing: true,
            allowSocialAI: true,
            maxSocialAIGenerationsPerMonth: -1,

            // Workflow Queue Fairness (audit C1) — same as enterprise.
            maxConcurrentExecutions: 10,
            maxQueuedExecutions: 5000,
            executionPriority: 3,

            // Execution History Retention (audit H4) — same as enterprise.
            executionRetentionDays: 90,
            failedExecutionRetentionDays: 365,
            maxStoredExecutions: -1,

            allowedModelTiers: ['free', 'pro', 'enterprise'],
            allowedModelTypes: ['text', 'image', 'video'],

            allowByok: true,
            byokProviders: ['openai', 'anthropic', 'google', 'xai', 'deepseek', 'mistral', 'cohere', 'groq', 'perplexity', 'openrouter'],

            // Credits (60000 credits/year = 5000/month * 12)
            monthlyCredits: 60000,

            allowCustomOpenRouterModels: true,
        },
    },
];

async function seedPlans() {
    try {
        await dbConnect();
        console.log('Connected to database');

        for (const planData of plans) {
            const existing = await Plan.findOne({ name: planData.name });

            if (existing) {
                console.log(`Updating plan: ${planData.name}`);
                await Plan.updateOne({ name: planData.name }, { $set: planData });
            } else {
                console.log(`Creating plan: ${planData.name}`);
                await Plan.create(planData);
            }
        }

        console.log('✅ Plans seeded successfully!');
        console.log(`Total plans: ${plans.length}`);

        // Display summary
        console.log('\nPlan Summary:');
        console.log('─'.repeat(60));
        for (const plan of plans) {
            console.log(`${plan.displayName.padEnd(20)} | ${String(plan.features.monthlyCredits).padStart(6)} credits | ${plan.features.allowedModelTiers.join(', ')}`);
        }

        process.exit(0);
    } catch (error) {
        console.error('Failed to seed plans:', error);
        process.exit(1);
    }
}

seedPlans();
