# Ads & Analytics Modules

> Scope: Paid ads management (Google Ads, Meta Ads), lead capture into the CRM, and the cross-source analytics hub (GA4, Search Console, account-level social).
> Rendering context: Client-side
> Project tier: 4
> Last updated: 2026-06-05 (rev 2 — field mapping, notifications, weekly summary)

## Overview

Two sibling modules built on one shared metrics store (built 2026-06-04/05; full plan + decision history in docs/archive or repo `docs/ads-analytics-plan.md`):

- **Ads** (`/ads`) — connect Google Ads / Meta ad accounts, view campaign insights, capture leads from Meta Lead Ads and Google lead forms into the CRM, generate ad copy with AI, and create campaigns through a guided wizard.
- **Analytics** (`/analytics`) — cross-source insights: GA4 traffic, Search Console queries, account-level social metrics, and ads spend, all read from the unified `metrics_snapshots` time-series.

HARD GUARDRAIL (product decision, do not relax): **platform writes are create-only and everything is created PAUSED.** There is no update/delete/pause-toggle anywhere; AI only recommends; the user activates campaigns in the native platform UI. Rationale: automated mutations risk users' ad accounts being banned.

## Entry Points

- src/app/(app)/ads/ — Overview, Campaigns (+ `[platform]/[entityId]` detail, `new` wizard), Leads, Creatives, Accounts.
- src/app/(app)/analytics/ — Overview, Traffic (GA4), Search (GSC), Social, Sources.
- src/app/api/ads/oauth/ — ads OAuth (google-ads, meta-ads init/callback + shared assets/select picker routes).
- src/app/api/analytics/oauth/ — GA4/Search Console OAuth (dynamic `[source]` init/callback + assets/select).
- src/app/api/v2/ads/ — accounts, leads (+ retry), lead-field-maps, campaigns (create-only), generate-copy, generate-creative (AI ad image → storage, 24h presigned URL — platforms cache creatives on ad creation), recommendations.
- Workflow node: `adsInsightsNode` (data category, processor `data_ads_insights`) — read-only metrics-store pull (totals + per-entity table + AI-ready text summary); tenant scope from the workflow record.
- Agent tools: reads (src/lib/agent/tools/ads-tools.ts, hitl 'never'): `get_ads_insights`, `get_marketing_analytics`, `get_ad_leads`. Write (ads-write-tools.ts, decision D1): `list_ad_accounts` + `create_ad_campaign` (hitl 'always' — approval card shows the full draft, same Zod schema as the wizard API, routes to createCampaignFromSpec → create-only PAUSED write-ops). Approved HITL card = the guardrail's "explicit user action". Wired into the marketing/strategy specialist agents.
- src/app/api/v2/analytics/ — sources, summary, timeseries, breakdown, sync.
- src/app/api/webhooks/meta-leads/ + google-leads/ — public lead-capture webhooks.

## Data Models

- ad-account.model.ts (AdAccount, `ad_accounts`) — platform (google_ads|meta_ads), externalAccountId (digits, no `act_` prefix), AES-256-GCM encrypted tokens (select:false), organizationId + brandId + userId, currency/timezone, `webhookKey` (google_ads: the lead-form "Google key", sparse-unique), googleMetadata.loginCustomerId (MCC header), metaMetadata. Unique (platform, externalAccountId).
- analytics-source.model.ts (AnalyticsSource, `analytics_sources`) — sourceType (ga4|search_console), externalId (GA4 property ID / GSC siteUrl), encrypted Google tokens. Unique (sourceType, externalId).
- metrics-snapshot.model.ts (MetricsSnapshot, `metrics_snapshots`) — one doc per entity × day: {organizationId, brandId, sourceType, sourceId, entityType, entityId, entityName, parentEntityId, date 'YYYY-MM-DD', metrics{}}. Breakdown rows (GSC query, GA4 channel group/landing page, ad sets/ads) are entities with parentEntityId. Only ADDITIVE metrics stored; ratios (CTR/CPC) computed at query time; GSC `position` is an average — never sum it. Unique (sourceId, entityType, entityId, date).
- ad-lead.model.ts (AdLead, `ad_leads`) — every webhook delivery: platform IDs, raw `fields` map, extracted identity (email/phone/name), CRM status (received|synced|failed|skipped) + error, contactId. Dedupe unique (platform, externalLeadId).
- ad-lead-field-map.model.ts (AdLeadFieldMap, `ad_lead_field_maps`) — per-form mapping from custom question keys to CRM identity slots; unique (organizationId, platform, formId). Managed from the Ads ▸ Leads "Field mapping" card via GET/PUT /api/v2/ads/lead-field-maps.
- ad-write-audit.model.ts (AdWriteAudit, `ad_write_audits`) — one row per platform write: user, account, operation, sanitized request, result, status.

## Key Libraries

- src/lib/ads/ — OAuth helpers (google-ads-oauth.ts REST/GAQL + MCC discovery, meta-ads-oauth.ts long-lived token exchange, ads-oauth-picker.ts), **token-refresh.ts** (ALL fetcher token access goes through `getFreshAdAccountToken`/`getFreshAnalyticsSourceToken`), crm-intake.ts (lead → X2 identity resolver → contact source 'ads' + activity), meta-leads.ts (webhook processing; page-token → ad-account-token fallback), recommendations.ts (AI insights, read-only), campaign-creation.ts (wizard orchestration), **write-ops/** (the ONLY allowed write surface — allowlist barrel, PAUSED hardcoded, every op audited).
- src/lib/analytics/ — analytics-oauth(-picker).ts, **fetchers/** registry (meta-ads, google-ads, ga4, search-console, youtube-channel with scope-fallback snapshot, social-accounts: FB page/IG/Threads daily + LinkedIn/TikTok follower snapshots; X = free-tier snapshot always, plus per-day post metrics incl. impressions when X_API_TIER=basic — 30-day window cap), sync-service.ts, api-helpers.ts.
- src/ai/flows/generate-ad-copy-flow.ts — format-aware copy (RSA ≤15×30ch / ≤4×90ch with over-limit lines dropped; Meta variants), BrandContext voice, credit-checked.

## Sync & Scheduling

BullMQ queue `source-metrics-sync` (cron `30 */6 * * *`, 3-day re-pull window for late attribution data) registered in scripts/workflow-worker.ts via createSourceMetricsSyncWorker. Connecting a source enqueues a one-off 90-day backfill. Manual: POST /api/v2/analytics/sync (org-scoped). Fetchers record lastSyncedAt/lastError on their connection docs.

## Lead Capture Flow

1. Meta: `leadgen` page webhook → signature check (FACEBOOK_APP_SECRET; dev fails open when unset, prod fails closed) → fetch /{leadgen_id} via connected FB Page token or any connected Meta ad-account token → AdLead. Handler ALWAYS returns 200 so Meta never disables the subscription.
2. Google: lead form posts JSON with `google_key` == AdAccount.webhookKey (auth + routing in one) → AdLead. Unknown key → 403.
3. ingestAdLeadToCrm: identity resolution order is **per-form field map → stored extraction → name heuristics** (heuristics handle standard keys + full_name splits) → X2 resolveContact(source:'ads', sourceDetails {platform, campaignId, adId, formId, externalLeadId}) → `note`/`ad_lead` timeline activity. Failed/skipped leads are retryable from Ads ▸ Leads.
4. Genuine failures publish the `ads.lead_sync_failed` domain event → org-admin notification deep-linking to /ads/leads?status=failed (mapping in src/lib/notifications/notification-dispatcher.ts).
5. The `ad_lead_captured` workflow trigger fires after intake (src/lib/ads/lead-trigger.ts → triggers/dispatch.ts, fire-and-forget) — canvas node `triggerAdLead` filters by platform/formId/campaignId; payload includes the raw fields + CRM syncStatus/contactId.

## Notifications & Weekly Summary

- `ads.lead_sync_failed` — published by crm-intake on real failures (not skips); notifies org admins.
- `ads.weekly_summary` — published Mondays 9 AM by the `ads-weekly-summary` job (source-metrics-sync queue) from src/lib/ads/weekly-summary.ts: COMPUTED week-over-week spend/clicks/conversions per org with ad activity — no AI, no credits. Dispatcher renders it as an admin notification (deduped per org+week); the daily email digest picks both up automatically.

## Environment

GOOGLE_ADS_DEVELOPER_TOKEN (required for Google Ads), GOOGLE_ADS_CLIENT_ID/SECRET (falls back to GOOGLE_CLIENT_ID/SECRET), GOOGLE_ADS_API_VERSION (default v21), META_ADS_GRAPH_VERSION (default v21.0), META_LEADS_WEBHOOK_VERIFY_TOKEN, FACEBOOK_APP_SECRET (webhook signatures — required in production). OAuth redirect URIs to register: /api/ads/oauth/{google-ads,meta-ads}/callback, /api/analytics/oauth/{ga4,search_console}/callback.

## Gotchas

- Adding a module to subnav-registry.ts does NOT add it to the global module switcher — Rail entries live separately in src/components/shell/rail.tsx.
- AI rate-limit buckets `ai:ads-copy` (30/h) and `ai:ads-insights` (10/h) in src/lib/ai/rate-limit.ts.
- Google Ads manager (MCC) accounts are listed in the picker but cannot be connected; child accounts store loginCustomerId.
- Contact model gained `source: 'ads'` — the only CRM-file change for this feature set.
