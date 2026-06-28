import { z } from 'zod';
import { CoreTool } from 'ai';

/** Per-tool HITL policy, declared at registration time. */
export type HitlPolicy = 'always' | 'never' | 'over_cost' | 'per_brand_config';

export interface AgentContext {
    userId: string;
    brandId?: string;
    missionId?: string;
    mode?: 'mixed' | 'approval-first' | 'autonomous' | 'watch' | 'autopilot';
    userEmail?: string;
    userName?: string;
    userRole?: 'user' | 'admin' | 'super_admin';
    enabledTools?: string[];        // Tools allowed for this brand
    requireApproval?: string[];     // Tools that need HITL approval (per_brand_config list)
    hitlOverrides?: Record<string, HitlPolicy>; // Per-brand per-tool policy overrides
    approvalTimeoutPolicy?: 'auto-reject' | 'auto-approve' | 'escalate'; // On expiry
    creditBudget?: number;          // Max credits per session
    /** Per-brand outbound voice-call policy (D4 2026-06-05) — from BrandContext.voiceCallPolicy. */
    voiceCallPolicy?: {
        mode: 'always_ask' | 'always_autonomous' | 'conditional';
        conditions?: {
            autonomousPurposes?: string[];
            knownContactsOnly?: boolean;
            businessHoursOnly?: boolean;
        };
    };
}

export type ToolFactory<T extends z.ZodTypeAny = z.ZodTypeAny, R = unknown> = (context: AgentContext) => CoreTool<T, R>;

export interface RegisteredTool<T extends z.ZodTypeAny = z.ZodTypeAny, R = unknown> {
    name: string;
    description: string;
    parameters: T;
    /** Declared HITL policy for this tool. Per-brand hitlOverrides in AgentContext take precedence. */
    hitlPolicy?: HitlPolicy;
    factory: ToolFactory<T, R>;
    /**
     * Optional preview builder invoked when this tool's call is HITL-gated.
     * Lets a tool attach a structured `artifact` to the awaiting-approval result
     * (e.g. a strategy roadmap preview) so the chat can render an approval card.
     * Failures are swallowed by the registry — the gate still works without it.
     */
    buildApprovalArtifact?: (
        args: Record<string, unknown>,
        context: AgentContext,
        pendingActionId: string,
    ) => Promise<unknown> | unknown;
}
