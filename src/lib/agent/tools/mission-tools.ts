/**
 * Mission Control Tools
 *
 * Three tools that give the agent structured control over its own mission lifecycle:
 * - createPlan(goal, steps[])   — decompose a goal, emit plan_step events
 * - completeMission(summary)   — mark mission completed, emit status_change event
 * - reportBlocked(reason)      — mark mission blocked, surface blocker to user
 */

import { z } from 'zod';
import { tool } from 'ai';
import mongoose from 'mongoose';
import { AgentContext } from './types';
import { toolRegistry } from '../tool-registry';
import { agentMissionRepository } from '@/lib/db/repository/agent-mission.repository';
import AgentMissionEvent from '@/lib/db/models/agent-mission-event.model';
import AgentMissionLink from '@/lib/db/models/agent-mission-link.model';
import AgentMission from '@/lib/db/models/agent-mission.model';

// ── 1. createPlan ─────────────────────────────────────────────

const createPlanTool = {
    name: 'createPlan',
    description:
        'Decompose the current mission into a structured plan with discrete steps. Call this at the start of a complex mission before executing any actions. Each step becomes a tracked entry in the mission plan AND a visible plan_step event in the timeline. Step IDs returned by this tool are used by setPlanStep to mark progress.',
    parameters: z.object({
        goal: z.string().describe('One-sentence statement of what the mission is trying to achieve.'),
        steps: z
            .array(
                z.object({
                    title: z.string().describe('Short label for the step (e.g. "Identify top leads").'),
                    description: z.string().optional().describe('What will be done in this step.'),
                })
            )
            .min(1)
            .max(20)
            .describe('Ordered list of steps to accomplish the goal.'),
    }),
    factory: (context: AgentContext) =>
        tool({
            description: 'Decompose the mission into a structured plan with discrete steps.',
            parameters: z.object({
                goal: z.string(),
                steps: z.array(
                    z.object({
                        title: z.string(),
                        description: z.string().optional(),
                    })
                ).min(1).max(20),
            }),
            execute: async (args) => {
                if (!context.missionId) {
                    return { success: false, message: 'No active mission to plan against.' };
                }

                const now = new Date();
                const planSteps = args.steps.map((step, index) => ({
                    id: `step-${index + 1}-${new mongoose.Types.ObjectId().toString().slice(-6)}`,
                    title: step.title,
                    description: step.description || null,
                    status: 'pending' as const,
                    startedAt: null,
                    completedAt: null,
                    evidence: null,
                }));

                // Persist the typed plan + summary
                await AgentMission.updateOne(
                    { _id: context.missionId },
                    {
                        $set: {
                            summary: args.goal,
                            plan: {
                                goal: args.goal,
                                steps: planSteps,
                                createdAt: now,
                                updatedAt: now,
                            },
                        },
                    },
                ).exec().catch((error) => {
                    console.error('[createPlan] Failed to persist typed plan:', error);
                });

                // Also emit plan_step events for the timeline view (back-compat).
                await Promise.allSettled(
                    args.steps.map((step, index) =>
                        agentMissionRepository.appendEvent({
                            missionId: context.missionId!,
                            brandId: context.brandId || context.userId,
                            userId: context.userId,
                            type: 'plan_step',
                            role: 'system',
                            content: step.title,
                            metadata: {
                                stepIndex: index + 1,
                                stepTotal: args.steps.length,
                                stepId: planSteps[index].id,
                                description: step.description,
                                status: 'pending',
                            },
                        })
                    )
                );

                return {
                    success: true,
                    message: `Plan created with ${args.steps.length} steps.`,
                    stepCount: args.steps.length,
                    steps: planSteps.map((s) => ({ id: s.id, title: s.title, status: s.status })),
                };
            },
        }),
};

// ── 1b. setPlanStep ───────────────────────────────────────────

const setPlanStepTool = {
    name: 'setPlanStep',
    description:
        'Update the status of a single step in the current mission plan. Use this as you progress: mark a step in_progress when you start it, done when finished, blocked if stuck on it specifically (use reportBlocked for the whole mission). Cite the step ID returned by createPlan.',
    parameters: z.object({
        stepId: z.string().describe('The step.id returned by createPlan.'),
        status: z.enum(['pending', 'in_progress', 'done', 'skipped', 'blocked']),
        evidence: z.string().optional().describe('Short note on what was done or why the status changed.'),
    }),
    factory: (context: AgentContext) =>
        tool({
            description: 'Update one plan step status.',
            parameters: z.object({
                stepId: z.string(),
                status: z.enum(['pending', 'in_progress', 'done', 'skipped', 'blocked']),
                evidence: z.string().optional(),
            }),
            execute: async (args) => {
                if (!context.missionId) {
                    return { success: false, message: 'No active mission.' };
                }
                const now = new Date();
                const updateFields: Record<string, unknown> = {
                    'plan.steps.$.status': args.status,
                    'plan.updatedAt': now,
                };
                if (args.evidence) updateFields['plan.steps.$.evidence'] = args.evidence;
                if (args.status === 'in_progress') updateFields['plan.steps.$.startedAt'] = now;
                if (args.status === 'done' || args.status === 'skipped') updateFields['plan.steps.$.completedAt'] = now;

                const result = await AgentMission.updateOne(
                    { _id: context.missionId, 'plan.steps.id': args.stepId },
                    { $set: updateFields },
                ).exec().catch(() => null);

                if (!result || result.matchedCount === 0) {
                    return {
                        success: false,
                        status: 'step_not_found',
                        message: `No plan step with id "${args.stepId}" exists on this mission. Call createPlan first or check the IDs.`,
                    };
                }

                return {
                    success: true,
                    stepId: args.stepId,
                    newStatus: args.status,
                };
            },
        }),
};

// ── 2. completeMission ────────────────────────────────────────

const completeMissionSchema = z.object({
    summary: z.string().describe('Brief description of what was accomplished in this mission (1-3 sentences).'),
    verification: z
        .object({
            goalRestated: z
                .string()
                .min(1)
                .describe('The original mission goal as you understand it. One sentence.'),
            stepsCompleted: z
                .array(z.string().min(1))
                .min(1)
                .describe('Concrete steps you actually completed during this mission. At least one.'),
            evidence: z
                .object({
                    eventIds: z
                        .array(z.string())
                        .optional()
                        .describe('Mission timeline event IDs that prove the work was done (e.g. tool_result events). Required in autonomous mode.'),
                    linkIds: z
                        .array(z.string())
                        .optional()
                        .describe('Mission link IDs that prove artifacts were created (e.g. CRM records, drafts).'),
                })
                .optional(),
        })
        .optional()
        .describe('Verification block. Required when the mission mode is autonomous; recommended otherwise.'),
});

const completeMissionTool = {
    name: 'completeMission',
    description:
        'Mark the current mission as completed. Only call when all goals have been achieved. In autonomous mode you MUST cite evidence — at least one eventId or linkId from the timeline that proves the work was done. The system will reject completions that cite IDs not present on this mission.',
    parameters: completeMissionSchema,
    factory: (context: AgentContext) =>
        tool({
            description: 'Mark the current mission as completed with a summary, restated goal, and cited evidence.',
            parameters: completeMissionSchema,
            execute: async (args) => {
                if (!context.missionId) {
                    return { status: 'error', success: false, message: 'No active mission to complete.' };
                }

                // Re-fetch the mission to read the live mode (the user may have changed it).
                const mission = await AgentMission.findById(context.missionId).lean();
                const liveMode = mission?.mode || context.mode || 'mixed';

                const verification = args.verification;
                const eventIds = verification?.evidence?.eventIds || [];
                const linkIds = verification?.evidence?.linkIds || [];

                // In autonomous mode, completion is gated on cited evidence.
                if (liveMode === 'autonomous') {
                    if (!verification) {
                        return {
                            status: 'verification_failed',
                            success: false,
                            reason: 'verification_missing',
                            message: 'Autonomous missions require a verification block (goalRestated, stepsCompleted, evidence). Provide it and call completeMission again.',
                        };
                    }
                    if (eventIds.length + linkIds.length === 0) {
                        return {
                            status: 'verification_failed',
                            success: false,
                            reason: 'evidence_missing',
                            message: 'Autonomous missions require at least one eventId or linkId in evidence. Cite a tool_result event or a created mission link.',
                        };
                    }
                }

                // Validate cited IDs against this mission. Anything not belonging to it is "missing".
                const missingEventIds: string[] = [];
                const missingLinkIds: string[] = [];

                if (eventIds.length > 0) {
                    const validEventObjectIds = eventIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
                    const foundEvents = validEventObjectIds.length > 0
                        ? await AgentMissionEvent.find({
                            _id: { $in: validEventObjectIds },
                            missionId: context.missionId,
                            userId: context.userId,
                        }).select('_id').lean()
                        : [];
                    const foundIdSet = new Set(foundEvents.map((e) => String(e._id)));
                    for (const id of eventIds) {
                        if (!foundIdSet.has(id)) missingEventIds.push(id);
                    }
                }

                if (linkIds.length > 0) {
                    const validLinkObjectIds = linkIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
                    const foundLinks = validLinkObjectIds.length > 0
                        ? await AgentMissionLink.find({
                            _id: { $in: validLinkObjectIds },
                            missionId: context.missionId,
                            userId: context.userId,
                        }).select('_id').lean()
                        : [];
                    const foundIdSet = new Set(foundLinks.map((l) => String(l._id)));
                    for (const id of linkIds) {
                        if (!foundIdSet.has(id)) missingLinkIds.push(id);
                    }
                }

                if (missingEventIds.length > 0 || missingLinkIds.length > 0) {
                    return {
                        status: 'verification_failed',
                        success: false,
                        reason: 'evidence_unverifiable',
                        message: 'One or more cited evidence IDs do not belong to this mission. Re-cite real IDs from the mission timeline or links.',
                        missing: {
                            eventIds: missingEventIds,
                            linkIds: missingLinkIds,
                        },
                    };
                }

                await agentMissionRepository.update(context.missionId, context.userId, {
                    status: 'completed',
                    summary: args.summary,
                    lastActivityAt: new Date(),
                }).catch(() => null);

                await agentMissionRepository.appendEvent({
                    missionId: context.missionId,
                    brandId: context.brandId || context.userId,
                    userId: context.userId,
                    type: 'status_change',
                    role: 'system',
                    content: `Mission completed: ${args.summary}`,
                    metadata: {
                        status: 'completed',
                        verification: verification
                            ? {
                                goalRestated: verification.goalRestated,
                                stepsCompleted: verification.stepsCompleted,
                                evidenceEventIds: eventIds,
                                evidenceLinkIds: linkIds,
                            }
                            : undefined,
                    },
                }).catch(() => null);

                // Agent Workspace (Phase 1): drop a completion report into
                // Reports/ so the owner has a readable record. Fire-and-forget.
                void import('@/lib/agent/workspace')
                    .then(({ writeMissionReport }) => writeMissionReport({
                        userId: context.userId,
                        brandId: context.brandId || context.userId,
                        missionId: context.missionId!,
                        missionTitle: mission?.title || 'Mission',
                        summary: args.summary,
                        outcome: 'completed',
                        details: verification?.stepsCompleted?.length
                            ? `Steps completed: ${verification.stepsCompleted.join(' · ')}`
                            : undefined,
                    }))
                    .catch((error) => console.error('[completeMission] workspace report failed:', error));

                return {
                    status: 'completed',
                    success: true,
                    message: 'Mission marked as completed.',
                    summary: args.summary,
                };
            },
        }),
};

// ── 3. reportBlocked ──────────────────────────────────────────

const reportBlockedTool = {
    name: 'reportBlocked',
    description:
        'Signal that the mission cannot proceed without user input or external action. Call this when you are stuck and cannot make further autonomous progress. Be specific about what is needed.',
    parameters: z.object({
        reason: z.string().describe('Why the mission is blocked — what information or decision is needed.'),
        waitingFor: z
            .string()
            .optional()
            .describe('What specifically the agent is waiting for (e.g. "API credentials", "approval for budget", "missing contact email").'),
    }),
    factory: (context: AgentContext) =>
        tool({
            description: 'Signal that the mission is blocked and needs user input to continue.',
            parameters: z.object({
                reason: z.string(),
                waitingFor: z.string().optional(),
            }),
            execute: async (args) => {
                if (!context.missionId) {
                    return { success: false, message: 'No active mission to block.' };
                }

                const content = args.waitingFor
                    ? `Blocked: ${args.reason} — Waiting for: ${args.waitingFor}`
                    : `Blocked: ${args.reason}`;

                await agentMissionRepository.update(context.missionId, context.userId, {
                    status: 'blocked',
                    lastActivityAt: new Date(),
                }).catch(() => null);

                await agentMissionRepository.appendEvent({
                    missionId: context.missionId,
                    brandId: context.brandId || context.userId,
                    userId: context.userId,
                    type: 'status_change',
                    role: 'system',
                    content,
                    metadata: {
                        status: 'blocked',
                        reason: args.reason,
                        waitingFor: args.waitingFor,
                    },
                }).catch(() => null);

                return {
                    success: true,
                    message: content,
                };
            },
        }),
};

toolRegistry.register(createPlanTool);
toolRegistry.register(setPlanStepTool);
toolRegistry.register(completeMissionTool);
toolRegistry.register(reportBlockedTool);
