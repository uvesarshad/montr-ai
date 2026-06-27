
'use server';

import { z } from 'genkit';
import { generateTextWithClient, streamTextWithClient } from '@/ai/client';
import { ApiKeysSchema, ApiKeys, RouteHintSchema } from '@/ai/types';
import { CoreMessage } from 'ai';
// Lazy auth import — module-scope next-auth breaks the tsx worker process
// (@auth/mongodb-adapter has no CJS-resolvable export). auth() is only used
// inside functions, so it is imported on demand.
import { userRepository } from '@/lib/db/repository/user.repository';
import { planRepository } from '@/lib/db/repository/plan.repository';
import { checkAICredits, consumeAICredits } from '@/ai/credit-wrapper';
import { findModelById } from '@/lib/model-groups';
import { getRouteHint, canUserAccessModel } from '@/lib/model-access';
import { knowledgeBaseService } from '@/lib/inbox/knowledge-base.service';
import { Types } from 'mongoose';
import { toolRegistry } from '@/lib/agent/tool-registry';

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});

const ChatInputSchema = z.object({
  context: z.string().optional().describe('The long-term memory or knowledge base for the chatbot.'),
  prompt: z.string().describe("The user's question or message."),
  history: z.array(MessageSchema).optional().describe('The previous conversation history.'),
  model: z.string().describe('The AI model to use for the response (e.g., "openai/gpt-4o").'),
  userProfile: z.any().optional(),
  userPlan: z.any().optional(),
  userApiKeys: ApiKeysSchema.optional(),
  routeHint: RouteHintSchema.nullable().optional(),
  stream: z.boolean().optional().default(false),
  useKnowledgeBase: z.boolean().optional().default(false),
  useAgentActions: z.boolean().optional().default(false),
});
export type GenerateChatResponseInput = z.infer<typeof ChatInputSchema>;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const GenerateChatResponseOutputSchema = z.object({
  response: z.string().describe("The AI's generated response."),
  creditsUsed: z.number().optional().describe('Credits consumed for this request.'),
});
type GenerateChatResponseOutput = z.infer<typeof GenerateChatResponseOutputSchema>;


function constructMessages(prompt: string, history?: CoreMessage[], context?: string): { system: string, messages: CoreMessage[] } {
  let systemMessage = "You are a helpful AI assistant. Answer the user's questions based on the conversation history and context provided.";
  if (context) {
    systemMessage += `\n\nContext from connected nodes:\n---\n${context}\n---`;
  }

  const messages: CoreMessage[] = [...(history || []), { role: 'user', content: prompt }];

  return { system: systemMessage, messages: messages };
}


export async function generateChatResponse(input: GenerateChatResponseInput): Promise<GenerateChatResponseOutput> {
  let { context, prompt, history, model, useKnowledgeBase, useAgentActions } = input;

  const session = await (await import('@/lib/get-session')).getSession();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let userProfile: any, userPlan: any, userApiKeys: ApiKeys | undefined;
  const user = await userRepository.findById(session.user.id);
  if (user) {
    userApiKeys = user.userApiKeys as ApiKeys | undefined;
    userProfile = user;
    // Load full plan with features for model access checks
    if (user.planId) {
      const plan = await planRepository.findById(user.planId);
      userPlan = plan ? {
        id: plan._id.toString(),
        name: plan.name,
        features: plan.features,
      } : null;
    }
  }

  // Fetch Knowledge Base Context if enabled
  if (useKnowledgeBase) {
    try {
      const user = await userRepository.findById(session.user.id);
      const orgIdStr = user ? (user.id || session.user.id) : session.user.id;
      if (Types.ObjectId.isValid(orgIdStr)) {
        const kbContext = await knowledgeBaseService.getContext({
          query: prompt,
        });
        if (kbContext) {
          context = context ? `${context}\n\nOrganization Knowledge Base:\n${kbContext}` : `Organization Knowledge Base:\n${kbContext}`;
        }
      }
    } catch (e) {
      console.error("Failed to fetch Knowledge Base context:", e);
    }
  }

  const { system, messages } = constructMessages(prompt, history, context);

  // Check credits before processing
  const creditCheck = await checkAICredits(session.user.id, model);
  if (!creditCheck.allowed) {
    throw new Error(
      creditCheck.reason === 'insufficient_credits'
        ? `Insufficient credits. You need ${creditCheck.cost} credits but have ${creditCheck.remaining}.`
        : 'No active subscription. Please subscribe to use AI features.'
    );
  }

  // Compute route hint server-side using the model definition
  const modelDef = findModelById(model);
  if (!modelDef) {
    throw new Error(`Model '${model}' not found in model registry.`);
  }

  const access = canUserAccessModel(modelDef, userPlan, userProfile);
  if (!access.allowed) {
    throw new Error(access.reason || 'Model access denied');
  }

  const routeHint = getRouteHint(modelDef, userProfile, access.usingByok);
  const usingByok = access.usingByok;

  // Build tools map if agent actions are enabled
  let tools = undefined;
  if (useAgentActions && userProfile) {
    const agentContext = {
      userId: session.user.id,
      userEmail: session.user.email || undefined,
      userName: session.user.name || undefined
    };
    tools = toolRegistry.getToolsForAgent(agentContext);
  }

  try {
    const response = await generateTextWithClient({
      model,
      system,
      messages,
      userProfile: userProfile,
      userPlan: userPlan,
      userApiKeys,
      routeHint,
      tools,
    });

    // Consume credits after successful generation
    await consumeAICredits(session.user.id, model, 'text', usingByok);

    return { response, creditsUsed: creditCheck.cost };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error with model ${model}:`, error);
    throw new Error(
      `The selected model '${model}' is not available or failed. Please check your API key or choose a different model. Error: ${message}`
    );
  }
}

export async function streamChatResponse(input: GenerateChatResponseInput): Promise<AsyncGenerator<string>> {
  let { context, prompt, history, model, useKnowledgeBase, useAgentActions } = input;

  const session = await (await import('@/lib/get-session')).getSession();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let userProfile: any, userPlan: any, userApiKeys: ApiKeys | undefined;
  const user = await userRepository.findById(session.user.id);
  if (user) {
    userApiKeys = user.userApiKeys as ApiKeys | undefined;
    userProfile = user;
    // Load full plan with features for model access checks
    if (user.planId) {
      const plan = await planRepository.findById(user.planId);
      userPlan = plan ? {
        id: plan._id.toString(),
        name: plan.name,
        features: plan.features,
      } : null;
    }
  }

  // Fetch Knowledge Base Context if enabled
  if (useKnowledgeBase) {
    try {
      const user = await userRepository.findById(session.user.id);
      const orgIdStr = user ? (user.id || session.user.id) : session.user.id;
      if (Types.ObjectId.isValid(orgIdStr)) {
        const kbContext = await knowledgeBaseService.getContext({
          query: prompt,
        });
        if (kbContext) {
          context = context ? `${context}\n\nOrganization Knowledge Base:\n${kbContext}` : `Organization Knowledge Base:\n${kbContext}`;
        }
      }
    } catch (e) {
      console.error("Failed to fetch Knowledge Base context:", e);
    }
  }

  const { system, messages } = constructMessages(prompt, history, context);

  // Check credits before processing
  const creditCheck = await checkAICredits(session.user.id, model);
  if (!creditCheck.allowed) {
    throw new Error(
      creditCheck.reason === 'insufficient_credits'
        ? `Insufficient credits. You need ${creditCheck.cost} credits but have ${creditCheck.remaining}.`
        : 'No active subscription. Please subscribe to use AI features.'
    );
  }

  // Compute route hint server-side using the model definition
  const modelDef = findModelById(model);
  if (!modelDef) {
    throw new Error(`Model '${model}' not found in model registry.`);
  }

  const access = canUserAccessModel(modelDef, userPlan, userProfile);
  if (!access.allowed) {
    throw new Error(access.reason || 'Model access denied');
  }

  const routeHint = getRouteHint(modelDef, userProfile, access.usingByok);
  const usingByok = access.usingByok;

  // Build tools map if agent actions are enabled
  let tools = undefined;
  if (useAgentActions && userProfile) {
    const agentContext = {
      userId: session.user.id,
      userEmail: session.user.email || undefined,
      userName: session.user.name || undefined
    };
    tools = toolRegistry.getToolsForAgent(agentContext);
  }

  try {
    // Consume credits before streaming (since we can't wait for completion)
    await consumeAICredits(session.user.id, model, 'text', usingByok);

    return await streamTextWithClient({
      model,
      system,
      messages,
      userProfile: userProfile,
      userPlan: userPlan,
      userApiKeys,
      routeHint,
      tools,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Streaming Error] Model: ${model}`, error);
    const errorMessage = `Failed to stream from model '${model}'. Details: ${message}`;
    throw new Error(errorMessage);
  }
}
