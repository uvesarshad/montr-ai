# Integrations Module

> Scope: Third-party app connections (OAuth/API-key), data import, provider webhooks, and the workflow nodes/triggers built on them.
> Rendering context: Mixed (settings UI client-side; sync/import/webhooks server-side)
> Project tier: 4
> Last updated: 2026-06-06

## Overview

The Integrations module connects external SaaS apps (Shopify, Mailchimp, HubSpot, Zoho, RevenueCat, Notion, WordPress, n8n, and others) to MontrAI. It provides a shared OAuth/API-key engine, an `IntegrationConnection` store (org- and brand-scoped), data import, inbound provider webhooks, and the automation-builder nodes/triggers that consume them.

## Entry Points

- src/components/settings/connections/integration-hub.tsx — Connect / manage apps UI.
- src/app/api/v2/integrations/oauth/[provider]/callback/route.ts — OAuth callback (creates the connection; Shopify webhook auto-registration runs here).
- src/app/api/v2/integrations/[id]/import/route.ts — On-demand data import.
- src/app/api/webhooks/{provider}/[connectionId]/route.ts — Inbound provider webhooks (Shopify, RevenueCat, Mailchimp, Calendly, Stripe).
- src/lib/integrations/ — Registry, server OAuth/refresh/webhook helpers, per-provider services, import service.
- src/lib/workflow/node-processors/integration/ — `integration_*` workflow nodes.

## Data Models

- src/lib/db/models/integration-connection.model.ts (IntegrationConnection) — Per-org (and optionally per-brand) connection: provider, authType, encrypted credentials, token expiry, scopes, external account info, status.
- src/lib/db/models/integration-import-record.model.ts — Import provenance/dedup records.

## Write-back Policy (deliberate, 2026-06-06)

MontrAI is the system of activation: it is the ESP / marketing-automation source of truth, and external apps are **sources of records and events**, not write targets. The integration layer is therefore intentionally limited:

- **Mailchimp / HubSpot / Zoho — import-only.** These services expose only GET (read/list/search) calls. No create/update/delete/subscribe is implemented, and none should be added casually. The product activates contacts via MontrAI's own ESP (Marketing Email / WhatsApp / CRM), so pushing records back into a competing list/CRM tool is not a goal. Each service header states this explicitly (e.g. `src/lib/services/mailchimp.service.ts`). Revisit only on concrete customer demand for two-way sync; if added, it must go through the credential vault + `safeOutboundFetch` and stay org-scoped.
- **Shopify — read-only + read webhooks.** No write/mutation actions exist in the builder (no order/product/customer mutations). What Shopify *does* provide is **triggers**: MontrAI registers read webhook subscriptions whose inbound deliveries start workflows via the `integration_webhook` trigger. Registered topics (GraphQL enums → REST header form):
  - `ORDERS_CREATE` → `orders/create`
  - `CUSTOMERS_CREATE` → `customers/create`
  - `APP_UNINSTALLED` → `app/uninstalled` (flips the connection to `error`)
  - `CARTS_UPDATE` → `carts/update` (abandoned-cart recovery)
  - `CHECKOUTS_CREATE` → `checkouts/create`
  - `CHECKOUTS_UPDATE` → `checkouts/update`
  - `ORDERS_PAID` → `orders/paid`

  Registration (`src/lib/integrations/server/shopify-webhooks.ts`) happens at connect time, is idempotent (existing topics are skipped, missing ones created), and HMAC verification on every delivery is enforced in the ingress route (`src/app/api/webhooks/shopify/[connectionId]/route.ts`), which also carries `X-Shopify-Webhook-Id` idempotency.

  **Existing connections:** because registration only runs in the OAuth callback, stores connected *before* a topic was added do not retroactively get it. There is deliberately no migration cron (Shopify uses a permanent access token and is not in the token-refresh path, so adding bulk re-registration machinery is out of scope). Such stores pick up the new topics on their next reconnect. New connections get the full set immediately.
- **Calendly — trigger-only (read).** Personal-access-token (PAT) auth — `GET https://api.calendly.com/users/me` validates the key (`provider-config.ts`). No action node exists; Calendly is purely a *trigger source*. On connect (POST `/api/v2/integrations`) MontrAI auto-creates an organization-scoped webhook subscription (`src/lib/integrations/server/calendly-webhooks.ts`) for `invitee.created` (meeting booked) and `invitee.canceled`, pointing at the ingress route, and persists the create-response `signing_key` on the connection metadata (`webhookSigningKey`). The ingress (`src/app/api/webhooks/calendly/[connectionId]/route.ts`) verifies the `Calendly-Webhook-Signature` header (`t=<unix>,v1=<hex>` = HMAC-SHA256 of `${t}.${body}`, constant-time) when a signing key is stored; without one, deliveries are accepted but flagged unverified and do **not** start workflows. eventId = invitee/scheduled-event uri. Topics fan out via the `integration_webhook` trigger.
- **Stripe — revenue triggers + read-only lookups.** Secret/restricted-key auth — `GET https://api.stripe.com/v1/account` validates the key. The ingress (`src/app/api/webhooks/stripe/[connectionId]/route.ts`) verifies the `Stripe-Signature` header (`t=,v1=` = HMAC-SHA256 of `${t}.${body}`, hex, constant-time, **5-minute replay tolerance**) keyed by the connection's `webhookSecret` credential; deliveries without a configured secret are **rejected (401)** — revenue events are too high-value to accept unverified. Topics (event.type — e.g. `checkout.session.completed`, `invoice.paid`, `customer.subscription.*`) fan out via `integration_webhook`; eventId = `event.id`. The builder also exposes a **read-only** `stripe_action` node (`src/lib/workflow/node-processors/integration/stripe.ts`, raw REST via `src/lib/services/stripe.service.ts`): `get_customer` (by email), `list_recent_payments` (limit), `get_subscription_status` (by email). **No write actions** (import-only stance) — no charges/customers/subscriptions are created or mutated.

### Out of scope (non-goals)
- Two-way / write-back sync to Mailchimp/HubSpot/Zoho.
- Shopify order/product/customer mutation nodes in the builder.
- Stripe write actions (creating charges, customers, subscriptions, refunds) — read-only only.
- Calendly action nodes (it is a trigger source only).
