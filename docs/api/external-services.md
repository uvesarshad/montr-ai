# External Services

> Scope: Every third-party API and SDK — ownership, credentials, and failure behavior.
> Rendering context: Server-side
> Project tier: 4
> Last updated: 2026-06-05

## Overview

MontrAI integrates with AI providers, storage, email, payments, communications (WhatsApp, SMS, Telegram), social APIs, scraping tools, and monitoring. All integrations are server-side only. Client-side code never holds API keys.

AGENT NOTE: Adding a new external service always requires a new entry in docs/infra/environment.md for its credential env vars.

## AI Providers

Google AI (Gemini) — via Genkit (@genkit-ai/googleai). Credential: GOOGLE_AI_API_KEY. Owner: src/ai/genkit.ts and src/ai/client.ts. Used for text and image generation. Failure: throws; engine marks execution FAILED.

OpenAI and compatible — via genkitx-openai (Genkit plugin) and @ai-sdk/openai (Vercel AI SDK). Credential: OPENAI_API_KEY (platform key) or user's BYOK key from userApiKeys. Owner: src/ai/client.ts routing based on routeHint. Failure: throws.

Custom OpenRouter models — user-configured models stored in custom_model collection. Owner: src/lib/model-registry.ts + src/lib/model-groups.ts.

Model routing: all AI calls must go through src/ai/client.ts. The routeHint.sdk field selects 'genkit' or 'ai-sdk'. routeHint.keySource selects 'platform' (env var) or 'byok' (user key).

AGENT AVOID: Importing @genkit-ai/googleai, genkitx-openai, or openai directly in node processors or route handlers.

## Storage

AWS S3 / Wasabi — via @aws-sdk/client-s3. Credentials: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, S3_BUCKET_NAME, S3_ENDPOINT (for Wasabi). Owner: src/lib/storage/s3-provider.ts and src/lib/storage/s3-client.ts. Used for canvas previews, attachments, uploads. Presigned URLs generated on-demand; keys stored, URLs not stored.

Google Drive — via @google-cloud/storage. Credentials: GOOGLE_SERVICE_ACCOUNT_KEY_JSON or similar. Owner: src/lib/storage/google-drive-provider.ts. Alternative to S3 for file storage.

Local provider — src/lib/storage/local-provider.ts. Used in development when S3 is not configured.

Storage service (src/lib/storage/storage-service.ts) selects the provider based on environment configuration.

## Email

Amazon SES — via @aws-sdk/client-ses. Credentials: shared with S3 (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY), plus SES_FROM_EMAIL. Owner: src/lib/marketing-email/providers/ses-provider.ts. Used for marketing email sending.

Brevo (formerly Sendinblue) — via brevo API. Credential: BREVO_API_KEY. Owner: src/lib/marketing-email/providers/brevo-provider.ts.

SMTP — generic SMTP provider. Credentials: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS. Owner: src/lib/marketing-email/providers/smtp-provider.ts.

Nodemailer — used for transactional email (password reset, verification). Credential: depends on provider configured.

Resend — used as NextAuth magic-link provider. Credential: RESEND_API_KEY.

## Payments

Razorpay — via razorpay npm package. Credentials: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET (for HMAC verification). Owner: src/app/api/v2/razorpay/. Used for subscription management. Webhook at /api/v2/razorpay/webhook verifies HMAC before processing.

## Communications

Twilio — via twilio package. Owner: src/lib/voice/providers/twilio.ts (voice subsystem only). Credentials are NOT read from env vars — they are stored encrypted in MongoDB (voice-provider-config model, voice_provider_configs collection) and decrypted at runtime via src/lib/workflow/credential-encryption.ts. Used for voice calls, recordings, and inbound webhooks; webhook signatures verified with Twilio validateRequestWithBody. AGENT SEE: docs/api/database.md — voice-provider-config model.

WhatsApp Business API — direct integration (not via Twilio for some flows). Credentials: WHATSAPP_API_KEY, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_BUSINESS_ACCOUNT_ID, WHATSAPP_WEBHOOK_VERIFY_TOKEN. Owner: src/lib/whatsapp/. Inbound webhooks at /api/v2/inbox/webhook/ verify signatures.

Telegram — via HTTP API. Credential: TELEGRAM_BOT_TOKEN. Owner: src/lib/workflow/node-processors/actions/send-telegram.ts.

## Voice Subsystem (STT / TTS / Telephony)

The voice subsystem uses a provider abstraction at src/lib/voice/providers/ (telephony, e.g. Twilio above) plus pluggable speech providers. Telephony credentials come from the voice-provider-config model (DB, encrypted); the speech providers below read API keys from env.

Deepgram (STT) — Owner: src/lib/voice/ai/stt/deepgram.ts. Credential: DEEPGRAM_API_KEY.

Sarvam (STT + TTS) — Owner: src/lib/voice/ai/stt/sarvam.ts and src/lib/voice/ai/tts/sarvam.ts. Credential: SARVAM_API_KEY.

ElevenLabs (TTS) — Owner: src/lib/voice/ai/tts/elevenlabs.ts. Credential: ELEVENLABS_API_KEY.

OpenAI (STT + TTS) — Whisper STT (src/lib/voice/ai/stt/whisper.ts) and OpenAI TTS (src/lib/voice/ai/tts/openai.ts). Credential: OPENAI_API_KEY (shared with the AI providers entry above).

Twilio-hosted STT / Polly TTS — provider-native fallbacks. Owner: src/lib/voice/ai/stt/twilio-hosted.ts and src/lib/voice/ai/tts/twilio-polly.ts. No separate credential (uses the Twilio voice config).

AGENT SEE: docs/api/database.md — voice models (call-session, call-transcript, voice-phone-number, voice-provider-config, voice-bulk-batch)

## AI Bots

AI-bot runtime — Owner: src/lib/ai-bots/runtime.ts. Does not call any provider SDK directly; delegates to configured AI providers through src/ai/client.ts (generateTextWithClient) for bot replies. AGENT SEE: AI Providers section above.

## Social Media APIs

Platforms integrated: X (Twitter), LinkedIn, Instagram, Facebook, Threads, Pinterest, Reddit, YouTube, TikTok, Dribbble, Google Business, Slack, Discord, Notion, plus gmail/outlook/google-drive/google-calendar/outlook-calendar utility connections and Telegram (bot token). OAuth access tokens are stored encrypted in the social_accounts collection (or CRM email/calendar accounts and user storage for the utility flows). Connection flows run through the generic social OAuth engine at src/lib/social/oauth/ (engine + per-platform configs in platforms/), served by the dynamic /api/social/oauth/[platform] route pair. Publishing adapters: src/lib/social/. AGENT SEE: docs/modules/social-media.md — Social Account OAuth Flow.

## Integrations Hub (Marketing Tools)

A registry-driven connection system for business-tool integrations, separate from the social_accounts OAuth above. Providers are declared once in src/lib/integrations/registry.ts (client-safe catalog); server-side endpoint builders, account-info fetchers, and live health tests live in src/lib/integrations/server/provider-config.ts. One generic OAuth2 flow (state, PKCE, token exchange, refresh) at src/lib/integrations/server/oauth.ts serves every OAuth provider via /api/v2/integrations/oauth/[provider] and its callback; API-key providers connect through POST /api/v2/integrations, which validates the key with a live call before storing.

Credential storage: integration_connections collection, AES-256-GCM-encrypted JSON blob via src/lib/encryption.ts, select:false. Hybrid ownership — organizationId required, brandId optional; src/lib/db/repository/integration-connection.repository.ts resolveForBrand prefers the brand-pinned connection, then falls back to the org-level one. Workflow node processors resolve credentials through src/lib/integrations/server/processor-credentials.ts (workflow credential vault, then explicit connectionId, then brand-to-org chain).

Token refresh: the integration-token-refresh BullMQ cron (every 10 minutes, registered by scripts/workflow-worker.ts) preemptively refreshes OAuth tokens expiring within 15 minutes and handles refresh-token rotation. Failed refreshes mark the connection expired with a reason.

OAuth providers (credentials in env, app registered under the Montr AI identity; redirect URI /api/v2/integrations/oauth/{provider}/callback):

Mailchimp — MAILCHIMP_CLIENT_ID/SECRET. Tokens do not expire. Datacenter prefix and api_endpoint captured from the metadata endpoint at connect time and stored in connection metadata. Import-only by product decision: a manual import (POST /api/v2/integrations/[id]/import or the card's "Import data now" action) pulls audiences and members into the integration_import_records staging store. Inbound webhooks at /api/webhooks/mailchimp/[connectionId] (form-encoded; optional ?secret= verification) publish mailchimp.webhook_received domain events.

HubSpot — HUBSPOT_CLIENT_ID/SECRET. Access tokens expire in about 30 minutes — depends on the token refresh cron. Read-only CRM scopes. Import-only by product decision.

Airtable — AIRTABLE_CLIENT_ID/SECRET. Requires PKCE (S256). Access tokens expire in 60 minutes.

Zoho — ZOHO_CLIENT_ID/SECRET. Region-specific data centers: the connect flow captures the region; token URL and api_domain differ per region and are stored in connection metadata. Covers Zoho CRM (read) and Zoho Campaigns (read). Import-only by product decision.

Webflow — WEBFLOW_CLIENT_ID/SECRET. Tokens do not expire. Data API v2.

Blogger — reuses GOOGLE_CLIENT_ID/SECRET with the Blogger scope; refresh supported.

Shopify — SHOPIFY_CLIENT_ID/SECRET. Per-shop OAuth: the shop name is collected at connect time (registry textParam) and carried through the flow; offline access token does not expire. Service uses the Admin GraphQL API (2024-10), read-only. Inbound webhooks at /api/webhooks/shopify/[connectionId] verify the raw-body HMAC-SHA256 header against SHOPIFY_CLIENT_SECRET and publish shopify.webhook_received domain events; app/uninstalled marks the connection errored.

API-key providers (per-user keys, no platform env vars; validated live at connect):

Apollo.io — sales-intelligence enrichment and prospect search. Import-only.

Semrush — domain, keyword, and backlink reports. Connect-time validation uses the free countapiunits endpoint; report calls consume paid API units.

RevenueCat — subscription analytics (v2 secret key). Inbound webhooks at /api/webhooks/revenuecat/[connectionId] publish revenuecat.webhook_received domain events; if connection metadata holds webhookSecret the Authorization header is verified timing-safe, otherwise events carry verified false.

n8n — self-hosted automation interop (instance URL + API key). The base URL is user-supplied, so every call goes through safeOutboundFetch.

WordPress (self-hosted) — site URL + username + Application Password (WP 5.6+), Basic auth against /wp-json/wp/v2. The base URL is user-supplied, so every call goes through safeOutboundFetch. The legacy WordPress.com OAuth route was removed 2026-06-05 (it never had a callback); this hub entry is the only WordPress integration.

Per-provider service classes live in src/lib/services/{provider}.service.ts; workflow node processors in src/lib/workflow/node-processors/integration/ register as integration_{provider} in NodeProcessorRegistry.

AGENT NOTE: Mailchimp, HubSpot, and Zoho are import-only by user decision — pull data into MontrAI; no write-direction actions. Imported contacts must never land in the CRM module.

AGENT SEE: docs/api/database.md — integration-connection and doc-sync-link models.

## Notion Doc Sync

Linked documents sync with Notion pages via DocSyncLink (doc_sync_links collection). Converters at src/lib/integrations/notion/blocks-to-html.ts and html-to-blocks.ts translate between Notion blocks and Document.content (which is HTML from the TipTap editor, not TipTap JSON). The sync service src/lib/integrations/notion/doc-sync.ts pulls (Notion to doc), pushes (doc to Notion: clears page children, appends in batches of 100, best-effort title update), or runs two-way with last-writer-wins; local content is snapshotted to DocVersion before any pull overwrite. Notion has no public change webhooks, so the notion-doc-sync BullMQ cron polls every 15 minutes, paced under Notion's rate limit. Sync failures publish docs.notion_sync_failed domain events, which the notification dispatcher maps to in-app notifications. Notion tokens come from the brand's SocialAccount (legacy Notion OAuth), referenced by socialAccountId on the link.

## Data and Scraping

Apify — via apify-client. Credential: APIFY_TOKEN. Owner: src/lib/apify-actor-service.ts. Used by Instagram, LinkedIn, Pinterest, X, Facebook, Google Business data processors.

Google Search API — credential: [PLACEHOLDER: env var name for Google Search API key]. Owner: src/lib/workflow/node-processors/data/google-search.ts.

Reddit — public JSON API, no auth required. Owner: src/lib/workflow/node-processors/data/reddit-scrape.ts.

YouTube Transcript — via youtube-transcript package, no API key. Owner: src/lib/workflow/node-processors/data/youtube-transcribe.ts.

## Monitoring and Logging

Sentry (error tracking, free cloud tier) — via @sentry/nextjs (+ @sentry/node for server.js and the BullMQ worker). Credential: SENTRY_DSN, NEXT_PUBLIC_SENTRY_DSN (no-op when unset); SENTRY_API_TOKEN for the admin errors proxy. Owner: src/instrumentation.ts, src/instrumentation-client.ts, sentry.server.config.ts, sentry.edge.config.ts, server.js, scripts/workflow-worker.ts. Errors forwarded from src/lib/logger.ts. Build integration: withSentryConfig in next.config.ts. PII-scrubbed; tagged userId/org/role (no email).

PostHog (product analytics, free cloud tier, US) — via posthog-js (browser) + posthog-node (server). Credential: NEXT_PUBLIC_POSTHOG_KEY, NEXT_PUBLIC_POSTHOG_HOST (no-op when unset). Owner: src/components/providers/posthog-provider.tsx, src/lib/analytics/posthog-server.ts, src/lib/analytics/events.ts.

Application logs — structured logs persist to the capped Mongo collection system_logs when LOG_PERSIST=true; browse at super-admin /admin/logs. Owner: src/lib/logger.ts, src/lib/db/{models,repository}/system-log.*.

## Google OAuth (Auth)

Used by NextAuth Google provider. Credentials: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET. Owner: auth.ts.

## reCAPTCHA

Google reCAPTCHA v2/v3. Credential: RECAPTCHA_SECRET_KEY, NEXT_PUBLIC_RECAPTCHA_SITE_KEY. Owner: src/lib/recaptcha.ts. Used on signup and login forms.

## Update Triggers

Update this file when an external service is added, removed, or when the credential env var names change.

## Related Docs

- docs/infra/environment.md — All env vars for these services
- docs/architecture/data-flow.md — AI generation path
