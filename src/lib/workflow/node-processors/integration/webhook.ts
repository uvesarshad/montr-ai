/**
 * Send Webhook Processor
 */

import { NodeProcessor, NodeProcessorContext } from '../index';
import crypto from 'crypto';
import { safeOutboundFetch } from '../../ssrf-guard';

export class SendWebhookProcessor implements NodeProcessor {
  async execute(context: NodeProcessorContext): Promise<Record<string, unknown>> {
    const { config, execution } = context;

    // Get webhook details
    const url = String(config.url || '');
    const method = String(config.method || 'POST');
    const headers = (config.headers || {}) as Record<string, unknown>;
    const body = config.body || execution.variables;
    const secret = config.secret as string | undefined; // For signing webhook
    const timeout = Number(config.timeout) || 30000;

    if (!url) {
      throw new Error('Webhook URL is required');
    }

    // Build webhook payload
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = {
      event: 'workflow.executed',
      workflowId: execution.workflowId.toString(),
      executionId: execution._id.toString(),
      timestamp: new Date(timestamp * 1000).toISOString(),
      data: body
    };

    const payloadString = JSON.stringify(payload);

    // Build headers. The signed value is `timestamp.payloadString` so receivers
    // can enforce a replay window by checking that |now - timestamp| <= 5 minutes.
    const extraHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      if (v != null) extraHeaders[k] = String(v);
    }
    const webhookHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Workflow-Id': execution.workflowId.toString(),
      'X-Execution-Id': execution._id.toString(),
      'X-Webhook-Timestamp': String(timestamp),
      ...extraHeaders
    };

    if (secret) {
      const signedPayload = `${timestamp}.${payloadString}`;
      const signature = crypto
        .createHmac('sha256', secret)
        .update(signedPayload)
        .digest('hex');

      webhookHeaders['X-Webhook-Signature'] = `t=${timestamp},v1=${signature}`;
    }

    // Build request options
    const requestOptions: RequestInit = {
      method,
      headers: webhookHeaders,
      body: payloadString,
      signal: AbortSignal.timeout(timeout)
    };

    try {
      // Send webhook — safeOutboundFetch validates + pins DNS (SSRF-safe).
      const response = await safeOutboundFetch(url, requestOptions);

      // Get response body
      let responseBody: unknown;
      const contentType = response.headers.get('content-type');

      if (contentType?.includes('application/json')) {
        responseBody = await response.json();
      } else {
        responseBody = await response.text();
      }

      return {
        success: response.ok,
        statusCode: response.status,
        statusText: response.statusText,
        responseBody,
        webhookUrl: url
      };
    } catch (error: unknown) {
      throw new Error(`Webhook delivery failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  validate(config: Record<string, unknown>): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];

    if (!config.url) {
      errors.push('Webhook URL is required');
    } else {
      try {
        new URL(String(config.url));
      } catch {
        errors.push('Invalid webhook URL format');
      }
    }

    const validMethods = ['POST', 'PUT'];
    if (config.method && !validMethods.includes(String(config.method))) {
      errors.push(`Webhook method must be one of: ${validMethods.join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }
}
