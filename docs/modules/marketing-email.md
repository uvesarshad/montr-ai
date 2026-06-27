# Marketing Email Module

> Scope: Marketing email campaigns — templates, sending, tracking, and delivery providers.
> Rendering context: Client-side
> Project tier: 4
> Last updated: 2026-06-04

## Overview

The Marketing Email module manages campaign creation, template design, audience targeting (per-campaign via tags/segments/filters), bulk sending via multiple email providers (SES, Brevo, SMTP), and open/click tracking. It integrates with the Canvas workflow engine (send_marketing_email node) for automated sequences.

## Entry Points

- src/app/(app)/marketing/email/ — Email campaign pages.
- src/app/api/v2/marketing-email/ — Campaign, template, and tracking API.
- src/app/api/v2/marketing-email/track/ — Open/click tracking pixels (public, no auth).

## Data Models (src/lib/db/models/marketing-email/)

Subdirectory in src/lib/db/models/marketing-email/ for marketing email models (campaign, provider, suppression, template, tracking). Key models:
- campaign.model.ts (MarketingCampaign) — Fields: organizationId, providerId, templateId, name, subject, status (draft/scheduled/sending/sent/paused/failed/completed/cancelled), targetType (all_contacts/segment/tags/custom_filter), targetTags, targetFilter, excludeTags, totalRecipients, scheduledAt, batchSize, stats (sent/delivered/opened/clicked/bounced/complained/unsubscribed). Owns its own targeting — there is no separate contact-list model.
- template.model.ts (MarketingTemplate) — Reusable email templates (html/text content + variables).
- provider.model.ts (MarketingProvider) — Per-organization email provider configuration (SES/Brevo/SMTP credentials).
- suppression.model.ts (MarketingSuppression) — Suppressed addresses (unsubscribes/bounces/complaints) excluded from sends.
- tracking.model.ts (MarketingTracking) — Per-recipient delivery and engagement events (sent/delivered/opened/clicked/bounced).

## Email Providers (src/lib/marketing-email/providers/)

Provider factory (provider-factory.ts) selects the active provider based on organization settings or global config.

ses-provider.ts — Amazon SES. Credentials: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, SES_FROM_EMAIL.
brevo-provider.ts — Brevo (Sendinblue) API. Credential: BREVO_API_KEY.
smtp-provider.ts — Generic SMTP. Credentials: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS.
base-provider.ts — Abstract base class all providers extend.

## Tracking

A single route handler at src/app/api/v2/marketing-email/track/[type]/route.ts serves both open and click tracking (server-side GET). The route reads from a base64-encoded `data` query parameter (decoded format: orgId:campaignId:contactId:email:providerId, with an appended url for clicks) and delegates to trackingService.recordEvent.

Open tracking: type=open returns a transparent 1x1 GIF and records an "opened" event.

Click tracking: type=click records a "clicked" event and redirects (NextResponse.redirect) to the decoded target URL.

The tracking endpoint is public (no auth required) and is listed in publicRoutes in middleware.ts.

## Sending Flow

1. Campaign is created with a template and audience targeting (targetType + targetTags/targetFilter, minus excludeTags and suppressed addresses).
2. User schedules or triggers sending.
3. Route handler enqueues a BullMQ job (marketing email send job).
4. Worker processes the job: resolves recipients from the campaign targeting, applies template variable substitution, calls the active email provider's send method.
5. Tracking data (base64-encoded into the open pixel and rewritten links) is injected before sending.
6. The campaign stats counters and per-recipient tracking records are updated as delivery and engagement events arrive.

## Canvas Integration

The send_marketing_email node processor (src/lib/workflow/node-processors/marketing-email/send-email.ts) triggers a marketing email send from a Canvas workflow. It reads the template and provider from the organizationId-scoped marketing email models.

AGENT NOTE: The marketing email processor fetches the template and provider by organizationId from the database. It does not use a global shared provider — each organization can have its own email provider configuration.

AGENT UPDATE: Update this file when a new email provider is added, when the tracking mechanism changes, or when the campaign sending flow changes.

## Related Docs

- docs/api/external-services.md — SES, Brevo, SMTP credentials
- docs/modules/canvas.md — send_marketing_email node processor
- docs/state/server-state.md — BullMQ send job
