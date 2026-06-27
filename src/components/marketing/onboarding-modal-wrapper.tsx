'use client';

import { useRouter } from 'next/navigation';
import { OnboardingFlow } from './onboarding/onboarding-flow';
import { IMarketingPlan } from '@/lib/db/models/marketing-plan.model';
import { markOnboardingSeen } from '@/app/actions/marketing-plan';

interface OnboardingModalWrapperProps {
    initialPlan: IMarketingPlan | null | undefined;
    onPlanComplete?: () => void;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    brandId: string;
}

/**
 * Gate + state bridge for the full-screen onboarding flow (was a Dialog
 * popup; now the mockup's distraction-free takeover — see
 * `onboarding/onboarding-flow.tsx`). Keeps the dashboard-page contract.
 */
export function OnboardingModalWrapper({ initialPlan, onPlanComplete, isOpen, onOpenChange, brandId }: OnboardingModalWrapperProps) {
    const router = useRouter();

    const handleComplete = () => {
        if (onPlanComplete) {
            onPlanComplete();
        }
        router.refresh();
        onOpenChange(false);
    };

    const handleSkip = async () => {
        onOpenChange(false);
        try {
            await markOnboardingSeen();
        } catch (e) {
            console.error("Failed to update onboarding state:", e);
        }
    };

    // Don't show while loading (undefined) or if no brand selected
    if (initialPlan === undefined || !brandId) {
        return null;
    }

    if (!isOpen) {
        return null;
    }

    // Determine mode: if plan exists and onboarding was completed, use adjustment mode
    const mode = initialPlan?.onboardingCompleted ? 'adjustment' : 'onboarding';

    // For adjustment mode, don't pass old history — start a fresh conversation
    const history = mode === 'adjustment' ? [] : (initialPlan?.chatHistory || []);

    return (
        <OnboardingFlow
            initialHistory={history}
            onComplete={handleComplete}
            onSkip={handleSkip}
            mode={mode}
            brandId={brandId}
        />
    );
}
