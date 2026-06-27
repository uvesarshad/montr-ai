/**
 * LiveKit media-plane foundation (Phase 8) — barrel.
 *
 * SCAFFOLD: token minting + room admin + webhook verification are functional
 * (given a configured LiveKit server). The engine bridge (`bridge.ts`) is a
 * documented stub — see `docs/plan/livekit-deployment-gap-2026-06-12.md`.
 */

export {
  getLiveKitConfig,
  isLiveKitConfigured,
  getLiveKitClientUrl,
  getRoomServiceClient,
  type LiveKitConfig,
} from './config';

export {
  mintAccessToken,
  type MintAccessTokenParams,
  type MintedToken,
  type ParticipantTenantMetadata,
} from './token';

export {
  roomNameForCall,
  callIdFromRoomName,
  createRoom,
  ensureRoom,
  listRooms,
  deleteRoom,
  type EnsureRoomOptions,
} from './rooms';

export {
  verifyLiveKitWebhook,
  type NormalizedLiveKitEvent,
  type LiveKitEventKind,
  type WebhookResult,
} from './webhook';

export {
  attachLiveKitBridge,
  type LiveKitBridgeOptions,
  type LiveKitBridgeHandle,
} from './bridge';
