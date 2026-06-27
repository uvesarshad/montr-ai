/**
 * CRM Automation Library
 *
 * Main exports for workflow engine, webhook delivery, and event system.
 */

// Event Bus
export { crmEventBus, mapTriggerToEvent } from './events';
export type { CrmEventType, CrmEventData } from './events';

// Workflow Engine
export {
  evaluateTrigger,
  evaluateConditions,
  executeActions,
  triggerWorkflows,
} from './workflow-engine';

// Webhook Delivery
export {
  deliverWebhook,
  generateSignature,
  verifySignature,
  retryWebhookDelivery,
  triggerWebhooks,
  buildWebhookPayload,
} from './webhook-delivery';

// Event Handlers (emit functions)
export {
  initializeCrmEventHandlers,
  emitContactCreated,
  emitContactUpdated,
  emitContactDeleted,
  emitCompanyCreated,
  emitCompanyUpdated,
  emitCompanyDeleted,
  emitDealCreated,
  emitDealUpdated,
  emitDealStageChanged,
  emitDealWon,
  emitDealLost,
  emitDealDeleted,
  emitActivityCreated,
  emitTaskCompleted,
  emitTagAdded,
  emitTagRemoved,
} from './event-handlers';

// RBAC permissions
export {
  getCrmPermissionContext,
  assertCrmPermission,
  assertCanManageSettings,
  ownerFieldFor,
  ownsRecord,
  crmErrorResponse,
  CrmPermissionError,
  CrmAuthError,
} from './permissions';
export type { CrmPermissionContext, CrmAction, ScopeResult } from './permissions';
