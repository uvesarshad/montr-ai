/**
 * Typed analytics event catalog.
 *
 * Single source of truth for PostHog event names shared by the client
 * provider and the server-side capture client. Keep this set TIGHT to
 * control free-tier event volume — add a new name here before using it.
 *
 * NOTE: This module is pure types/constants. It must NOT import any
 * PostHog SDK so it can be safely imported from both client and server.
 */

export const ANALYTICS_EVENTS = {
  USER_SIGNED_UP: 'user_signed_up',
  USER_LOGGED_IN: 'user_logged_in',
  WORKFLOW_EXECUTED: 'workflow_executed',
  CAMPAIGN_SENT: 'campaign_sent',
  SOCIAL_POST_PUBLISHED: 'social_post_published',
  PLAN_UPGRADED: 'plan_upgraded',
  CREDITS_CONSUMED: 'credits_consumed',
  AI_GENERATION: 'ai_generation',
} as const;

/** Union of all valid analytics event names. */
export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

/**
 * Properties attached to an analytics event.
 *
 * `organizationId` should ALWAYS be attached (for multi-tenant grouping —
 * it drives the PostHog `organization` group on the server). Everything
 * else is free-form.
 */
export type AnalyticsProperties = Record<string, unknown> & {
};
