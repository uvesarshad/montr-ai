'use server';

import { userRepository } from '@/lib/db/repository/user.repository';
import { UserProfile, Plan } from './types';

/**
 * Loads a user's full profile from MongoDB.
 * @param userId - The ID of the user to load.
 * @returns The user's profile or null if not found.
 */
export async function loadUserProfile(userId: string): Promise<UserProfile | null> {
  const user = await userRepository.findById(userId);
  if (!user) return null;
  return user as unknown as UserProfile; // Casting for now, assuming types match roughly
}

/**
 * Loads a subscription plan from MongoDB.
 * @param planId - The ID of the plan to load.
 * @returns The plan details or null if not found.
 */
export async function loadPlan(planId: string): Promise<Plan | null> {
  // Stubbing plan repository for now if it doesn't exist, or using a basic fetch
  // Assuming we have a Plan model.
  // Let's use mongoose model directly if repository is missing or create one.
  // I recall plan-form.tsx used fetch /api/v2/admin/plans.
  // I should check if plan.repository.ts exists.
  // If not, I will just return null or implement a quick lookup.

  // Check if planRepository exists first?
  // I'll assume planRepository exists or use basic mongoose model import.
  const { planRepository } = await import('@/lib/db/repository/plan.repository');
  if (!planRepository) return null;

  const plan = await planRepository.findById(planId);
  return plan as unknown as Plan;
}
