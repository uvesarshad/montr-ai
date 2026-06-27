/**
 * AI Studio agent tools (B1-2.4).
 *
 * Wraps the AI Studio orchestration layer. Outputs auto-land in media-asset
 * via the asset bridge (B2-3.12 — already wired in completeSession).
 */

import { z } from 'zod';
import { tool } from 'ai';
import { toolRegistry } from '../tool-registry';
import type { AgentContext } from './types';

const providerOpt = z.string().optional().describe('AI provider override (e.g. "anthropic", "openai", "replicate").');

// ─── Shared schemas (used in both outer definition and inner tool() call) ─────

const imageParams = z.object({
  prompt: z.string(),
  characterId: z.string().optional().describe('Character profile ID for consistency.'),
  aspectRatio: z.string().optional().describe('e.g. "1:1", "16:9", "9:16", "4:3". Default: 1:1.'),
  provider: providerOpt,
});

const videoParams = z.object({
  prompt: z.string(),
  characterId: z.string().optional(),
  durationSec: z.number().optional().describe('Duration in seconds. Default: 5.'),
  provider: providerOpt,
});

const textParams = z.object({
  prompt: z.string(),
  model: z.string().optional().describe('Model override, e.g. "claude-sonnet-4-6".'),
  maxTokens: z.number().optional().describe('Max output tokens. Default: 1024.'),
});

// ─── generate_image ──────────────────────────────────────────────────────────

const generateImageTool = {
  name: 'generate_image',
  description: 'Generate an image using AI. Output is saved to the media library automatically.',
  parameters: imageParams,
  factory: (context: AgentContext) => tool({
    description: 'Generate an AI image.',
    parameters: imageParams,
    execute: async (args) => {
      try {
        const { createProject, runSession } = await import('@/lib/ai-studio/orchestration');
        const project = await createProject({
          brandId: context.brandId,
          createdById: context.userId,
          name: `Agent image: ${args.prompt.slice(0, 40)}`,
          kind: 'image',
        });
        const session = await runSession({
          projectId: project._id.toString(),
          kind: 'image',
          prompt: args.prompt,
          model: args.provider ? `${args.provider}/default` : 'replicate/flux-schnell',
          characterId: args.characterId,
          settings: { aspectRatio: args.aspectRatio ?? '1:1' },
        });
        return { success: true, sessionId: session.id, status: session.status };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  }),
};

// ─── generate_video ──────────────────────────────────────────────────────────

const generateVideoTool = {
  name: 'generate_video',
  description: 'Generate a video using AI. Output saved to media library.',
  parameters: videoParams,
  factory: (context: AgentContext) => tool({
    description: 'Generate an AI video.',
    parameters: videoParams,
    execute: async (args) => {
      try {
        const { createProject, runSession } = await import('@/lib/ai-studio/orchestration');
        const project = await createProject({
          brandId: context.brandId,
          createdById: context.userId,
          name: `Agent video: ${args.prompt.slice(0, 40)}`,
          kind: 'video',
        });
        const session = await runSession({
          projectId: project._id.toString(),
          kind: 'video',
          prompt: args.prompt,
          model: args.provider ? `${args.provider}/default` : 'runway/gen3a_turbo',
          characterId: args.characterId,
          settings: { duration: args.durationSec ?? 5 },
        });
        return { success: true, sessionId: session.id, status: session.status };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  }),
};

// ─── generate_audio ──────────────────────────────────────────────────────────

const audioParams = z.object({
  text: z.string(),
  characterId: z.string().optional().describe('Character profile with voice settings.'),
  voice: z.string().optional().describe('Voice name override.'),
  provider: providerOpt,
});

const generateAudioTool = {
  name: 'generate_audio',
  description: 'Generate audio/speech using AI TTS. Output saved to media library.',
  parameters: audioParams,
  factory: (context: AgentContext) => tool({
    description: 'Generate AI audio/speech.',
    parameters: audioParams,
    execute: async (args) => {
      try {
        const { createProject, runSession } = await import('@/lib/ai-studio/orchestration');
        const project = await createProject({
          brandId: context.brandId,
          createdById: context.userId,
          name: `Agent audio: ${args.text.slice(0, 40)}`,
          kind: 'audio',
        });
        const session = await runSession({
          projectId: project._id.toString(),
          kind: 'audio',
          prompt: args.text,
          model: args.provider ?? 'elevenlabs/eleven_turbo_v2',
          characterId: args.characterId,
          settings: { voice: args.voice },
        });
        return { success: true, sessionId: session.id, status: session.status };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  }),
};

// ─── generate_text ───────────────────────────────────────────────────────────

const generateTextTool = {
  name: 'generate_text',
  description: 'Generate text/copy using AI for emails, posts, scripts, etc.',
  parameters: textParams,
  factory: (_context: AgentContext) => tool({
    description: 'Generate AI text content.',
    parameters: textParams,
    execute: async (args) => {
      try {
        const { generateTextWithClient } = await import('@/ai/client');
        const text = await generateTextWithClient({
          model: args.model ?? 'claude-haiku-4-5-20251001',
          system: 'You are a professional marketing copywriter. Write compelling, on-brand copy.',
          messages: [{ role: 'user', content: args.prompt }],
          maxTokens: args.maxTokens ?? 1024,
        });
        return { success: true, text };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  }),
};

// ─── list_characters ─────────────────────────────────────────────────────────

const listCharactersTool = {
  name: 'list_characters',
  description: 'List AI character profiles available for the brand.',
  parameters: z.object({}),
  factory: (context: AgentContext) => tool({
    description: 'List AI characters for the brand.',
    parameters: z.object({}),
    execute: async () => {
      try {
        const { connectMongoose } = await import('@/lib/mongodb');
        await connectMongoose();
        const AiCharacter = (await import('@/lib/db/models/ai-character.model')).default;
        const characters = await AiCharacter.find({
          $or: [
            { brandId: context.brandId },
            { isOrgShared: true },
          ],
        }).select('_id name description style personality').lean();
        return { success: true, characters };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  }),
};

// ─── Register ─────────────────────────────────────────────────────────────────

toolRegistry.register(generateImageTool);
toolRegistry.register(generateVideoTool);
toolRegistry.register(generateAudioTool);
toolRegistry.register(generateTextTool);
toolRegistry.register(listCharactersTool);
