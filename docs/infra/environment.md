# Environment Variables

> Scope: Every environment variable — name, purpose, required/optional, consumer.
> Rendering context: Server-side (never expose secrets to client)
> Project tier: 4
> Last updated: 2026-06-06

## Overview

All secrets are stored in .env (loaded by dotenv in ecosystem.config.js for PM2) or .env.local for local development. Variables prefixed with NEXT_PUBLIC_ are bundled into the client-side JavaScript. All others are server-side only.

AGENT NOTE: When adding a new environment variable, add it here AND update the relevant external service doc in docs/api/external-services.md.

## Database

MONGODB_URI — MongoDB connection string. Required. Consumer: src/lib/mongodb.ts. AGENT NOTE: src/lib/mongodb.ts falls back to mongodb://localhost:27017/montrai when MONGODB_URI is absent — a worker process launched without env therefore silently uses a DIFFERENT database than the app instead of failing.
MONGODB_DB_NAME — MongoDB database name. Optional, defaults to 'montrai'. Consumer: src/lib/mongodb.ts.
MONGODB_SERVER_SELECTION_TIMEOUT_MS — Mongo server-selection timeout in milliseconds. Optional, defaults to 20000. Consumer: src/lib/mongodb.ts. AGENT NOTE: the previous hardcoded 5000 intermittently failed worker boots on SRV/DNS-slow machines (e.g. TLS interception) while plain scripts connected fine — raise it for constrained environments.
REDIS_URL — Redis connection URL. Optional for the app (src/lib/redis.ts defaults to redis://localhost:6379), but effectively REQUIRED by the worker process: scripts/workflow-worker.ts loads only `.env` via dotenv/config (NOT `.env.local`); without REDIS_URL there startExecutionWorker returns null and the worker exits at boot with "Redis not configured". Consumer: src/lib/redis.ts, BullMQ queue connections, scripts/workflow-worker.ts.
DATABASE_URL — PostgreSQL connection string (for pgvector). Required if using semantic search. Consumer: scripts/setup-pgvector.ts.

## Authentication

NEXTAUTH_SECRET — JWT signing secret. Required. Consumer: NextAuth v5 (auth.ts).
NEXTAUTH_URL — Base URL of the application (e.g., https://app.montrai.com). Required in production. Consumer: NextAuth.
GOOGLE_CLIENT_ID — Google OAuth client ID. Optional. Consumer: auth.ts Google provider.
GOOGLE_CLIENT_SECRET — Google OAuth client secret. Optional. Consumer: auth.ts Google provider.
RESEND_API_KEY — Resend API key for magic-link email. Optional. Consumer: NextAuth Resend provider.

## AI Providers

GEMINI_API_KEY — Google AI (Gemini) API key. Required if using Gemini. Primary Google key: read by src/ai/genkit.ts (system-level Genkit plugin), src/ai/router.ts (google env-key name), and the social/ads AI routes. AGENT NOTE: as of 2026-06-06 Google TEXT generation runs through the Vercel AI SDK against Gemini's OpenAI-compatible endpoint (https://generativelanguage.googleapis.com/v1beta/openai/) for REAL tool binding (src/ai/providers/google.ts), using this same key; Genkit's googleAI plugin is now only the Imagen/Veo (image/video) path.
GOOGLE_AI_API_KEY — Alternate Google AI (Gemini) key name. Optional, used only as a fallback after GEMINI_API_KEY in a few consumers (e.g. src/lib/inbox/knowledge-base.service.ts embeddings).
OPENAI_API_KEY — OpenAI API key (platform-level). Required if using GPT models without BYOK. Consumer: src/ai/client.ts.
ANTHROPIC_API_KEY — Anthropic (Claude) API key, platform-level fallback. Optional (BYOK overrides). Consumer: src/app/api/social/ai/enhance/route.ts, src/app/api/social/ai/ideas/route.ts.
OPENROUTER_API_KEY — OpenRouter API key, platform-level fallback. Optional. Consumer: src/ai/router.ts, src/ai/flows/generate-image-flow.ts, social AI routes.
DEEPSEEK_API_KEY — DeepSeek API key, platform-level fallback. Optional. Consumer: src/app/api/social/ai/enhance/route.ts, ideas/route.ts.
COHERE_API_KEY — Cohere API key, platform-level fallback. Optional. Consumer: same social AI routes.
GROQ_API_KEY — Groq API key, platform-level fallback. Optional. Consumer: same social AI routes.
MISTRAL_API_KEY — Mistral API key, platform-level fallback. Optional. Consumer: same social AI routes.
PERPLEXITY_API_KEY — Perplexity API key, platform-level fallback. Optional. Consumer: same social AI routes.
XAI_API_KEY — xAI (Grok) API key, platform-level fallback. Optional. Consumer: same social AI routes.

### Provider Base-URL Overrides

These override the default API base URL for self-hosted or regional endpoints; each falls back to the provider's public host. All optional, server-side.
IDEOGRAM_BASE_URL — Consumer: src/ai/providers/ideogram.ts.
HEYGEN_BASE_URL — Consumer: src/ai/providers/heygen.ts.
RUNWAY_BASE_URL — Consumer: src/ai/providers/runway.ts.
ZAI_BASE_URL — Consumer: src/ai/providers/zai.ts, src/ai/router.ts.
DID_BASE_URL — Consumer: src/ai/providers/d-id.ts.

## Voice

AGENT NOTE: Per-tenant voice provider credentials (Twilio account SID/auth token, etc.) are NOT environment variables. They are stored encrypted in MongoDB (voice provider config) and decrypted at runtime via WORKFLOW_ENCRYPTION_KEY. The variables below are platform-level defaults and the standalone voice WebSocket server's configuration.

DEEPGRAM_API_KEY — Deepgram STT API key, platform-level fallback. Optional (per-call apiKey overrides). Consumer: src/lib/voice/ai/stt/deepgram.ts.
ELEVENLABS_API_KEY — ElevenLabs TTS API key, platform-level fallback. Optional. Consumer: src/lib/voice/ai/tts/elevenlabs.ts.
ELEVENLABS_BASE_URL — ElevenLabs API base URL override. Optional, defaults to https://api.elevenlabs.io. Consumer: src/ai/providers/elevenlabs.ts.
SARVAM_API_KEY — Sarvam STT/TTS API key, platform-level fallback. Optional. Consumer: src/lib/voice/ai/stt/sarvam.ts, src/lib/voice/ai/tts/sarvam.ts.
SARVAM_BASE_URL — Sarvam API base URL override. Optional, defaults to https://api.sarvam.ai. Consumer: src/ai/providers/sarvam.ts.
VOICE_WS_PORT — Port for the standalone voice WebSocket server. Optional, defaults to 3001. Consumer: src/lib/voice/server/ws-handler.ts.
VOICE_STT_PROVIDER — Default speech-to-text provider id (deepgram | whisper | sarvam | twilio-hosted). Optional, defaults to deepgram. Consumer: src/lib/voice/server/ws-handler.ts.
VOICE_TTS_PROVIDER — Default text-to-speech provider id (elevenlabs | openai | sarvam | twilio-polly). Optional, defaults to openai. Consumer: src/lib/voice/server/ws-handler.ts.
VOICE_LLM_MODEL — LLM model used for voice turn responses. Optional, defaults to gpt-4o-mini. Consumer: src/lib/voice/server/ws-handler.ts.
VOICE_LLM_SYSTEM_PROMPT — Default system prompt for the voice LLM. Optional. Consumer: src/lib/voice/server/ws-handler.ts.

## Storage

AWS_ACCESS_KEY_ID — AWS/Wasabi access key. Required for S3 storage and SES. Consumer: src/lib/storage/s3-provider.ts, src/lib/marketing-email/providers/ses-provider.ts.
AWS_SECRET_ACCESS_KEY — AWS/Wasabi secret key. Required. Consumer: same.
AWS_REGION — AWS region. Required for SES. Consumer: ses-provider.ts.
S3_BUCKET_NAME — S3 bucket name for uploads. Required. Consumer: src/lib/storage/s3-provider.ts.
S3_ENDPOINT — S3 endpoint URL. Required for Wasabi (non-AWS S3-compatible). Consumer: src/lib/storage/s3-client.ts.
GOOGLE_SERVICE_ACCOUNT_KEY_JSON — Google service account JSON (base64 or stringified). Optional. Consumer: src/lib/storage/google-drive-provider.ts.

## Email

SES_FROM_EMAIL — Verified sender email address for SES. Required if using SES. Consumer: ses-provider.ts.
BREVO_API_KEY — Brevo API key. Required if using Brevo. Consumer: src/lib/marketing-email/providers/brevo-provider.ts.
SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD — SMTP credentials. Required if using SMTP. Consumer: src/lib/email.ts.
SMTP_SECURE — Use TLS on connect (set 'true' for port 465, otherwise false). Optional, defaults to false. Consumer: src/lib/email.ts.
SMTP_FROM — Default sender address (falls back to SMTP_USER). Optional. Consumer: src/lib/email.ts.

## Payments

RAZORPAY_KEY_ID — Razorpay public key. Required for payments. Consumer: src/app/api/v2/razorpay/.
RAZORPAY_KEY_SECRET — Razorpay secret key. Required. Consumer: same.
RAZORPAY_WEBHOOK_SECRET — Razorpay webhook HMAC secret. Required for webhook verification. Consumer: /api/v2/razorpay/webhook.

## WhatsApp

WHATSAPP_API_KEY — WhatsApp Business API token. Required. Consumer: src/lib/whatsapp/.
WHATSAPP_PHONE_NUMBER_ID — WhatsApp phone number ID. Required. Consumer: src/lib/whatsapp/.
WHATSAPP_BUSINESS_ACCOUNT_ID — WhatsApp Business Account ID. Required. Consumer: src/lib/whatsapp/.
WHATSAPP_WEBHOOK_VERIFY_TOKEN — Token for WhatsApp webhook challenge verification. Required. Consumer: /api/v2/inbox/webhook/whatsapp.

## Communications

TELEGRAM_BOT_TOKEN — Telegram bot token. Required for Telegram node. Consumer: src/lib/workflow/node-processors/actions/send-telegram.ts.

## Data and Scraping

APIFY_TOKEN — Apify API token. Required for social data scraping nodes. Consumer: src/lib/apify-actor-service.ts.

## Social OAuth (engine)

Consumed by src/lib/social/oauth/ (per-platform configs in platforms/). All optional — a platform without its env pair returns "not configured" at initiation. Redirect URI per platform: /api/social/oauth/{platform}/callback.

NEXT_PUBLIC_X_CLIENT_ID / X_CLIENT_SECRET — X (Twitter). Optional X_OAUTH_APP_URL overrides the callback/result origin; X_OAUTH_INCLUDE_MEDIA_WRITE adds the media.write scope.
NEXT_PUBLIC_LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET — LinkedIn (profile and company flows).
NEXT_PUBLIC_FACEBOOK_APP_ID / FACEBOOK_APP_SECRET — Facebook, Instagram, and Threads (Meta-family; token exchange uses Meta's GET wire format).
NEXT_PUBLIC_REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET — Reddit.
NEXT_PUBLIC_DRIBBBLE_CLIENT_ID / DRIBBBLE_CLIENT_SECRET — Dribbble.
PINTEREST_APP_ID / PINTEREST_APP_SECRET — Pinterest.
TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET — TikTok (PKCE; client_key param).
SLACK_CLIENT_ID / SLACK_CLIENT_SECRET — Slack.
DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET — Discord (bot install).
NOTION_CLIENT_ID / NOTION_CLIENT_SECRET — Notion.
MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET — Outlook mail (CRM + social) and Outlook calendar.
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET — also used by gmail (CRM + social) and google-calendar flows (in addition to the NextAuth Google provider in the Authentication section).
YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET — YouTube and Google Business (the Google Business flow shares the YouTube app).
GOOGLE_DRIVE_CLIENT_ID / GOOGLE_DRIVE_CLIENT_SECRET — Google Drive storage connection. AGENT NOTE: since the 2026-06-05 OAuth consolidation this no longer falls back to GOOGLE_CLIENT_ID — both Drive vars must be set for the Drive flow.
Telegram needs no env vars (user-supplied bot token via the static POST route).

## Ads & Analytics

Consumed by src/lib/ads/ and src/lib/analytics/ (OAuth at /api/ads/oauth/* and /api/analytics/oauth/*; redirect URIs: /api/ads/oauth/{google-ads,meta-ads}/callback and /api/analytics/oauth/{ga4,search_console}/callback).

GOOGLE_ADS_DEVELOPER_TOKEN — Google Ads API developer token (from an MCC account). Required for any Google Ads call: account discovery, insights fetching, campaign creation. Consumers: src/lib/ads/google-ads-oauth.ts, write-ops/google.ts.
GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET — Optional dedicated OAuth client for Google Ads; falls back to GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (the consent screen must carry the adwords scope).
GOOGLE_ADS_API_VERSION — Optional, default v21. META_ADS_GRAPH_VERSION — Optional, default v21.0 (the ads code runs a newer Graph version than the social module's pinned one).
META_LEADS_WEBHOOK_VERIFY_TOKEN — Hub verification token for the Meta Lead Ads webhook (GET /api/webhooks/meta-leads). Required to subscribe the Meta app to leadgen events.
FACEBOOK_APP_SECRET — Also verifies x-hub-signature-256 on meta-leads webhook deliveries (in addition to its Social OAuth role above). AGENT NOTE: when unset, signature verification fails OPEN outside production — it MUST be set in production or lead webhooks are rejected.
GA4 / Search Console reuse GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET with the analytics.readonly and webmasters.readonly scopes on the consent screen.
X_API_TIER — Optional, default free. Set to `basic` (requires an X API Basic-tier subscription) to additionally sync per-day X post metrics (posts/impressions/likes/reposts/replies via the user timeline, 30-day cap) on top of the free-tier follower snapshot. Consumer: src/lib/analytics/fetchers/social-accounts.fetcher.ts.

## Integrations Hub

OAuth app credentials for the integrations hub (apps registered under the Montr AI identity; redirect URI /api/v2/integrations/oauth/{provider}/callback). All optional — a provider without its env pair returns "not configured" at connect time. Consumer: src/lib/integrations/server/provider-config.ts via src/lib/integrations/server/oauth.ts.

MAILCHIMP_CLIENT_ID / MAILCHIMP_CLIENT_SECRET — Mailchimp OAuth app.
HUBSPOT_CLIENT_ID / HUBSPOT_CLIENT_SECRET — HubSpot OAuth app.
AIRTABLE_CLIENT_ID / AIRTABLE_CLIENT_SECRET — Airtable OAuth app (PKCE).
ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET — Zoho OAuth app (multi-region: register the callback in every supported data center).
WEBFLOW_CLIENT_ID / WEBFLOW_CLIENT_SECRET — Webflow OAuth app.
SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET — Shopify Partner app. SHOPIFY_CLIENT_SECRET is also required by the webhook receiver /api/webhooks/shopify/[connectionId] for HMAC verification.
Blogger reuses GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (Authentication section) with the Blogger API enabled on the same Google Cloud project.

Apollo.io, Semrush, RevenueCat, n8n, and self-hosted WordPress connect with per-user keys stored encrypted in integration_connections — no platform env vars.

## Monitoring

### Sentry (error tracking — free cloud tier)
All Sentry vars are optional; with empty/unset values the SDK is a harmless no-op (the dev default).

SENTRY_DSN — Sentry DSN (server / edge / custom server.js / BullMQ worker). Consumer: sentry.server.config.ts, sentry.edge.config.ts, server.js, scripts/workflow-worker.ts.
NEXT_PUBLIC_SENTRY_DSN — Sentry DSN (browser). Exposed to client. Consumer: src/instrumentation-client.ts.
SENTRY_ENVIRONMENT / NEXT_PUBLIC_SENTRY_ENVIRONMENT — environment tag (defaults to NODE_ENV).
SENTRY_TRACES_SAMPLE_RATE / NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE — perf trace sampling, default 0.1 (kept low to protect the free perf-unit quota).
SENTRY_ORG / SENTRY_PROJECT — used by withSentryConfig (next.config.ts) and the admin errors proxy.
SENTRY_AUTH_TOKEN — source-map upload at build time (CI only). Consumer: next.config.ts (no-ops when absent).
SENTRY_API_BASE (default https://sentry.io/api/0) / SENTRY_API_TOKEN — read-only token for the super-admin /admin/errors issues proxy. Server-only. Consumer: src/app/api/v2/admin/errors/route.ts.

Server config sets sendDefaultPii=false + a beforeSend PII scrub; events are tagged with userId + organizationId + role (no email) via src/lib/observability/sentry-user.ts (wired through src/lib/get-session.ts). instrumentation-client.ts replaced the deleted sentry.client.config.ts. Sentry tunnelRoute is intentionally OFF (would conflict with middleware auth/CSRF).

### PostHog (product analytics — free cloud tier, US region)
All PostHog vars are optional; unset = SDK no-op.

NEXT_PUBLIC_POSTHOG_KEY — project API key (browser). Consumer: src/components/providers/posthog-provider.tsx, src/lib/analytics/posthog-server.ts.
NEXT_PUBLIC_POSTHOG_HOST — ingest host (default https://us.i.posthog.com).
POSTHOG_PERSONAL_API_KEY / POSTHOG_PROJECT_ID — server-side query API (reserved for a future admin analytics page). Server-only.

### Application log persistence
LOG_PERSIST — when "true", structured logs are persisted to the capped Mongo collection system_logs (browse at super-admin /admin/logs). Consumer: src/lib/logger.ts.
LOG_PERSIST_LEVEL — minimum level to persist (default info; debug never persisted).
LOG_LEVEL / LOG_SERVICE_NAME — existing stdout log controls.

## Security and Infrastructure

WORKFLOW_ENCRYPTION_KEY — Master key (64 hex chars / 32 bytes) for encrypting/decrypting stored workflow and voice provider credentials. Required for credential encryption and the voice WebSocket server. Consumer: src/lib/workflow/credential-encryption.ts; also required by the voice WS server (server/voice-ws.js via src/lib/voice/server/ws-handler.ts).
ENCRYPTION_KEY — Key for encrypting stored user-storage data and misc secrets. Optional, falls back to an insecure default. Consumer: src/lib/db/repository/user-storage.repository.ts, src/lib/utils/encryption.ts.
SOCIAL_TOKEN_ENCRYPTION_KEY — Key (64 hex chars / 32 bytes) for AES-256-GCM encryption of social-account OAuth tokens and integrations-hub connection credentials. Required for social connections and the integrations hub. Consumer: src/lib/encryption.ts (used by src/lib/db/repository/social-account.repository.ts and src/lib/db/repository/integration-connection.repository.ts).
CRON_SECRET — Bearer token for cron endpoint authorization. Required. Consumer: src/app/api/cron/ handlers.
TRUST_PROXY_DEPTH — Number of trusted reverse proxy hops for IP extraction. Optional, defaults to 0. Consumer: src/lib/rate-limiter.ts.
LOG_SERVICE_NAME — Service name tag for structured logs. Optional, defaults to 'montrai'. Consumer: src/lib/logger.ts.
LOG_LEVEL — Minimum log level. Optional, defaults to 'info' in production and 'debug' otherwise. Consumer: src/lib/logger.ts.
WORKFLOW_WORKER_CONCURRENCY — Number of concurrent jobs the BullMQ workflow worker processes. Optional, defaults to 5. Consumer: src/lib/workflow/queue/worker.ts.

## reCAPTCHA

RECAPTCHA_SECRET_KEY — Google reCAPTCHA secret. Consumer: src/lib/recaptcha.ts, auth.ts authorize(). AGENT NOTE: login verification fails CLOSED only when this is set — auth.ts skips the reCAPTCHA check entirely when RECAPTCHA_SECRET_KEY is unset. When it is set but the site key's allowed domains don't include the request host (e.g. localhost), password login becomes impossible; unset BOTH reCAPTCHA vars for local dev.
NEXT_PUBLIC_RECAPTCHA_SITE_KEY — reCAPTCHA public site key. Exposed to client. Consumer: auth form components.

## AGENT UPDATE

Update this file when any environment variable is added, renamed, removed, or when its server-side vs. client-side exposure changes.

## Related Docs

- docs/api/external-services.md — Service-level detail for each integration
- docs/infra/deployment.md — How env vars are loaded in production
