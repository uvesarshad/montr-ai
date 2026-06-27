# WhatsApp Module

> Scope: WhatsApp messaging, campaigns, automation, and template management.
> Rendering context: Client-side
> Project tier: 4
> Last updated: 2026-06-04

## Overview

The WhatsApp module manages WhatsApp Business API connections, contact groups, bulk campaign sending, template management, workflow automation, conversation routing, and compliance. It integrates with the Omnichannel Inbox for inbound messages. WhatsApp workflows use the older per-module workflow model (whatsapp-workflow.model.ts) rather than the unified engine.

AGENT NOTE: WhatsApp workflows use whatsapp-workflow.model.ts (the legacy per-module model), not unified-workflow.model.ts. The unified workflow engine handles send_whatsapp_text and similar action nodes but the WhatsApp automation builder at the UI level targets the legacy model.

## Entry Points

- src/app/(app)/marketing/whatsapp/ — WhatsApp campaigns, templates, contact groups.
- src/app/api/v2/ — WhatsApp account, campaign, template, and conversation API routes.
- src/app/api/v2/inbox/webhook/whatsapp — Inbound message webhook (public, signature-verified).

## Data Models (src/lib/db/models/)

whatsapp-account.model.ts — Connected WhatsApp Business accounts. Fields: organizationId, phoneNumberId, businessAccountId, accessToken (encrypted), verifyToken, status.

whatsapp-campaign.model.ts — Bulk campaigns. Fields: organizationId, accountId, name, templateId, contactGroupId, status, scheduledAt, sentCount, failedCount.

whatsapp-conversation.model.ts — Per-contact conversation threads in WhatsApp. Fields: organizationId, accountId, contactId, status, lastMessageAt.

whatsapp-message.model.ts — Individual messages. Fields: conversationId, direction (inbound/outbound), content, mediaUrl, status (sent/delivered/read/failed), platformMessageId.

whatsapp-template.model.ts — Approved message templates. Fields: organizationId, accountId, name, language, category, components (header/body/footer/buttons), status.

whatsapp-workflow.model.ts — WhatsApp automation flows. Fields: userId, organizationId (optional, indexed), accountId, name, trigger, nodes, edges, variables, status. Stores nodes and edges as arrays of subdocuments — the same shape as unified-workflow.model.ts. AGENT NOTE: The single-JSON-string storage (one `data` field holding {nodes, edges}) is a quirk of the canvas model only; neither whatsapp-workflow nor unified-workflow uses it.

whatsapp-contact-group.model.ts — Contact groups for bulk sending. Fields: organizationId, name, memberCount.

whatsapp-contact-group-member.model.ts — Individual group members. Fields: groupId, contactId or phoneNumber.

whatsapp-custom-field.model.ts / whatsapp-custom-field-value.model.ts — Custom metadata fields per WhatsApp contact.

whatsapp-auto-reply.model.ts — Keyword-triggered auto-reply rules.

## Repositories (src/lib/db/repository/)

whatsapp-account.repository.ts, whatsapp-campaign.repository.ts, whatsapp-conversation.repository.ts, whatsapp-message.repository.ts, whatsapp-template.repository.ts, whatsapp-workflow.repository.ts, whatsapp-contact-group.repository.ts, whatsapp-contact.repository.ts, whatsapp-custom-field.repository.ts, whatsapp-auto-reply.repository.ts.

## WhatsApp API Integration

API calls to the WhatsApp Business API (Meta Graph API) are handled by src/lib/whatsapp/providers/ and related service files. Credentials: WHATSAPP_API_KEY, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_BUSINESS_ACCOUNT_ID.

Inbound webhooks: received at /api/v2/inbox/webhook/whatsapp. Webhook verify token checked via WHATSAPP_WEBHOOK_VERIFY_TOKEN. Provider signature validated before processing.

## Campaign Sending

Campaign jobs are enqueued via BullMQ (src/lib/queue/whatsapp-queue.ts). The worker processes send jobs in batches, respecting WhatsApp's rate limits per phone number. Failed sends are retried with exponential backoff.

## Template Management

Templates are submitted to the WhatsApp Business API for approval. Template status is synced and stored in whatsapp_templates. Only approved templates can be used in campaigns.

## Compliance

src/lib/whatsapp/compliance.ts enforces opt-out handling, message frequency limits, and prevents sending to blocked numbers.

AGENT UPDATE: Update this file when the WhatsApp account model changes, when new campaign types are added, or when the inbound webhook processing changes.

## Related Docs

- docs/modules/inbox.md — Inbound WhatsApp message handling
- docs/api/external-services.md — WhatsApp API credentials
- docs/modules/canvas.md — Canvas send_whatsapp_text node processor
