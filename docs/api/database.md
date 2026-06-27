# Database

> Scope: All MongoDB models and PostgreSQL usage, with relationships and ownership.
> Rendering context: Server-side
> Project tier: 4
> Last updated: 2026-06-06

## Overview

MontrAI uses two databases. MongoDB (via Mongoose) is the primary store for all application data. PostgreSQL with the pgvector extension is used for semantic embedding search (knowledge base, AI Studio). Connection to MongoDB is managed by src/lib/mongodb.ts (exports connectDB). The pgvector connection is in scripts/setup-pgvector.ts.

AGENT UPDATE: Update this file when any model is added, removed, or its relationships change.

## MongoDB — Core Platform Models

All model files live in src/lib/db/models/. Repository files in src/lib/db/repository/.

### users
Model: user.model.ts. Fields: email, username, profileName, role (user/admin/super_admin), organizationId, planId, subscriptionStatus, razorpaySubscriptionId, twoFactorEnabled, twoFactorSecret, twoFactorBackupCodes, firebaseUid, canUseOwnApiKeys, userApiKeys, status (active/suspended/deleted), crmRoleId (nullable ref CrmRole — null = legacy full-access CRM behavior). Indexed: email, organizationId. Relates to: crm_roles (via crmRoleId).

### organizations
Model: organization.model.ts. Fields: name, adminId (userId), subscriptionPlanId, memberLimit, allowedEmailDomains, members (userId array), status. Relates to: users (one-to-many via organizationId on users).

### plans
Model: plan.model.ts. Fields: name, displayName, price, billingInterval, features (PlanFeatures object), limits, allowedModels, status. Relates to: users (via planId), organizations (via subscriptionPlanId). The nested features.agent object gained two long-horizon-autonomy fields (D3, 2026-06-05): maxActiveSchedules (caps agent-created scheduled tasks + mission triggers per brand; 0 = no agent self-scheduling/hibernation, -1 = unlimited) and minWakeIntervalMinutes (floor for hibernating-mission wake cadence; default 1440 = daily). AGENT NOTE: the admin plans API only persists features.agent as of 2026-06-06 — its zod schema previously had no `agent` key, so every create/update silently stripped it (src/app/api/v2/admin/plans/route.ts).

### canvases
Model: canvas.model.ts. Fields: userId (string, NOT ObjectId), organizationId (string, optional, backfilled lazily), name, data (JSON string of {nodes, edges}), previewKey (S3 key). Indexed: userId+createdAt, userId+updatedAt. AGENT NOTE: data is a JSON string — parse with JSON.parse before use.

### unified-workflow
Model: unified-workflow.model.ts. Fields: organizationId, name, type, trigger (subType + config), nodes array, edges array, variables, credentials (encrypted), errorHandling, status, lastTriggeredAt (stamped on each dispatch — drives cooldown guards). TriggerSubTypes include record_deleted, deal_won, deal_lost, task_completed (CRM events); ActionSubTypes include find_record, delete_record, log_note; ControlSubTypes include form_input (pause for a human to submit a form — Twenty-style; creates a workflow_form_request and parks the execution). Owns: UnifiedWorkflowExecution records.

### unified-workflow-execution
Model: unified-workflow-execution.model.ts. Tracks execution state: workflowId, status (pending/running/completed/failed/paused), steps array, variables, currentNodeId, resumeFrom (resume pointer), startedAt, completedAt.

### workflow_form_requests
Model: workflow-form-request.model.ts. Interactive "form input" workflow step (Twenty-style form action). Created when a unified-workflow execution reaches a form_input control node, which then pauses the execution (ExecutionPausedForEvent on { kind: 'form_submitted', key: formRequestId }). Fields: organizationId (string), workflowId, executionId, nodeId, title, description, fields[] ({ key, label, type text/textarea/number/select/checkbox/date, options, required, placeholder }), assigneeId (ref User), status (pending/submitted/cancelled), values, submittedById, submittedAt, expiresAt. Indexed: organizationId, workflowId, executionId, assigneeId, status; compound organizationId+status+createdAt, organizationId+assigneeId+status. Submitting via POST /workflow-forms/[id]/submit resumes the parked execution.

### agent_missions
Model: agent-mission.model.ts. Fields: userId, organizationId, title, mode (mixed/approval-first/autonomous/watch/autopilot), status (draft/active/waiting/scheduled/blocked/completed), limits (maxToolCalls, maxTokens, maxWallClockMs, maxCredits, maxRetriesPerTool), usage (current counters), systemPrompt, context. Long-horizon hibernation fields (Phase 1, 2026-06-05): wakeAt (Date, indexed — when a 'scheduled' mission should resume), wakeReason, sessionStartedAt (start of the current wake session; base for the per-wake-session wall-clock budget enforced in checkWallClock, not per mission lifetime), wakeCount. Hibernation reuses status 'scheduled'. Related: agent_mission_events, agent_mission_links, pending_agent_actions.

### agent_mission_events
Model: agent-mission-event.model.ts. Append-only event log per mission. Each event has type, role (user/assistant/tool), content, toolCallId.

### agent_mission_links
Model: agent-mission-link.model.ts. Links mission outputs to platform resources (canvases, documents, contacts, etc.). Fields: missionId, resourceType, resourceId, label.

### pending_agent_actions
Model: pending-agent-action.model.ts. HITL approval queue. Fields: missionId, toolName, toolInput, status (pending/approved/rejected/expired), approvedAt.

### agent_scheduled_tasks
Model: agent-scheduled-task.model.ts. Scheduled execution of missions. Fields: missionId, cronExpression, nextRunAt, lastRunAt.

### agent_strategies
Model: strategy.model.ts. Long-running agent strategies. Org-scoped via orgId (+ brandId). Indexed: orgId+brandId+status, orgId+brandId+createdAt. Owns: agent_strategy_roadmaps.

### agent_strategy_roadmaps
Model: strategy-roadmap.model.ts. Roadmap/milestones for a strategy. Org-scoped via orgId+brandId. Depends on: strategy.

### agent_memories
Model: agent-memory.model.ts. Persistent agent memory. Fields: organizationId, brandId, expiresAt (TTL index). Indexed: organizationId+brandId+updatedAt.

### agent_sessions
Model: agent-session.model.ts. Active agent session per user/brand. Indexed: userId+brandId (unique), lastActivityAt (TTL, 2h expiry).

### agent_mission_triggers
Model: mission-trigger.model.ts. Event-driven triggers that start missions. Fields: organizationId, brandId, eventType, missionMode (mixed/approval-first/autonomous/watch/autopilot, default mixed — an 'autonomous' trigger dispatches the mission runner immediately on fire). Indexed: organizationId+brandId+eventType. eventType enum (Phase 2, 2026-06-05) extends the lifecycle set with inbound-channel events: whatsapp.message_received, message.received, ai_bot.escalation_requested, ads.lead_captured, meeting.booked, voice.call_completed.

### agent_recurring_mission_configs
Model: recurring-mission-config.model.ts. Schedules for recurring missions. Fields: organizationId, brandId. Indexed: organizationId+brandId.

### agent_control_bindings
Model: agent-control-binding.model.ts (G12, 2026-06-05). Binds an owner's personal WhatsApp phone to their MontrAI user so they can drive the agent (status/approve/reject/goal) over WhatsApp — the binding IS the security boundary, since webhook traffic is identified only by phone number. Fields: organizationId, userId, brandId (optional), whatsappAccountId (the brand WhatsApp account used to converse with the owner), phone (digits-only E.164, no '+', matches the Meta webhook `from`), status (pending/active/revoked). Pairing: pairingCodeHash (sha256), pairingExpiresAt (10-min TTL), pairingAttempts (max 3). Approval numbering: approvalMap[{ index, actionId }] + approvalMapExpiresAt (1h). Rate limiting: windowStart/windowCount (20 commands/hour). Plus pairedAt, lastUsedAt. Indexed: organizationId+phone (unique — one binding per phone per org), phone+status. AGENT SEE: docs/api/route-handlers-part1.md — /api/v2/agent/control-channel pairing API; activation happens in the WhatsApp webhook divert.

### approval_requests
Model: approval-request.model.ts. Generic HITL approval queue (broader than pending_agent_actions). Fields: organizationId, brandId, status, priority, assignee, subjectKind, subjectId. Indexed: organizationId+status+priority+createdAt, organizationId+brandId+status, organizationId+assignee+status, subjectKind+subjectId (unique sparse). AGENT SEE: docs/api/route-handlers-part1.md — agent approvals routes.

### documents
Model: document.model.ts. TipTap documents. Fields: userId, organizationId, title, content (JSON), folderId. Indexed: organizationId.

### forms
Model: form.model.ts. Form definitions. Related: form_submissions, form_versions, form_collaborators, form_templates.

### social_accounts
Model: social-account.model.ts. Connected social media accounts. Fields: userId, organizationId, platform, accessToken, refreshToken, accountId, accountName.

### integration_connections
Model: integration-connection.model.ts. Connected business-tool accounts for the integrations hub (Mailchimp, HubSpot, Airtable, Zoho, Webflow, Blogger, Apollo, Semrush, RevenueCat, n8n, Shopify, WordPress). Fields: organizationId (required), brandId (optional — hybrid scoping), provider, authType, encryptedCredentials (AES-256-GCM JSON blob, select:false), tokenExpiresAt, scopes, externalAccountId/Name, status (connected/expired/error), lastError, metadata (provider extras: dc, apiDomain, region, shop), connectedBy. Indexed: organizationId+provider, organizationId+brandId+provider, tokenExpiresAt (sparse — scanned by the token-refresh cron). AGENT SEE: docs/api/external-services.md — Integrations Hub section.

### doc_sync_links
Model: doc-sync-link.model.ts. Links a document to a Notion page for syncing. Fields: documentId (unique — one link per doc), organizationId, userId, socialAccountId (Notion token source), externalId (Notion page id), direction (pull/push/two_way), lastSyncedAt, externalLastEditedAt, localUpdatedAt (high-water marks), syncStatus, lastError. Indexed: documentId (unique), organizationId+provider, provider+syncStatus. AGENT SEE: docs/api/external-services.md — Notion Doc Sync section.

### integration_import_records
Model: integration-import-record.model.ts. Staging store for Mailchimp/HubSpot data imports (deliberately NOT the CRM — imported contacts must never land in CRM models). Fields: organizationId (required), brandId (optional), connectionId, provider, recordType (contact/company/deal/audience_member), externalId, externalListId, email, name, data (Mixed — full normalized record), importedAt, lastSyncedAt. Unique index: organizationId+provider+recordType+externalId. Written by src/lib/integrations/import/import-service.ts via the [id]/import route.

### ad_accounts
Model: ad-account.model.ts. Connected Google Ads / Meta ad accounts for the Ads module. Fields: organizationId, brandId, userId (connector), platform (google_ads/meta_ads), externalAccountId (digits, no act_ prefix), accountName, currencyCode, timezone, encryptedAccessToken/encryptedRefreshToken (AES-256-GCM, select:false), tokenExpiresAt, scopes, webhookKey (google_ads only — the lead-form "Google key", sparse-unique), isActive, lastSyncedAt, lastError, googleMetadata (loginCustomerId for MCC children, isManager, isTestAccount), metaMetadata (businessId/Name, accountStatus). Unique: platform+externalAccountId. AGENT SEE: docs/modules/ads-analytics.md.

### analytics_sources
Model: analytics-source.model.ts. Connected GA4 properties / Search Console sites (read-only data sources). Fields: organizationId, brandId, userId, sourceType (ga4/search_console), externalId (GA4 property ID / GSC siteUrl), displayName, encrypted Google tokens (select:false), tokenExpiresAt, scopes, isActive, lastSyncedAt, lastError, metadata (accountName/permissionLevel). Unique: sourceType+externalId.

### metrics_snapshots
Model: metrics-snapshot.model.ts. Unified analytics time-series: one document per entity × day. Fields: organizationId, brandId, sourceType (meta_ads/google_ads/ga4/search_console/youtube/facebook/instagram/threads/linkedin/tiktok/x), sourceId (owning connection _id), entityType (account/campaign/adset/ad/page/channel/property/site/query/page_path/channel_group), entityId, entityName, parentEntityId (breakdown rows point at their parent), date ('YYYY-MM-DD'), metrics (Mixed — additive values only; ratios computed at query time; GSC position is an average, never summed). Unique: sourceId+entityType+entityId+date. Written by src/lib/analytics/fetchers/ via bulk upsert; queried by /api/v2/analytics/*.

### ad_leads
Model: ad-lead.model.ts. Every lead delivered by the Meta Lead Ads / Google lead-form webhooks. Fields: organizationId, brandId, platform, adAccountId, externalLeadId, campaignId/Name, adsetId, adId, formId/Name, pageId, isTest, fields (Mixed — raw answer map), extracted email/phone/firstName/lastName, contactId (resolved CRM contact), status (received/synced/failed/skipped), error, receivedAt, syncedAt. Unique: platform+externalLeadId (webhook dedupe).

### ad_lead_field_maps
Model: ad-lead-field-map.model.ts. Per-form mapping from custom lead-form question keys to CRM identity slots (firstName/lastName/email/phone). Consulted by src/lib/ads/crm-intake.ts before the generic heuristics. Unique: organizationId+platform+formId.

### ad_write_audits
Model: ad-write-audit.model.ts. Audit row for EVERY ads-platform write (guardrail: create-only, PAUSED). Fields: organizationId, brandId, userId (the acting user), adAccountId, platform, operation, request (sanitized — never tokens), result (platform IDs), status (success/error), error.

### scheduled_posts, drafts, recurring_posts
Models for social media content planning. All keyed by userId and organizationId.

### credit_usages
Model: credit-usage.model.ts. Per-user credit periods. Fields: userId, periodStart, periodEnd, creditsUsed, creditsLimit, history array.

### inbox_channels, inbox_conversations, inbox_messages, inbox_members, inbox_labels
Models for the omnichannel inbox. Channel types: whatsapp, email, webchat, telegram, instagram, facebook, sms, and others.

### knowledge_base
Model: knowledge-base.model.ts. AI knowledge base records. Related to pgvector embeddings for semantic search.

### marketing_email models
In src/lib/db/models/marketing-email/. Campaign, template, contact list, send records.

### Notification models
notification.model.ts (notifications) — per-user in-app notifications. Fields: userId, organizationId (optional), category, read, dedupeKey, source, expiresAt. Indexed: userId+read+createdAt, userId+category+createdAt, dedupeKey (unique sparse), expiresAt (TTL). AGENT NOTE: dedupeKey guards against double-delivery (domain-bus delivers in-process and via Redis).
notification-broadcast.model.ts (notification_broadcasts) — admin broadcast records. Indexed: createdAt.
notification-preference.model.ts (notification_preferences) — per-user channel preferences (in-app/email/etc.).

### AI models
ai-bot.model.ts (ai_bots) — conversational AI bots. Fields: organizationId, brandId, status, aiCharacterId (optional), escalation/routing config. Indexed: organizationId+brandId+status, organizationId+updatedAt, aiCharacterId (sparse). AGENT SEE: docs/api/external-services.md — AI-bot runtime delegates to src/ai/client.ts.
ai-bot-conversation-state.model.ts (ai_bot_conversation_states) — per-conversation bot turn state. Fields: organizationId, channel, turns, lastTurnAt. Indexed: organizationId+channel+lastTurnAt.
ai-character.model.ts (ai_characters) — talking-avatar / character definitions (voice, avatar, reference images). Fields: organizationId, brandId, status. Indexed: organizationId+brandId+status, organizationId+updatedAt.
ai-studio-project.model.ts (ai_studio_projects) — AI Studio workspaces. Fields: organizationId, brandId, kind, status, sessions. Indexed: organizationId+brandId+kind+status, organizationId+updatedAt, sessions.batchId.
custom-model.model.ts (custom_model) — user/admin-configured OpenRouter models. AGENT SEE: docs/api/external-services.md — model-registry.
model-override.model.ts (model_overrides) — platform model override rules. Indexed: isEnabled.

### Brand models
brand.model.ts (brands) — brand records. Fields: userId, organizationId (optional), handle. Indexed: userId+handle (unique). Owns: brand_contexts.
brand-context.model.ts (brand_contexts) — per-brand context/knowledge. Fields: brandId, organizationId. Optional voiceCallPolicy (D4, 2026-06-05): { mode (always_ask/always_autonomous/conditional), conditions { autonomousPurposes[], knownContactsOnly, businessHoursOnly } } — the per-brand HITL policy for outbound voice calls (initiate_call/schedule_call/bulk_call), resolved in src/lib/agent/hitl-gateway.ts above the brand requireApproval overrides. Indexed: brandId (unique), organizationId.

### canvas_template_reviews
Model: canvas-template-review.model.ts. Reviews/ratings for canvas templates. Fields: templateId, userId, rating. Indexed: templateId+userId (unique), templateId+rating, templateId+createdAt. AGENT SEE: docs/api/route-handlers-part1.md — canvas-templates reviews routes.

### Voice models
In src/lib/db/models/voice/. All org-scoped via organizationId (+ brandId).
call-session.model.ts (voice_call_sessions) — one row per call; disposition, timing. Indexed: organizationId+startedAt, brandId+startedAt.
call-transcript.model.ts (voice_call_transcripts) — transcript segments per call. Indexed: callSessionId (unique).
voice-phone-number.model.ts (voice_phone_numbers) — provisioned numbers + inbound routing. Indexed: organizationId+brandId+status.
voice-provider-config.model.ts (voice_provider_configs) — encrypted telephony/provider credentials at system/org/brand/user scope. Indexed: scope+providerId+organizationId+brandId+userId (unique). AGENT SEE: docs/api/external-services.md — Twilio credentials sourced here, not from env.
voice-bulk-batch.model.ts (voice_bulk_batches) — bulk outbound call batches. Indexed: organizationId+createdAt, organizationId+status+createdAt.

### Media, Docs, Social-content, and Misc models
media-asset.model.ts (media_assets, brand-scoped; text index on name/tags/altText), media-folder.model.ts (media_folders, brand-scoped). doc-collaborator.model.ts (doc_collaborators), doc-template.model.ts (doc_templates), doc-version.model.ts (doc_versions, unique docId+version). post-approval.model.ts (post_approvals, organizationId+status), post-template.model.ts (post_templates, brand-scoped), draft.model.ts (post_drafts, userId/brandId). marketing-plan.model.ts (marketing_plans, organizationId; unique userId+brandId). system-settings.model.ts (system_settings, singleton). user-storage.model.ts (user_storage). otp.model.ts (otps). admin-audit-log.model.ts (admin_audit_logs; entity+entityId+createdAt, actorUserId+createdAt). activity-log.model.ts (activity_logs, organizationId-scoped). analytics.model.ts (post_analytics + brand_analytics_summaries, brand-scoped). conversation.model.ts (conversations, userId-scoped). design.model.ts (designs, userId-scoped). workflow-template.model.ts (workflow_templates, global marketplace; organizationId optional). workflow-execution.model.ts (workflow_executions, legacy CRM/WhatsApp execution log; workflowId+startedAt index).

### WhatsApp models
whatsapp-account.model.ts, whatsapp-campaign.model.ts, whatsapp-conversation.model.ts, whatsapp-message.model.ts, whatsapp-template.model.ts, whatsapp-contact-group.model.ts, and supporting models.

whatsapp-workflow.model.ts — node-based WhatsApp workflows. Fields: userId, organizationId (optional, indexed — backfilled lazily), accountId, name, trigger, nodes, status (draft/active/paused/archived). Indexed: userId+status, organizationId+status (compound), accountId+status, trigger.type+status.

WhatsApp auxiliary models: whatsapp-auto-reply.model.ts (organizationId+whatsappAccountId+isActive index), whatsapp-contact-group-member.model.ts (organizationId; unique groupId+contactId), whatsapp-custom-field.model.ts (organizationId; unique whatsappAccountId+fieldKey), whatsapp-custom-field-value.model.ts (organizationId; unique fieldId+contactId).

## MongoDB — CRM Models (prefix: crm_)

All in src/lib/db/models/crm/. All have organizationId (required, indexed). AGENT SEE: docs/modules/crm.md.

crm_contacts, crm_companies, crm_deals, crm_pipelines (with embedded stages), crm_activities, crm_tags, crm_custom_fields, crm_imports, crm_views, crm_favorites, crm_comments, crm_attachments, crm_workflows, crm_webhooks, crm_email_accounts, crm_emails, crm_calendar_accounts, crm_calendar_events, crm_audit_logs.

AGENT NOTE: contact, company, deal, and activity models gained soft-delete fields deletedAt + deletedById, plus a partial index { organizationId, deletedAt } that only indexes soft-deleted rows (powers org-scoped trash queries). Hard deletion is deferred to the crm-trash-purge cron — see docs/state/server-state.md.

AGENT NOTE: crm_views (view.model.ts) gained openRecordIn (panel/page — record-open behavior), filterTree (Mixed — nested AND/OR filter groups; wins over the legacy flat filters[]), and a wired groupBy. crm_email_accounts (email-account.model.ts) gained autoCreateContacts and autoCreateCompanies (default false; complements autoLinkContacts). crm_workflows (workflow.model.ts) is the legacy trigger-action engine, now deprecated — it gained migratedToUnifiedId (ref UnifiedWorkflow) marking docs wound down to the unified engine.

### crm_contacts (multi-value identity)
Model: contact.model.ts. In addition to scalar email/phone/phoneNormalized, contacts carry emails[] (value/label/primary) and phones[] (value/normalized/label/primary) subdocs — Twenty-style multi-value identity. The entry flagged primary mirrors the scalar fields, synced in the repository layer via normalizeContactIdentityFields (src/lib/crm/contact-identity.ts). Indexed: organizationId+email (unique sparse — PRIMARY/scalar only; multi-value secondaries are intentionally NOT globally unique), organizationId+emails.value (non-unique "match any email"), organizationId+phones.normalized.

### crm_dedupe_rules
Model: crm/dedupe-rule.model.ts. Declarative duplicate-detection rules per entity (Twenty duplicateCriteria equivalent). Fields: organizationId, entityType (contact/company/deal), criteria (OR list of { fields[] } criteria — each criterion's fields are AND'd), isActive. Unique: organizationId+entityType (one rule doc per org + entity).

### crm_record_links
Model: crm/record-link.model.ts. Generic polymorphic any↔any link between two CRM records (Twenty MORPH_RELATION equivalent); additive — direct FKs (deal.contactId, contact.companyId) remain canonical. Fields: organizationId, sourceType/sourceId, targetType/targetId (each type contact/company/deal), linkType (free-form: related/referred_by/parent/child/duplicate_of/custom), createdById (ref User). Indexed: organizationId+sourceType+sourceId, organizationId+targetType+targetId (reverse lookups); unique on organizationId+source+target+linkType (dedupe links). Relates to: crm_contacts/crm_companies/crm_deals (polymorphic both sides).

### crm_blocklist
Model: crm/blocklist.model.ts. Email-sender blocklist consulted by the email-sync pipeline before auto-linking / auto-creating contacts. Fields: organizationId, pattern (lowercased full email or '@domain.com'), reason, createdById (ref User). Unique: organizationId+pattern. AGENT NOTE: collection name is crm_blocklist (singular). Read on every synced inbound message via a 60s in-process cache — see docs/state/server-state.md.

### crm_record_layouts
Model: crm/record-layout.model.ts. Per-org record-detail layout config (Twenty PageLayout-lite) — order/visibility/column of EXISTING sections on contact/company/deal detail pages. Fields: organizationId, entityType (contact/company/deal), sections[] ({ key, visible, order, column main/side }), updatedById. Unique: organizationId+entityType. Section key catalog: src/components/crm/shared/record-layout-sections.ts.

### crm_dashboards
Model: crm/crm-dashboard.model.ts. Per-USER CRM overview dashboard config (Twenty Dashboard-lite) — order/visibility of EXISTING widgets on /crm. Fields: organizationId, userId, widgets[] ({ key, visible, order }). Unique: organizationId+userId (dashboards are personal; org still scopes data). Widget key catalog: src/components/crm/dashboard/widget-catalog.ts.

### crm_roles
Model: crm/role.model.ts. CRM RBAC — org-scoped roles with per-entity object permissions (modeled on Twenty Role/ObjectPermission, scoped to CRM). organizationId is a string here. Fields: organizationId, name, description, isSystem, permissions (per-entity contact/company/deal/activity: read/update/delete scope all|own|none, create/export boolean), canManageSettings. Unique: organizationId+name. Seeded defaults exported as DEFAULT_CRM_ROLES (Admin, Member, Read only). Relates to: users (via user.crmRoleId ref CrmRole).

## PostgreSQL

Used exclusively for pgvector embeddings. Connection configured in scripts/setup-pgvector.ts. Embedding tables: one per knowledge base entry. Not accessed via Mongoose — raw pg client (pg package).

## Migration Strategy

No formal ORM migrations. Schema changes to MongoDB are handled by adding fields with defaults (Mongoose handles gracefully). Index additions are applied via model file changes and run on next process boot. One-off data migrations use the scripts/ directory (tsx scripts/<name>.ts).

AGENT NOTE: There is no automated migration runner. Schema changes must be backward-compatible (new fields with defaults) or require a manual one-off script in scripts/.

## Related Docs

- docs/auth/authorization.md — organizationId enforcement
- docs/modules/crm.md — CRM model details
- docs/infra/environment.md — MONGODB_URI, MONGODB_DB_NAME, DATABASE_URL (PostgreSQL)
