import 'server-only';
import { PostHog } from 'posthog-node';
import type { AnalyticsEvent, AnalyticsProperties } from './events';

/**
 * Server-side PostHog client (posthog-node) as a lazy singleton.
 *
 * No-ops cleanly when NEXT_PUBLIC_POSTHOG_KEY is unset (the dev default):
 * getClient() returns null and every exported helper becomes a silent no-op.
 * All calls are wrapped so analytics can never throw into business logic.
 */

let client: PostHog | null = null;

function getClient(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null; // no-op when unconfigured
  if (!client) {
    client = new PostHog(key, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
      flushAt: 20,
      flushInterval: 10000,
    });
  }
  return client;
}

/**
 * Capture a backend analytics event for the given user.
 * Always attach `properties.organizationId` so the event is grouped under
 * the correct tenant. Never throws.
 */
export function captureServerEvent(
  distinctId: string,
  event: AnalyticsEvent,
  properties?: AnalyticsProperties,
): void {
  try {
    getClient()?.capture({
      distinctId,
      event,
      properties,
      groups: undefined,
    });
  } catch {
    // Analytics must never break the request path.
  }
}

/**
 * Flush and shut down the client (call from process shutdown hooks).
 * Safe to call when the client was never initialized.
 */
export async function shutdownPostHog(): Promise<void> {
  await client?.shutdown().catch(() => {});
}
