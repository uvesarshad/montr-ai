/**
 * Agent brain seam (master §2A.6 L2) — barrel.
 *
 * Resolve the active brain with resolveBrainProvider(); an overlay binds a
 * curated brain with bindBrainProvider(). See ./provider for the contract.
 */

export type {
  BrainProvider,
  BrainContext,
  BrainPlaybookQuery,
  BrainGroundingQuery,
  BrainTask,
  BrainModelPreference,
} from './provider';
export { resolveBrainProvider, bindBrainProvider } from './provider';
export { GenericBrainProvider } from './generic-provider';
