# Contributing to MontrAI

Thanks for your interest in MontrAI. This repository is the **public core** of MontrAI — a
complete, single-tenant application you can self-host and build on.

> **A note on terms.** MontrAI is **fair-code / source-available**, *not* "open source." It is
> licensed under the **n8n Sustainable Use License (SUL)** — see [`LICENSE`](./LICENSE). You may
> self-host and modify it for your own internal business use. You may **not** resell it as a hosted
> service or white-label it. Please use the words "fair-code" or "source-available" when describing
> the project — never "open source."

---

## 1. How to contribute

1. **Open an issue first** for anything non-trivial (a bug with a clear repro, or a feature
   proposal). Small, obvious fixes (typos, docs, a tight bug fix) can go straight to a PR.
2. **Fork** the repo and create a topic branch off the default branch.
3. **Make your change** following the existing patterns. Before opening a PR, make sure the local
   gates are green:
   ```bash
   npm run typecheck
   npm run lint
   npm run test
   ```
4. **Open a Pull Request** against the default branch. Fill out the PR template. Keep PRs focused —
   one logical change per PR is far easier to review and accept.
5. **Sign the CLA** (see §3) — a bot will prompt you automatically on your first PR.
6. **CI must be green.** Every PR runs an automated gate set (see §4). PRs that fail any gate will
   not be merged.

A scheduled **AI maintainer agent** triages issues, labels them, reviews PRs for quality and
license headers, and drafts replies. It removes the toil and keeps turnaround fast — but **humans
approve every merge**. The agent proposes; the gates dispose.

---

## 2. The overlay boundary — what may **never** enter the public core

MontrAI follows an **open-core** model. The public core in this repository is a complete
**single-tenant** product. The commercial, multi-tenant capabilities live in a **separate private
overlay** that the hosted/cloud build composes on top of this core. This boundary is **load-bearing**
and is enforced in CI.

**The following surfaces must never be added to or imported by the public core. PRs that introduce
them will be rejected automatically:**

- **Multi-tenancy** — organizations/teams, cross-tenant scoping, and the multi-tenant tenancy
  implementation. The public core ships a **single-tenant** implementation behind a
  tenancy-strategy interface; the multi-tenant implementation is overlay-only.
- **Billing & payments** — payment-provider integrations, subscription/plan CRUD, pricing pages.
- **Plan enforcement / credit metering (real implementation)** — the core ships the **interfaces**
  with permissive **always-allow / unlimited** defaults; the real enforcement lives in the overlay.
- **Connections Gateway / broker** — the token mint/refresh broker, the outbound worker→gateway
  channel, API relay + metering, and webhook ingress.
- **White-label** — white-label profiles, theming-for-resale, and agency reporting.
- **SSO** and **advanced RBAC** (beyond the single-tenant baseline).
- **Managed-AI** — provider keys, brokered/managed model access, queue fairness, and any
  cloud-side AI convenience layer. The core is **BYOK** (bring-your-own-key) only.
- **Cloud / super-admin operations** — the cloud control plane, super-admin ops surfaces, and any
  managed-hosting tooling.

**Why the boundary exists:** it keeps the public core a clean, standalone single-tenant product;
it lets the core be developed once and projected outward; and it ensures no closed/commercial code
ever leaks into the public repository. The core must also stay **overlay-agnostic** — it must
compile and run fully standalone, with no import path reaching into overlay-only surfaces.

If your contribution feels like it needs one of the above, it belongs in the overlay, not here.
Open an issue to discuss the right extension point instead.

---

## 3. Contributor License Agreement (CLA)

All contributions require a signed **Contributor License Agreement** — see [`CLA.md`](./CLA.md) for
the full terms. This lets the project maintain the fair-code licensing model (including the dual
public-core / private-overlay structure) on a sound legal footing.

- You do **not** need to sign anything in advance.
- On your **first PR**, the **CLA bot** will post a comment with a link to sign.
- Once signed, the bot records it and you won't be prompted again for future PRs.
- A PR cannot be merged until the CLA check is satisfied.

---

## 4. CI gates (the checklist, enforced)

Every PR must pass, before any human can merge it:

1. **Secret scan** (`gitleaks`) — blocks any PR introducing a secret pattern.
2. **Overlay-boundary guard** — fails any PR that adds or imports a commercial-overlay surface
   (see §2): billing, gateway/broker, white-label, SSO, advanced-RBAC, managed-AI, cloud ops.
3. **Green gates** — `typecheck` + `lint` + `vitest`.
4. **License-header check** on new source files. **Every new source file must carry the project
   license header** (a short SPDX-style banner identifying it as MontrAI under the n8n Sustainable
   Use License). Copy the header from an existing sibling file in the same directory; if your editor
   strips it, the check will flag the PR. Don't invent a different license notice — the SUL banner is
   the only accepted header.
5. **CLA check** (see §3).

---

## 5. Support model — please read before opening a support request

> **Self-hosting MontrAI is community-supported only. There are no support guarantees, no SLA, and
> no warranty of any kind. The managed cloud is the supported path — self-host is best-effort.**

- **Two tiers, one is supported.** Self-host runs on *community support* (this issue tracker,
  best-effort, no commitments). The **managed cloud** is the **supported path**: it is where SLAs,
  guaranteed response times, and hands-on operational help exist. If uptime or response guarantees
  matter to you, use the cloud rather than self-hosting.
- This repository's issue tracker is for **bugs and feature proposals**, not for hands-on
  hosting/operations help, "it won't start on my server" debugging, or one-on-one consulting.
- The **AI maintainer agent is the first-line responder**. It triages, labels, and drafts replies
  on every new issue and PR — expect its reply *first*, often within minutes. It is helpful but
  **unproven**: treat its responses as best-effort, not authoritative, and a human confirms anything
  load-bearing.
- **Triage expectations.** Issues are triaged on a best-effort basis with **no committed response
  time**. Well-scoped, reproducible bug reports and focused PRs get attention first; vague reports,
  feature-bundles, and "please help me set this up" threads may be closed or relabeled without a
  detailed reply. A clear, minimal, reproducible report is the single best way to get a real fix
  landed quickly.
- If you need guaranteed support, SLAs, or operational help, that is the **commercial/cloud**
  offering — not part of the fair-code self-host package.

When you file a bug, include: what you expected, what happened, exact repro steps, your environment
(OS, Node version, how you're running it — e.g. `docker compose`), and relevant logs with secrets
redacted.

---

## 6. Security

**Do not** open public issues for security vulnerabilities. Follow the responsible-disclosure
process in [`SECURITY.md`](./SECURITY.md).

---

## 7. Code of conduct

Participation in this project is governed by our [Code of Conduct](./CODE_OF_CONDUCT.md). By
contributing, you agree to uphold it.

---

Thanks for helping make MontrAI better. Welcome aboard.
