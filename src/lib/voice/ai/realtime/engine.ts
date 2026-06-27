/**
 * Realtime (speech-to-speech) conversation engine.
 *
 * A drop-in alternative to the cascaded `VoiceConversationEngine` that drives a
 * single OpenAI Realtime socket instead of STT → LLM → TTS. It implements the
 * SAME lifecycle (`start` / `writeAudioFromCaller` / `onBargeIn` / `stop`) so the
 * media bridge can pick either engine by `engine: 'cascaded' | 'realtime'`.
 *
 * Server-side VAD handles turn-taking + native barge-in; transcripts come from
 * the Realtime API's input/output transcription events. The post-call loop
 * (transcript finalize → disposition → cost → trace) mirrors the cascaded engine
 * so observability/billing are identical across modes.
 *
 * Tools (KB/RAG + CRM lookup) reuse the SAME `BotTool`s as the cascaded agent —
 * converted to Realtime function definitions and executed on tool-call events.
 */

import { Types } from 'mongoose';
import { zodToJsonSchema } from 'zod-to-json-schema';

import {
  callSessionRepository,
  callTranscriptRepository,
} from '@/lib/db/repository/voice';
import type { ICallTranscript, CallTranscriptSpeaker } from '@/lib/db/models/voice/call-transcript.model';
import type { BotTool, BotToolContext } from '@/lib/ai-bots/tools/types';

import { broadcastVoiceEvent } from '../../events';
import { analyzeCallDisposition } from '../analyze-disposition';
import { estimateCallCost } from '../../cost-estimate';
import { startCallTrace, type CallTrace } from '../../observability';
import type { VoiceConversationOptions } from '../conversation-engine';
import {
  OpenAIRealtimeClient,
  resolveRealtimeApiKey,
  type RealtimeToolDef,
} from './client';

export class RealtimeConversationEngine {
  private client: OpenAIRealtimeClient | null = null;
  private transcript: ICallTranscript | null = null;
  private readonly toolMap = new Map<string, BotTool>();
  private readonly transcriptLines: string[] = [];
  private trace: CallTrace | null = null;
  private callStartedAt = Date.now();
  private turns = 0;
  private stopped = false;

  constructor(private opts: VoiceConversationOptions) {}

  async start(): Promise<void> {
    const apiKey = resolveRealtimeApiKey(this.opts.agent.userApiKeys?.openai);
    if (!apiKey) {
      throw new Error('Realtime engine requires VOICE_REALTIME_API_KEY or OPENAI_API_KEY');
    }

    this.trace = startCallTrace({
      callSessionId: this.opts.callSessionId,
      brandId: this.opts.agent.brandId ?? undefined,
      direction: 'outbound',
      metadata: { engine: 'realtime' },
    });

    this.transcript = await callTranscriptRepository.create({
      callSessionId: this.opts.callSessionId,
      language: this.opts.language,
      sttProvider: 'openai-realtime',
    });

    const tools = this.buildRealtimeTools();

    this.client = new OpenAIRealtimeClient({
      apiKey,
      voice: process.env.VOICE_REALTIME_VOICE ?? 'alloy',
      instructions: this.opts.agent.systemPrompt,
      tools,
      temperature: this.opts.agent.temperature,
      greet: true,
      onAudioDelta: (bytes) => { void this.opts.onAudioToCaller(bytes); },
      onSpeechStarted: () => this.opts.onClearCallerAudio?.(),
      onUserTranscript: (text) => { void this.persistSegment('caller', text); },
      onAgentTranscript: (text) => {
        this.turns += 1;
        void this.persistSegment('ai_bot', text);
      },
      onToolCall: (call) => { void this.handleToolCall(call); },
      onError: (err) => console.error('[voice-realtime] error:', err.message),
    });

    await this.client.connect();
  }

  /** Caller audio in (8 kHz μ-law). */
  writeAudioFromCaller(chunk: Uint8Array): void {
    if (this.stopped) return;
    this.client?.appendAudio(chunk);
  }

  /** External barge-in hook (server VAD already handles most). */
  onBargeIn(): void {
    this.client?.cancelResponse();
    this.opts.onClearCallerAudio?.();
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    this.client?.close();

    let plainText = '';
    if (this.transcript?._id) {
      plainText = this.transcriptLines.join('\n');
      await callTranscriptRepository.finalize(this.transcript._id.toString(), {
        plainText,
        status: 'ready',
      });
    }

    // Coalesce the cheap writes (transcriptId + cost) into one updateStatus so
    // the worker slot frees fast; the disposition LLM runs detached below.
    try {
      const breakdown = estimateCallCost({
        durationSec: (Date.now() - this.callStartedAt) / 1000,
        turns: this.turns,
        llmModel: process.env.VOICE_REALTIME_MODEL ?? 'gpt-4o-realtime-preview',
      });
      this.trace?.setCost(breakdown.total);
      await callSessionRepository.updateStatus(this.opts.callSessionId, {
        ...(this.transcript?._id ? { transcriptId: this.transcript._id as Types.ObjectId } : {}),
        costBreakdown: breakdown,
        costAmount: breakdown.total,
        costCurrency: 'USD',
      });
    } catch (err) {
      console.error('[voice-realtime] cost persist failed:', err);
    }

    void this.finalizePostCall(plainText);
  }

  /** Disposition analysis + trace flush — detached from stop() to free the slot. */
  private async finalizePostCall(plainText: string): Promise<void> {
    if (plainText.trim()) {
      try {
        const sess = await callSessionRepository.findById(
          this.opts.callSessionId
        );
        const disp = await analyzeCallDisposition({
          transcriptText: plainText,
          endReasonHint: sess?.endReason,
        });
        if (disp) {
          this.trace?.setDisposition(disp);
          await callSessionRepository.updateStatus(this.opts.callSessionId, {
            disposition: {
              outcome: disp.outcome,
              sentiment: disp.sentiment,
              category: disp.category,
              notes: disp.notes,
            },
          });
        }
      } catch (err) {
        console.error('[voice-realtime] disposition analysis failed:', err);
      }
    }
    try {
      this.trace?.end({ metrics: { turns: this.turns } as Record<string, unknown> });
      await this.trace?.flush();
    } catch (err) {
      console.error('[voice-realtime] trace flush failed:', err);
    }
  }

  // ── Tools ─────────────────────────────────────────────────────────────────
  private buildRealtimeTools(): RealtimeToolDef[] {
    const tools = this.opts.agent.tools ?? [];
    const defs: RealtimeToolDef[] = [];
    for (const t of tools) {
      this.toolMap.set(t.name, t);
      defs.push({
        type: 'function',
        name: t.name,
        description: t.description,
        parameters: zodToJsonSchema(t.parameters, { $refStrategy: 'none' }) as Record<string, unknown>,
      });
    }
    return defs;
  }

  private toolContext(): BotToolContext {
    return {
      brandId: this.opts.agent.brandId ?? null,
      aiBotId: '',
      channel: 'voice',
      conversationId: this.opts.callSessionId,
      actor: 'ai_bot',
    };
  }

  private async handleToolCall(call: { name: string; callId: string; args: unknown }): Promise<void> {
    const tool = this.toolMap.get(call.name);
    if (!tool || !this.client) {
      this.client?.sendToolResult(call.callId, { error: `Unknown tool: ${call.name}` });
      return;
    }
    try {
      // Reject malformed tool args instead of executing with unvalidated input
      // (the model could be steered into emitting args that skip the zod schema).
      const parsed = tool.parameters.safeParse(call.args);
      if (!parsed.success) {
        this.client.sendToolResult(call.callId, { error: 'Invalid tool arguments' });
        return;
      }
      const result = await tool.execute(this.toolContext(), parsed.data);
      this.client.sendToolResult(call.callId, result);
    } catch (err) {
      this.client.sendToolResult(call.callId, {
        error: err instanceof Error ? err.message : 'tool error',
      });
    }
  }

  // ── Transcript ──────────────────────────────────────────────────────────────
  private async persistSegment(speaker: CallTranscriptSpeaker, text: string): Promise<void> {
    if (!this.transcript?._id || !text.trim()) return;
    this.transcriptLines.push(`${speaker === 'ai_bot' ? 'Agent' : 'Caller'}: ${text.trim()}`);
    const at = (Date.now() - this.callStartedAt) / 1000;
    await callTranscriptRepository.appendSegment(this.transcript._id.toString(), {
      speaker,
      text,
      startSec: at,
      endSec: at,
    });
    broadcastVoiceEvent(this.opts.callSessionId, {
      type: 'transcript.segment',
      providerCallId: this.opts.callSessionId,
      at: new Date(),
      speaker,
      text,
      startSec: at,
      endSec: at,
      isFinal: true,
    });
  }
}
