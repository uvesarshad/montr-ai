'use server';

import { getSession } from '@/lib/get-session';
import { marketingPlanRepository } from '@/lib/db/repository/marketing-plan.repository';
import { revalidatePath } from 'next/cache';

export async function getMarketingPlan(brandId: string) {
    const session = await getSession();
    if (!session?.user?.id) {
        throw new Error("Unauthorized");
    }

    const userRepository = (await import('@/lib/db/repository/user.repository')).userRepository;
    const user = await userRepository.findById(session.user.id);
    const hasSeenOnboarding = user?.hasSeenOnboarding || false;

    if (!brandId) return { plan: null, hasSeenOnboarding };

    const plan = await marketingPlanRepository.findByUserAndBrand(session.user.id, brandId);
    // Convert _id to string for client component
    if (plan) {
        return { plan: JSON.parse(JSON.stringify(plan)), hasSeenOnboarding };
    }
    return { plan: null, hasSeenOnboarding };
}

export async function markOnboardingSeen() {
    const session = await getSession();
    if (!session?.user?.id) {
        throw new Error("Unauthorized");
    }

    const { userRepository } = await import('@/lib/db/repository/user.repository');
    await userRepository.update(session.user.id, { hasSeenOnboarding: true });

    return { success: true };
}

export async function updateTaskStatus(taskId: string, status: 'pending' | 'in_progress' | 'completed', brandId: string) {
    const session = await getSession();
    if (!session?.user?.id) {
        throw new Error("Unauthorized");
    }

    const plan = await marketingPlanRepository.findByUserAndBrand(session.user.id, brandId);
    if (!plan) throw new Error("Plan not found");

    const taskIndex = plan.tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) throw new Error("Task not found");

    plan.tasks[taskIndex].status = status;

    // Gamification: Add XP if completed
    if (status === 'completed') {
        plan.currentXp += plan.tasks[taskIndex].xpReward || 10;
        // Simple level up logic
        if (plan.currentXp >= plan.currentLevel * 100) {
            plan.currentLevel += 1;
            plan.currentXp = plan.currentXp - (plan.currentLevel * 100);
        }
    }

    await marketingPlanRepository.update(plan._id.toString(), {
        tasks: plan.tasks,
        currentLevel: plan.currentLevel,
        currentXp: plan.currentXp
    });

    revalidatePath('/dashboard');
    return JSON.parse(JSON.stringify(plan));
}
