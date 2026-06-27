// Defines the core data structures for User and Plan based on the backend.json schema.

import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  username: z.string().optional(),
  profileName: z.string().optional(),
  role: z.enum(['super_admin', 'admin', 'user']),
  planId: z.string().optional(),
  razorpaySubscriptionId: z.string().optional(),
  subscriptionStatus: z.enum(['active', 'past_due', 'cancelled', 'halted', 'completed', 'trial']).optional(),
  currentPeriodEnd: z.string().optional(),
  cancelAtPeriodEnd: z.boolean().optional(),
  trialEndsAt: z.string().nullable().optional(),
  canUseOwnApiKeys: z.boolean().default(false),
  userApiKeys: z.record(z.string()).optional(),
  customLimits: z.object({}).optional(),
  createdBy: z.string().optional(),
  managedBy: z.string().optional(),
  status: z.enum(['active', 'suspended', 'deleted']),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type UserProfile = z.infer<typeof UserSchema>;

export const OrganizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  adminId: z.string(), // User ID of the organization admin
  subscriptionPlanId: z.string(),
  memberLimit: z.number(), // Based on subscription plan (5, 10, 50, etc.)
  allowedEmailDomains: z.array(z.string()).default([]), // e.g., ['@company.com']
  members: z.array(z.string()).default([]), // Array of user IDs
  createdAt: z.string(),
  updatedAt: z.string(),
  status: z.enum(['active', 'suspended', 'cancelled']),
});

export type Organization = z.infer<typeof OrganizationSchema>;

/**
 * Plan Features Schema
 * Defines all configurable features for a subscription plan.
 */
export const PlanFeaturesSchema = z.object({
  // Core features
  aiGeneration: z.boolean().default(false),
  customBranding: z.boolean().default(false),
  analytics: z.boolean().default(false),
  prioritySupport: z.boolean().default(false),
  apiAccess: z.boolean().default(false),
  teamCollaboration: z.boolean().default(false),

  // Limits
  maxDocuments: z.number().default(10),
  maxCanvases: z.number().default(5),
  maxBrands: z.number().default(1),
  maxSocialAccountsPerBrand: z.number().default(3),

  // Social media
  allowedPlatforms: z.array(z.string()).default(['x', 'linkedin']),

  // AI Model Access Control
  allowedModelTiers: z.array(z.enum(['free', 'pro', 'enterprise'])).default(['free']),
  allowedModelTypes: z.array(z.enum(['text', 'image', 'video'])).default(['text', 'image']),

  // AI Provider Access Control — list of provider ids the plan unlocks with
  // system keys (BYOK still bypasses). E.g. free='openrouter' only; pro adds
  // google/openai/anthropic; enterprise unlocks all.
  allowedAIProviders: z.array(z.string()).default(['openrouter']),

  // BYOK (Bring Your Own Key)
  allowByok: z.boolean().default(false),
  byokProviders: z.array(z.string()).default([]),

  // Credits
  monthlyCredits: z.number().default(100),

  // Custom Models
  allowCustomOpenRouterModels: z.boolean().default(false),
}).passthrough(); // Allow additional unknown fields

export type PlanFeatures = z.infer<typeof PlanFeaturesSchema>;

export const PlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string(),
  description: z.string(),
  price: z.number(),
  currency: z.string().default('USD'),
  billingInterval: z.enum(['monthly', 'yearly', 'lifetime']),
  status: z.enum(['active', 'archived']),
  features: PlanFeaturesSchema,
  limits: z.record(z.number()).optional(),
  allowedModels: z.record(z.array(z.string())).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type Plan = z.infer<typeof PlanSchema>;
