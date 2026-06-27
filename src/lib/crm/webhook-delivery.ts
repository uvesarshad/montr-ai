/**
 * CRM Webhook Delivery Service
 *
 * Handles outgoing webhook delivery with retry logic and signature generation.
 * Supports exponential backoff: 1min, 5min, 15min, 1hr, 6hr
 */

import * as crypto from 'crypto';
import { webhookRepository } from '@/lib/db/repository/crm/webhook.repository';
import { ICrmWebhook, WebhookEvent } from '@/lib/db/models/crm/webhook.model';
import { evaluateConditions } from './workflow-engine';
import type { IWorkflowCondition } from '@/lib/db/models/crm/workflow.model';
import { safeOutboundFetch } from '@/lib/workflow/ssrf-guard';
import { logger } from '@/lib/logger';

/**
 * Deliver a webhook to its target URL
 */
export async function deliverWebhook(
  webhook: ICrmWebhook,
  event: WebhookEvent,
  payload: Record<string, unknown>,
  attemptNumber: number = 1
): Promise<void> {
  const startTime = Date.now();

  try {
    // Generate signature if secret is provided
    const signature = webhook.secret
      ? generateSignature(payload, webhook.secret)
      : undefined;

    // Prepare headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'MontrAI-CRM-Webhook/1.0',
      'X-Webhook-Event': event,
      'X-Webhook-Delivery-ID': crypto.randomUUID(),
      'X-Webhook-Attempt': attemptNumber.toString(),
      ...webhook.headers,
    };

    if (signature) {
      headers['X-Webhook-Signature'] = signature;
    }

    // Send webhook. `safeOutboundFetch` validates the URL and pins DNS to the
    // validated IP so an attacker can't race a DNS rebind between the SSRF
    // check and the actual dial. Validation failures (private IPs, bad
    // schemes, unresolvable host) are surfaced as a normal delivery failure
    // — they're not retried because the URL itself is unsafe.
    let response: Response;
    try {
      response = (await safeOutboundFetch(webhook.url, {
        method: webhook.method,
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      })) as unknown as Response;
    } catch (guardError: unknown) {
      const reason = guardError instanceof Error ? guardError.message : 'Blocked by SSRF guard';
      await webhookRepository.createLog({
        webhookId: webhook._id.toString(),
        event,
        payload,
        statusCode: 0,
        response: reason.substring(0, 1000),
        success: false,
        attemptNumber,
      });
      await webhookRepository.recordDelivery(webhook._id.toString(), false, reason);
      return;
    }

    const responseText = await response.text().catch(() => '');

    // Log delivery attempt
    await webhookRepository.createLog({
      webhookId: webhook._id.toString(),
      event,
      payload,
      statusCode: response.status,
      response: responseText.substring(0, 1000), // Limit response size
      success: response.ok,
      attemptNumber,
    });

    // Update webhook stats
    await webhookRepository.recordDelivery(webhook._id.toString(), response.ok);

    // If failed and retries remaining, schedule retry
    if (!response.ok && attemptNumber < webhook.maxRetries) {
      await scheduleRetry(webhook, event, payload, attemptNumber + 1);
    }
  } catch (error: unknown) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    logger.error(
      {
        event: 'crm_webhook.delivery_failed',
        component: 'crm/webhook-delivery',
        webhookId: webhook._id.toString(),
        webhookUrl: webhook.url,
        webhookEvent: event,
        attemptNumber,
        durationMs: duration,
      },
      error,
    );

    // Log failed delivery
    await webhookRepository.createLog({
      webhookId: webhook._id.toString(),
      event,
      payload,
      statusCode: 0,
      response: errorMessage.substring(0, 1000),
      success: false,
      attemptNumber,
    });

    // Update webhook stats
    await webhookRepository.recordDelivery(webhook._id.toString(), false, errorMessage);

    // If retries remaining, schedule retry
    if (attemptNumber < webhook.maxRetries) {
      await scheduleRetry(webhook, event, payload, attemptNumber + 1);
    }
  }
}

/**
 * Generate HMAC-SHA256 signature for webhook payload
 */
export function generateSignature(payload: Record<string, unknown>, secret: string): string {
  const payloadString = JSON.stringify(payload);
  return crypto.createHmac('sha256', secret).update(payloadString).digest('hex');
}

/**
 * Verify webhook signature
 */
export function verifySignature(
  payload: Record<string, unknown>,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = generateSignature(payload, secret);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Schedule a retry for failed webhook delivery
 * Exponential backoff: 1min, 5min, 15min, 1hr, 6hr
 */
async function scheduleRetry(
  webhook: ICrmWebhook,
  event: WebhookEvent,
  payload: Record<string, unknown>,
  attemptNumber: number
): Promise<void> {
  // Calculate delay in milliseconds using exponential backoff
  const delays = [
    1 * 60 * 1000,      // 1 minute
    5 * 60 * 1000,      // 5 minutes
    15 * 60 * 1000,     // 15 minutes
    60 * 60 * 1000,     // 1 hour
    6 * 60 * 60 * 1000, // 6 hours
  ];

  const delayIndex = Math.min(attemptNumber - 2, delays.length - 1);
  const delay = delays[delayIndex];

  console.log(
    `Scheduling retry ${attemptNumber} for webhook ${webhook._id} in ${delay / 1000}s`
  );

  // Schedule retry using setTimeout
  // In production, use a job queue like Bull or Agenda
  setTimeout(async () => {
    try {
      // Re-fetch webhook to ensure it's still active
      const currentWebhook = await webhookRepository.findById(
        webhook._id.toString()
      );

      if (currentWebhook && currentWebhook.isActive) {
        await deliverWebhook(currentWebhook, event, payload, attemptNumber);
      }
    } catch (error) {
      console.error(`Error in webhook retry ${attemptNumber}:`, error);
    }
  }, delay);
}

/**
 * Retry a specific webhook delivery log
 */
export async function retryWebhookDelivery(logId: string): Promise<void> {
  try {
    // This is a placeholder - in production, you'd fetch the log,
    // get the webhook, and retry the delivery
    console.log(`Retrying webhook delivery for log ${logId}`);
    // TODO: Implement retry from log
  } catch (error) {
    console.error('Error retrying webhook delivery:', error);
  }
}

/**
 * Trigger webhooks for a CRM event
 */
export async function triggerWebhooks(
  event: WebhookEvent,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    // Find active webhooks listening for this event
    const webhooks = await webhookRepository.findByEvent(event);

    for (const webhook of webhooks) {
      try {
        // Check filters
        if (webhook.filters && webhook.filters.length > 0) {
          const filtersPass = evaluateConditions(
            webhook.filters as IWorkflowCondition[],
            payload
          );

          if (!filtersPass) {
            continue; // Skip this webhook
          }
        }

        // Deliver webhook asynchronously
        deliverWebhook(webhook, event, payload, 1).catch(error => {
          console.error(`Failed to deliver webhook ${webhook._id}:`, error);
        });
      } catch (error) {
        console.error(`Error processing webhook ${webhook._id}:`, error);
      }
    }
  } catch (error) {
    console.error('Error triggering webhooks:', error);
  }
}

/**
 * Build webhook payload from entity
 */
export function buildWebhookPayload(
  event: WebhookEvent,
  entity: unknown,
  metadata?: Record<string, unknown>
): Record<string, unknown> {
  return {
    event,
    timestamp: new Date().toISOString(),
    data: entity,
    metadata: metadata || {},
  };
}
