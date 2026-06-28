import { CoreTool } from 'ai';
import { z } from 'zod';
import { AgentContext, RegisteredTool } from './tools/types';
import { extractMissionLinksFromToolResult } from './mission-links';
import { agentMissionRepository } from '@/lib/db/repository/agent-mission.repository';
import { checkHITL } from './hitl-gateway';
import { BudgetCheckResult, checkAndIncrement, incrementRetry, terminateMission } from './mission-budget';

const MISSION_CONTROL = new Set(['createPlan', 'setPlanStep', 'completeMission', 'reportBlocked', 'sleep_until']);

class ToolRegistry {
    private tools: Map<string, RegisteredTool> = new Map();

    register<T extends z.ZodTypeAny, R>(tool: RegisteredTool<T, R>): void {
        if (this.tools.has(tool.name)) {
            console.warn(`Tool ${tool.name} is already registered. Overwriting.`);
        }
        this.tools.set(tool.name, tool as unknown as RegisteredTool);
    }

    getTool(name: string): RegisteredTool | undefined {
        return this.tools.get(name);
    }

    getAllTools(): RegisteredTool[] {
        return Array.from(this.tools.values());
    }

    /**
     * Generates a dictionary of CoreTools suitable for the Vercel AI SDK execute method,
     * injecting the secure server-side AgentContext into each tool's execution.
     * If context.enabledTools is set, only those tools are included.
     */
    getToolsForAgent(context: AgentContext): Record<string, CoreTool> {
        const aiTools: Record<string, CoreTool> = {};
        for (const [name, tool] of this.tools.entries()) {
            // If enabledTools is specified, only include whitelisted tools
            if (context.enabledTools && context.enabledTools.length > 0) {
                if (!context.enabledTools.includes(name)) continue;
            }
            const coreTool = tool.factory(context);
            const execute = (coreTool as { execute?: (args: unknown) => Promise<unknown> }).execute;

            if (!context.missionId || typeof execute !== 'function') {
                aiTools[name] = coreTool;
                continue;
            }

            aiTools[name] = {
                ...coreTool,
                execute: async (args: unknown) => {
                    const argsObj = args && typeof args === 'object' ? args as Record<string, unknown> : {};

                    await agentMissionRepository.appendEvent({
                        missionId: context.missionId!,
                        brandId: context.brandId || context.userId,
                        userId: context.userId,
                        type: 'tool_call',
                        role: 'system',
                        content: `Calling tool: ${name}`,
                        metadata: {
                            toolName: name,
                            toolArgs: argsObj,
                        },
                    }).catch((error) => {
                        console.error(`[ToolRegistry] Failed to append tool_call event for ${name}:`, error);
                    });

                    const hitl = await checkHITL(name, argsObj, context).catch((error) => {
                        console.error(`[ToolRegistry] HITL check failed for ${name}; falling back to execute:`, error);
                        return { requiresApproval: false } as { requiresApproval: false };
                    });

                    if (hitl.requiresApproval) {
                        // Let the tool attach a structured preview artifact to the
                        // approval card (e.g. strategy roadmap dry-run). Best-effort.
                        let approvalArtifact: unknown;
                        if (typeof tool.buildApprovalArtifact === 'function' && hitl.pendingActionId) {
                            approvalArtifact = await Promise.resolve(
                                tool.buildApprovalArtifact(argsObj, context, hitl.pendingActionId),
                            ).catch((error) => {
                                console.error(`[ToolRegistry] buildApprovalArtifact failed for ${name}:`, error);
                                return undefined;
                            });
                        }
                        return {
                            status: 'awaiting_approval',
                            pendingActionId: hitl.pendingActionId,
                            message: hitl.message,
                            ...(approvalArtifact ? { artifact: approvalArtifact } : {}),
                        };
                    }

                    // Tool-call budget gate. Mission-control tools don't count against the cap.
                    const COUNTED = !MISSION_CONTROL.has(name);
                    if (COUNTED) {
                        const budget = await checkAndIncrement(context.missionId!, 'toolCall', 1);
                        if (!budget.ok && budget.exceeded) {
                            await terminateMission(
                                {
                                    _id: context.missionId!,
                                    brandId: context.brandId || context.userId,
                                    userId: context.userId,
                                },
                                context.missionId!,
                                budget.exceeded,
                                budget.message || 'Mission budget exceeded',
                            );
                            return {
                                status: 'budget_exceeded',
                                reason: budget.exceeded,
                                message: budget.message,
                            };
                        }
                    }

                    let result: unknown;
                    try {
                        result = await execute(args);
                    } catch (error) {
                        const retry: BudgetCheckResult = await incrementRetry(context.missionId!, name).catch(() => ({ ok: true }));
                        if (!retry.ok && retry.exceeded) {
                            await terminateMission(
                                {
                                    _id: context.missionId!,
                                    brandId: context.brandId || context.userId,
                                    userId: context.userId,
                                },
                                context.missionId!,
                                retry.exceeded,
                                retry.message || `Retry budget exhausted for ${name}`,
                            );
                            return {
                                status: 'retry_exhausted',
                                tool: name,
                                message: retry.message,
                            };
                        }
                        throw error;
                    }

                    const SUMMARY_CAP = 2_000;     // UI-friendly excerpt
                    const FULL_CAP = 50_000;       // LLM context budget
                    const resultString = typeof result === 'string'
                        ? result
                        : JSON.stringify(result);
                    const resultFull = resultString.slice(0, FULL_CAP);
                    const resultSummary = resultString.slice(0, SUMMARY_CAP);
                    const truncated = resultString.length > FULL_CAP;

                    await agentMissionRepository.appendEvent({
                        missionId: context.missionId!,
                        brandId: context.brandId || context.userId,
                        userId: context.userId,
                        type: 'tool_result',
                        role: 'system',
                        content: `Tool ${name} completed.`,
                        metadata: {
                            toolName: name,
                            resultSummary,
                            resultFull,
                            resultLength: resultString.length,
                            truncated,
                        },
                    }).catch((error) => {
                        console.error(`[ToolRegistry] Failed to append tool_result event for ${name}:`, error);
                    });

                    const links = extractMissionLinksFromToolResult(
                        name,
                        result,
                        args && typeof args === 'object' ? args as Record<string, unknown> : undefined
                    );

                    if (links.length > 0) {
                        await Promise.allSettled(links.map((link) => (
                            agentMissionRepository.createLink({
                                missionId: context.missionId!,
                                brandId: context.brandId || context.userId,
                                userId: context.userId,
                                targetType: link.targetType,
                                targetId: link.targetId,
                                targetLabel: link.targetLabel,
                                targetRoute: link.targetRoute,
                                metadata: link.metadata,
                            })
                        )));

                        await Promise.allSettled(links.map((link) => (
                            agentMissionRepository.appendEvent({
                                missionId: context.missionId!,
                                brandId: context.brandId || context.userId,
                                userId: context.userId,
                                type: 'artifact_created',
                                role: 'system',
                                content: `Linked ${link.targetLabel || link.targetType} from ${name}.`,
                                metadata: {
                                    toolName: name,
                                    targetType: link.targetType,
                                    targetId: link.targetId,
                                    targetRoute: link.targetRoute,
                                },
                            })
                        )));
                    }

                    return result;
                }
            } as CoreTool;
        }
        return aiTools;
    }
}

export const toolRegistry = new ToolRegistry();
