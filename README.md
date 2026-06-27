<div align="center">

# MontrAI

### The fair-code, AI-native alternative to Zapier/n8n + Hootsuite + HubSpot — with an autonomous agent that runs your business goals.

**Self-host it for free. Own your data. Bring your own AI keys and your own connected apps.**
One platform for CRM, social, WhatsApp, a shared inbox, email campaigns, an AI studio, workflow
automation, forms, docs, analytics, and voice — wired into an agent that turns a goal you set into a
strategy and runs the missions to hit it.

[Quickstart](#-quickstart-docker-compose-up-in-5-minutes) ·
[Features](#-feature-matrix) ·
[The autonomous agent](#-the-autonomous-agent-the-wow) ·
[BYOK + BYO-app](#-byok--byo-app-the-two-doors) ·
[Fair-code, not open source](#-fair-code-not-open-source) ·
[Docs](#-documentation) ·
[Support](#-support)

<sub>fair-code · source-available · self-hostable · BYOK + BYO-app</sub>

</div>

---

## 🤖 The autonomous agent (the WOW)

> **This is the part nothing else has.** Set a business goal — *"grow Instagram + email-driven orders from
> 100 to 500 in 90 days"* — and MontrAI's agent turns it into a **versioned strategy**, breaks it into a
> **dependency-ordered roadmap of missions**, and **runs them** across your connected channels (with budgets,
> hibernation, and human-in-the-loop approval gates), reporting back as it goes.

<div align="center">

<!-- ===================================================================== -->
<!-- ⛔ PLACEHOLDER: replace with the agent-demo GIF before launch.         -->
<!--    Lead the README with this — it is the single most important asset. -->
<!--    Target: a real screen recording of goal → strategy → missions      -->
<!--    running end-to-end (onboarding goal → live agent plan → execution).-->
<!-- ===================================================================== -->

### ▶ `docs/assets/agent-demo.gif` — _coming with launch_

**[ AGENT DEMO GIF GOES HERE ]**

_A live recording: you set a goal at onboarding → the agent drafts a measurable strategy in real time →
you approve → missions spawn and run across your channels._

</div>

**How it works (high level):**

1. **Goal in.** You state a goal at onboarding (or hand one to the agent directly).
2. **Strategy out.** The agent reformulates it into a measurable KPI/target/deadline and generates a
   **draft strategy** — grounded in your own connected analytics, validated and self-critiqued before you see it.
3. **You approve (HITL).** Activation is always a deliberate, human-approved step. Nothing touches a live
   channel without your sign-off.
4. **Missions run.** The strategy decomposes into a roadmap; missions execute on the worker — budget-capped,
   rate-limited, and pausable.

It runs **locally on your own box** (the agent runner is just a worker process), needs only **your AI keys**
(BYOK), and uses your connected accounts **only** when a mission takes a real channel action.

> **Self-host safety:** the self-host agent defaults to **supervised mode** with hard spend/rate caps. It does
> not autonomously post, blast, or spend without your approval and guardrails. Review the limits before you
> turn anything loose.

> **Status note:** the goal → strategy → missions engine is built and runs in the app. The full real-time
> **onboarding → agent bridge** (auto-drafting the strategy from your onboarding goal the moment you finish)
> is part of the launch milestone — where a step is still being wired it is **marked as such** in the docs.

---

## ⚡ Quickstart (`docker compose up` in 5 minutes)

> **Goal:** `git clone` → `cp .env.example .env` → `docker compose up` → a working platform in minutes.

```bash
# 1. Clone
git clone https://github.com/uvesarshad/montr-ai.git
cd montr-ai

# 2. Configure — copy the example env and fill in the essentials
cp .env.example .env
#    Minimum to boot: an encryption key + your DB/Redis URLs (defaults work with the bundled containers).
#    Generate an encryption key:  openssl rand -hex 32
#    Add your own AI key(s) (BYOK) when you want AI features — see the "BYOK" section below.

# 3. Up
docker compose up
#    web    → http://localhost:3000   (Next.js + Socket.io app server)
#    worker → background process       (workflow engine + agent mission runner + schedulers)
```

Then open **http://localhost:3000**, create your owner account, and you're in — **one workspace, every
feature unlocked**, no plans, no billing, no org picker.

**What spins up:**

| Service | Image | Role |
|---|---|---|
| `web` | built from `Dockerfile` | `node server.js` — Next 15 app + Socket.io realtime |
| `worker` | built from `Dockerfile` | workflow execution engine + **agent mission runner** + schedulers/sweepers |
| `mongo` | `mongo:7` | primary application data |
| `postgres` | `pgvector/pgvector:pg16` | embeddings / vector search (pgvector) |
| `redis` | `redis:7` | queues (BullMQ), pub/sub, rate limits |
| `voice-ws` / `voice-worker` | _(compose profile `voice`)_ | optional voice stack |

**Required services:** MongoDB, PostgreSQL + pgvector, and Redis. Without Redis the worker degrades to
polling — keep it on for the full experience.

> **Status:** ⚠️ `docker-compose.yml`, `Dockerfile`, and `.env.example` are part of the OSS launch packaging
> and **may not be present yet in this tree** — they are authored as part of the launch milestone. Until they
> land, see [`docs/infra/deployment.md`](docs/infra/deployment.md) and
> [`docs/infra/environment.md`](docs/infra/environment.md), and use `.env.production.example` as the env
> reference. The one-command quickstart above is the **target** experience.

> **Honest self-host limit:** a box behind NAT **can't receive inbound webhooks** from external platforms (the
> route handlers exist, they just aren't publicly reachable). This is true of n8n too, and it's exactly what
> the paid **Connections Gateway** (a later phase) is designed to solve. Outbound actions and BYO-app OAuth
> work fine.

---

## 🧩 Feature matrix

MontrAI bundles what you'd otherwise stitch together from a dozen tools. Everything below ships in the
**fair-code self-host core** unless a status note says otherwise.

| Module | What it does | Self-host (fair-code) |
|---|---|---|
| **🤖 Autonomous Agent** | Goal → strategy → missions: sets, plans, and runs business goals with budgets + HITL approvals | ✅ Core. _Full real-time onboarding→agent bridge finalizing at launch._ |
| **CRM** | Contacts, companies, deals, pipelines; dedupe, soft-delete, keyboard-driven grid | ✅ Core |
| **Social** | Schedule + publish to 15+ platforms; carousels, threads, first-comment, video, per-platform settings; social inbox; RSS/recurring autopost; analytics | ✅ Core _(BYO-app for each platform; some platform analytics depth varies — see docs)_ |
| **WhatsApp** | Template builder, broadcast campaigns, contacts, conversation monitoring | ✅ Core _(BYO-app / your provider; our-backend WhatsApp BSP is a later phase)_ |
| **Inbox** | Unified 3-pane shared inbox across channels with inbound webhooks | ✅ Core _(inbound delivery needs a public endpoint — see NAT note)_ |
| **Campaigns / Email** | Email campaigns + marketing automation via SMTP/Brevo/Resend (no Gmail API needed) | ✅ Core _(BYO email provider)_ |
| **AI Studio** | Type-first AI workspace: content, assets, talking-avatar (script→video) builder | ✅ Core _(BYOK AI; video features use bundled ffmpeg)_ |
| **Canvas / Workflows** | Visual node-based automation builder (ReactFlow) + execution engine + scheduling | ✅ Core |
| **Forms** | Build forms, collect submissions, route them into the platform | ✅ Core |
| **Docs** | Rich-text docs (TipTap); optional Notion two-way sync | ✅ Core _(Notion sync = BYO-app)_ |
| **Analytics** | Module + account-level analytics; the agent grounds its strategy on your own data | ✅ Core _(your connected accounts; network-grounded benchmarks are a cloud feature)_ |
| **Voice** | AI voice/calling agent (Twilio + provider abstraction) | ⚠️ Core, **beta** _(enable via the `voice` compose profile; lazy-downloads an ML model)_ |

**Not in the fair-code core (they live in the commercial cloud, by design):** multi-tenancy / teams / org
RBAC, billing + pricing, white-label, SSO, advanced RBAC, managed-AI (our models), the **Connections Gateway**
(brokered OAuth + webhook ingress for self-hosters), and cloud ops. See
[fair-code, not open source](#-fair-code-not-open-source).

> **Honesty note:** modules are at different polish levels. Launch-critical surfaces (the agent, first-run,
> the dashboard, the screenshotted modules) are held to a near-perfect bar; the rest ship as **good,
> clearly-labeled beta**. Where a feature is not yet wired, the docs say so — we don't overclaim.

---

## 🔑 BYOK + BYO-app (the two doors)

MontrAI is built on a **bring-your-own** model. The self-host core never depends on us being in the loop:

- **BYOK — Bring Your Own (AI) Keys.** Every AI call routes through one client (`src/ai/client.ts`); you
  supply your own provider keys (OpenAI, Google, DeepSeek, Anthropic, etc.) in `.env`. Use frontier models on
  your own account — nothing is dumbed down, and you pay your provider directly. No key, no AI cost to you.

- **BYO-app — Bring Your Own (connected) Apps.** For every connection (social platforms, Notion, Shopify,
  Slack, Google, Meta, etc.) you register **your own** developer app and drop the client ID/secret into
  `.env` — exactly the self-hosted-n8n model. It works for **all** platforms, needs no approval from us, and a
  single-user install can stay in a platform's "testing mode" to skip verification entirely.

> **The second door (paid, optional, later):** a hosted **Connections Gateway** will let you connect to *our*
> verified apps and receive inbound webhooks without registering anything or exposing a public endpoint — the
> convenience layer. It is **not** part of the self-host core and is a later phase. The free BYO-app /
> BYOK doors work from day one and **never go away**.

---

## ⚖️ Fair-code, not open source

> **MontrAI is _fair-code_ / _source-available_ — please don't call it "open source."**

The code is **public and self-hostable**, but it is **not** under an OSI open-source license. MontrAI is
released under the **n8n Sustainable Use License (SUL)**.

**In plain English:**

- ✅ **Self-host it for your own business** — internal or commercial use, free, forever.
- ✅ **Modify it, extend it, build on it** for your own use.
- ✅ **Contribute** back.
- ❌ **Don't resell it as a hosted/managed service**, white-label it, or otherwise offer MontrAI itself as a
  product to third parties.

The commercial moat lives in a **private overlay** (multi-tenancy, billing, the Connections Gateway broker,
white-label, SSO, advanced RBAC, managed-AI, the curated/network-grounded agent brain, and cloud ops) — none
of which is required to run the full single-tenant platform yourself.

> **License status:** the `LICENSE` file (SUL text + FAQ) is part of the launch packaging. If it isn't present
> in this tree yet, it is being authored as part of the launch milestone. The intent above is binding.

See **[`LICENSE`](LICENSE)** for the full terms. The summary here is a convenience, not the license itself.

---

## 📚 Documentation

Start with **[`docs/overview.md`](docs/overview.md)** for the full architecture and module map.

**Modules:** [Agent](docs/modules/agent.md) ·
[CRM](docs/modules/crm.md) ·
[Social](docs/modules/social-media.md) ·
[WhatsApp](docs/modules/whatsapp.md) ·
[Inbox](docs/modules/inbox.md) ·
[Email/Marketing](docs/modules/marketing-email.md) ·
[Canvas](docs/modules/canvas.md) ·
[Ads & Analytics](docs/modules/ads-analytics.md) ·
[Integrations](docs/modules/integrations.md)

**Architecture & ops:** [System architecture](docs/architecture/system-architecture.md) ·
[Data flow](docs/architecture/data-flow.md) ·
[Folder structure](docs/architecture/folder-structure.md) ·
[Deployment](docs/infra/deployment.md) ·
[Environment](docs/infra/environment.md) ·
[Auth flow](docs/auth/auth-flow.md)

> The autonomous agent design lives in [`docs/modules/agent.md`](docs/modules/agent.md).

---

## 🏗️ Tech stack

Next.js 15 (App Router) + a custom Node/Socket.io server · MongoDB/Mongoose + PostgreSQL/pgvector ·
BullMQ/Redis · BetterAuth · Radix + Tailwind + shadcn/ui · ReactFlow · TanStack Table/Query · TipTap ·
Sentry + PostHog (both no-op when unset, so self-host ships clean).

---

## 🆘 Support

**Self-hosting is community-supported only — no SLA, no guarantees, no warranty.** File bugs and feature
proposals on the issue tracker; an **AI maintainer agent triages first-line** (best-effort, humans confirm
anything load-bearing). The **managed cloud is the supported path** — that's where SLAs and hands-on
operational help live. Full details in **[`CONTRIBUTING.md`](CONTRIBUTING.md)** (§ Support model).

---

## 🤝 Contributing

Contributions are welcome under the SUL. See **[`CONTRIBUTING.md`](CONTRIBUTING.md)** for the workflow, the
**overlay-boundary rules** (what may never enter the public core), the **CLA** ([`CLA.md`](CLA.md)), and the
**license-header expectation** on new source files — plus **[`SECURITY.md`](SECURITY.md)** for responsible
disclosure.

> **Status:** `CONTRIBUTING.md` and `SECURITY.md` are part of the launch packaging and may not be present in
> this tree yet.

---

## 📌 Provenance & license line

<!-- The build/release tooling stamps the exact source commit this public release was projected from. -->
**Source commit:** `<RELEASE_COMMIT_SHA>` &nbsp;·&nbsp; **Version:** `v0.1.0-oss` _(target launch tag)_

> _Placeholder — the release agent replaces `<RELEASE_COMMIT_SHA>` with the real projected commit at build
> time. This public repo is a projection of the private monorepo's `core/`; no private history is imported._

---

<div align="center">

**MontrAI™** is a trademark of its maintainers. Licensed under the **n8n Sustainable Use License**.
Fair-code · source-available · not "open source."

<sub>© MontrAI. Self-host for your own business: yes. Resell as a hosted service: no.</sub>

</div>
