/**
 * Voice AI subsystem barrel.
 */

export { VoiceConversationEngine } from './conversation-engine';
export type {
  VoiceConversationOptions,
  VoiceConversationMetrics,
} from './conversation-engine';

export { createVad, EnergyVad, SileroVad } from './vad';
export type { VadDetector, VadEvent, VadEventType, VadConfig } from './vad';

export {
  createTurnDetector,
  HeuristicTurnDetector,
  SemanticTurnDetector,
  DynamicEndpointing,
} from './turn';
export type { TurnDetector, TurnContext } from './turn';

export { AdaptiveInterruptionController } from './interruption';
export type {
  AdaptiveInterruptionConfig,
  AdaptiveInterruptionCallbacks,
  InterruptionTimers,
} from './interruption';

export { createVoiceAgent } from './agent';
export type { VoiceAgent, VoiceAgentOptions } from './agent';

export { StubSTTClient } from './stt';
export type { VoiceSTTClient, STTSession, STTSegmentEvent } from './stt';

export { StubTTSClient } from './tts';
export type { VoiceTTSClient, TTSStreamOptions } from './tts';

export { createBargeInDetector } from './barge-in';
export type { BargeInDetectorOptions } from './barge-in';

export { attachTwilioMediaBridge } from './twilio-media-bridge';
export type { TwilioMediaBridgeDeps } from './twilio-media-bridge';
