/**
 * CRM Event Bus
 *
 * Internal event system for triggering workflows and webhooks.
 * Emits events when CRM records are created, updated, deleted, etc.
 */

export type CrmEventType =
  // Contact events
  | 'contact.created'
  | 'contact.updated'
  | 'contact.deleted'
  // Company events
  | 'company.created'
  | 'company.updated'
  | 'company.deleted'
  // Deal events
  | 'deal.created'
  | 'deal.updated'
  | 'deal.deleted'
  | 'deal.stage_changed'
  | 'deal.won'
  | 'deal.lost'
  // Activity events
  | 'activity.created'
  | 'task.completed'
  // Tag events
  | 'tag.added'
  | 'tag.removed'
  // Email events
  | 'email.received'
  | 'email.sent'
  // Marketing Email events
  | 'marketing_email.sent'
  | 'marketing_email.opened'
  | 'marketing_email.clicked'
  | 'marketing_email.bounced'
  | 'marketing_email.complained'
  | 'marketing_email.unsubscribed';

export interface CrmEventData {
  entityType: 'contact' | 'company' | 'deal' | 'activity' | 'email';
  entityId: string;
  entity: Record<string, unknown>; // The full entity object
  changes?: Record<string, { from: unknown; to: unknown }>; // For update events
  previousStageId?: string; // For deal.stage_changed
  userId?: string; // User who triggered the event
  metadata?: Record<string, unknown>;
}

type EventHandler = (eventType: CrmEventType, data: CrmEventData) => Promise<void>;

class CrmEventBus {
  private handlers: Map<CrmEventType | '*', EventHandler[]> = new Map();
  private eventQueue: Array<{ eventType: CrmEventType; data: CrmEventData }> = [];
  private processing = false;

  /**
   * Register an event handler for a specific event type or all events (*)
   */
  on(eventType: CrmEventType | '*', handler: EventHandler): void {
    const handlers = this.handlers.get(eventType) || [];
    handlers.push(handler);
    this.handlers.set(eventType, handlers);
  }

  /**
   * Remove an event handler
   */
  off(eventType: CrmEventType | '*', handler: EventHandler): void {
    const handlers = this.handlers.get(eventType) || [];
    const index = handlers.indexOf(handler);
    if (index > -1) {
      handlers.splice(index, 1);
      this.handlers.set(eventType, handlers);
    }
  }

  /**
   * Emit an event to all registered handlers
   * Events are queued and processed asynchronously to avoid blocking
   */
  async emit(eventType: CrmEventType, data: CrmEventData): Promise<void> {
    // Add to queue
    this.eventQueue.push({ eventType, data });

    // Process queue if not already processing
    if (!this.processing) {
      this.processQueue();
    }
  }

  /**
   * Process the event queue asynchronously
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.eventQueue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.eventQueue.length > 0) {
      const event = this.eventQueue.shift();
      if (!event) continue;

      const { eventType, data } = event;

      try {
        // Get handlers for this specific event type
        const specificHandlers = this.handlers.get(eventType) || [];

        // Get wildcard handlers that listen to all events
        const wildcardHandlers = this.handlers.get('*') || [];

        // Combine all handlers
        const allHandlers = [...specificHandlers, ...wildcardHandlers];

        // Execute all handlers in parallel
        await Promise.allSettled(
          allHandlers.map(handler => handler(eventType, data))
        );
      } catch (error) {
        console.error(`Error processing event ${eventType}:`, error);
      }
    }

    this.processing = false;
  }

  /**
   * Clear all handlers (useful for testing)
   */
  clearHandlers(): void {
    this.handlers.clear();
  }
}

// Export singleton instance
export const crmEventBus = new CrmEventBus();

/**
 * Helper to map workflow trigger types to event types
 */
export function mapTriggerToEvent(
  triggerType: string,
  entityType: string
): CrmEventType | null {
  const mapping: Record<string, string> = {
    'record_created': `${entityType}.created`,
    'record_updated': `${entityType}.updated`,
    'stage_changed': 'deal.stage_changed',
    'deal_won': 'deal.won',
    'deal_lost': 'deal.lost',
    'tag_added': 'tag.added',
    'tag_removed': 'tag.removed',
  };

  const eventType = mapping[triggerType];
  return eventType ? (eventType as CrmEventType) : null;
}
