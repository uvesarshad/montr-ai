/**
 * Outbound webhook dispatch (Epic 6).
 *
 * `emitPostEvent(event, post)` loads the active webhook subscriptions for the
 * post's organization (+ brand) that subscribe to `event`, and POSTs a signed
 * JSON payload to each subscriber's URL via `safeOutboundFetch` (SSRF-guarded).
 *
 * The signature is `X-Montrai-Signature: sha256=<hex>` — an HMAC-SHA256 of the
 * exact request body using the subscription's `secret`, so receivers can verify
 * authenticity. Delivery success/failure is recorded back on the subscription.
 *
 * This is fire-and-forget: it NEVER throws to the caller (the worker publishes
 * the post regardless of whether webhooks deliver). Wire it from the worker
 * after a publish attempt.
 */

import crypto from 'crypto';
import { webhookSubscriptionRepository } from '@/lib/db/repository/webhook-subscription.repository';
import { safeOutboundFetch } from '@/lib/workflow/ssrf-guard';
import type { IScheduledPost } from '@/lib/db/models/scheduled-post.model';

const DELIVERY_TIMEOUT_MS = 8000;

/** Minimal, safe subset of a scheduled post to send to external subscribers. */
function safePostPayload(post: IScheduledPost) {
    return {
        id: post._id?.toString?.() ?? String(post._id),
        brandId: post.brandId,
        status: post.status,
        content: post.content,
        mediaUrls: Array.isArray(post.mediaUrls) ? post.mediaUrls : [],
        platforms: Array.isArray(post.platforms)
            ? post.platforms.map((p) => ({
                  platform: p.platform,
                  platformUsername: p.platformUsername,
              }))
            : [],
        publishResults: Array.isArray(post.publishResults)
            ? post.publishResults.map((r) => ({
                  platform: r.platform,
                  success: r.success,
                  postId: r.postId,
                  postUrl: r.postUrl,
                  error: r.error,
                  publishedAt: r.publishedAt,
              }))
            : [],
        scheduledFor: post.scheduledFor,
        createdAt: post.createdAt,
    };
}

function sign(body: string, secret: string): string {
    return 'sha256=' + crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

/**
 * Emit a post lifecycle event (e.g. `post.published`, `post.failed`,
 * `post.approved`) to all matching active webhook subscriptions.
 *
 * Fire-and-forget — swallows every error so callers can `void emitPostEvent(...)`.
 */
export async function emitPostEvent(event: string, post: IScheduledPost): Promise<void> {
    try {
        // Without an org we cannot scope subscriptions (multi-tenancy hard rule).
        const subscriptions = await webhookSubscriptionRepository.listActiveForEvent({
            brandId: post.brandId,
            event,
        });

        if (!subscriptions.length) return;

        const payload = JSON.stringify({
            event,
            post: safePostPayload(post),
            timestamp: new Date().toISOString(),
        });

        await Promise.allSettled(
            subscriptions.map(async (sub) => {
                const subId = sub._id?.toString?.() ?? String(sub._id);
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
                try {
                    const res = await safeOutboundFetch(sub.url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Montrai-Event': event,
                            'X-Montrai-Signature': sign(payload, sub.secret),
                        },
                        body: payload,
                        signal: controller.signal,
                    });

                    if (res.ok) {
                        await webhookSubscriptionRepository.recordDelivery(subId, {
                            status: res.status,
                        });
                    } else {
                        await webhookSubscriptionRepository.recordFailure(subId);
                    }
                } catch {
                    // Network error, SSRF rejection, timeout — count as a failure.
                    try {
                        await webhookSubscriptionRepository.recordFailure(subId);
                    } catch {
                        /* best-effort */
                    }
                } finally {
                    clearTimeout(timer);
                }
            }),
        );
    } catch (err) {
        // Never let webhook dispatch break the publish pipeline.
        console.error('[webhook-dispatch] emitPostEvent failed:', err);
    }
}
