/**
 * Agentic Node Processor (C5 fix — 2026-06-06)
 *
 * Executes an AI agent that AUTONOMOUSLY calls real tools to accomplish a goal,
 * using multi-step reasoning via the provider's native tool-calling. The old
 * implementation injected a hardcoded TOOL_DESCRIPTIONS map as prompt text,
 * asked the model to "explain what you would do," and echoed hallucinated
 * `toolsCalled` — nothing was actually invoked. This version binds the agent
 * tools from `src/lib/agent/tools/*` as real `CoreTool`s and reports the
 * tool calls that genuinely ran.
 *
 * Tool execution is scoped to the EXECUTION's organization/user — never
 * client-supplied. The default tool set is READ-ONLY CRM lookups; send tools
 * (email / WhatsApp) are only exposed when explicitly enabled in node config,
 * and run behind their own compliance gates (24h window / approved templates).
 */

import { CoreTool } from 'ai';
import { NodeProcessor, NodeProcessorContext } from '../index';
import { runMeteredWorkflowAI } from '../../metered-ai';
import { toolRegistry } from '@/lib/agent/tools/index';
import type { AgentContext } from '@/lib/agent/tools/types';

/**
 * Read-only CRM/data tools — safe to run autonomously. These are the default
 * set for an agentic node (matches the "look up X and summarize" use case).
 */
const READ_ONLY_TOOLS = [
  'getContact',
  'listContacts',
  'getCompany',
  'listCompanies',
  'getDealsPipeline',
  'listDeals',
  'searchKnowledgeBase',
  'getCurrentDate',
] as const;

/**
 * Side-effecting send tools — opt-in only. Their own `execute` enforces the
 * channel compliance gates (template approval / conversation window).
 */
const SEND_TOOLS = ['send_inbox_email', 'send_whatsapp_text', 'send_whatsapp_template'] as const;

const ALL_KNOWN = new Set<string>([...READ_ONLY_TOOLS, ...SEND_TOOLS]);

export class AgenticProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, variableResolver, execution } = context;
    const goal = String(config.goal || '');
    const personality = String(config.personality || 'friendly');
    const maxSteps = Math.min(Number(config.maxSteps) || 5, 10);
    const model = String(config.model || 'openai/gpt-4o');

    if (!goal) {
      throw new Error('AI Agent requires a goal');
    }

    // Resolve the curated tool whitelist. `config.enabledTools` may be an array
    // of names or a legacy boolean map; default to read-only when unset.
    const requested = this.resolveRequestedTools(config.enabledTools);
    const enabledTools = requested.filter((name) => ALL_KNOWN.has(name));
    const finalToolNames = enabledTools.length > 0 ? enabledTools : [...READ_ONLY_TOOLS];

    // Build the secure agent context from the EXECUTION record. Tool execution
    // is org/user-scoped server-side — the model can never widen this.
    const agentContext: AgentContext = {
      userId: execution.userId.toString(),
      brandId: execution.brandId?.toString(),
      enabledTools: finalToolNames,
    };

    const allTools = toolRegistry.getToolsForAgent(agentContext);

    // Wrap each tool's execute to capture REAL invocations + results, and to
    // charge each tool-driven round against the engine's per-run AI budget.
    const toolCalls: Array<{ tool: string; args: unknown; result: unknown }> = [];
    const tools: Record<string, CoreTool> = {};
    for (const name of finalToolNames) {
      const coreTool = allTools[name];
      if (!coreTool) continue;
      const originalExecute = (coreTool as { execute?: (args: unknown) => Promise<unknown> }).execute;
      if (typeof originalExecute !== 'function') {
        tools[name] = coreTool;
        continue;
      }
      tools[name] = {
        ...coreTool,
        execute: async (args: unknown) => {
          context.incrementAICall?.();
          const result = await originalExecute(args);
          toolCalls.push({ tool: name, args, result });
          return result;
        },
      } as CoreTool;
    }

    const systemPrompt = `You are an AI marketing/operations agent with a ${personality} personality.
Your goal: ${goal}

You have access to real tools. Use them to gather information and act toward the goal.
- Inspect the context variables below to find IDs, names, and data you need.
- Call the appropriate tools; do NOT fabricate tool results.
- When you have completed the goal (or determined it can't be done with the available tools), give a concise final answer.

Context variables:
${JSON.stringify(variableResolver.context, null, 2)}`;

    const { text, creditsUsed } = await runMeteredWorkflowAI(context, {
      model,
      system: systemPrompt,
      messages: [{ role: 'user', content: `Execute this goal: ${goal}` }],
      tools: Object.keys(tools).length > 0 ? tools : undefined,
      maxSteps,
    });

    return {
      output: text,
      response: text,
      // Real tool invocations with their actual results (no hallucination).
      toolsCalled: toolCalls.map((c) => c.tool),
      toolResults: toolCalls,
      toolCallCount: toolCalls.length,
      availableTools: finalToolNames,
      completed: true,
      goal,
      personality,
      model,
      creditsUsed,
    };
  }

  /** Normalize `enabledTools` (array of names OR legacy {name: boolean} map). */
  private resolveRequestedTools(enabledTools: unknown): string[] {
    if (Array.isArray(enabledTools)) {
      return enabledTools.filter((t): t is string => typeof t === 'string');
    }
    if (enabledTools && typeof enabledTools === 'object') {
      return Object.entries(enabledTools as Record<string, unknown>)
        .filter(([, enabled]) => Boolean(enabled))
        .map(([key]) => key);
    }
    return [];
  }

  validate(config: Record<string, unknown>) {
    if (!config.goal) {
      return { valid: false, errors: ['Goal is required for AI Agent node'] };
    }
    return { valid: true };
  }
}
