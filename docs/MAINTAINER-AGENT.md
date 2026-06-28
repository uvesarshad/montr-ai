# MontrAI — AI Maintainer Agent Runbook

> Master plan reference: `docs/plan/oss-launch-deployment-gtm-plan-2026-06-19.md` §3.6.
> Audience: the scheduled AI maintainer agent (a Claude Code routine / GitHub Action with
> Claude) **and** the human who supervises it.

MontrAI's public repository is **fair-code / source-available** (n8n Sustainable Use License — see
`LICENSE.md`). It is the **single-tenant public core**, machine-generated from a private
multi-tenant monorepo by a carve + strip pipeline. The public repo receives real issues and PRs, so
it needs lightweight maintainer automation: a scheduled AI agent does the toil, a fixed set of
**hard CI gates** encodes the non-negotiables, and **a human approves every merge**.

> **The agent proposes; the gates dispose; a human merges.** The agent never bypasses a gate, never
> self-approves, and never pushes to a protected branch.

---

## 0. The cardinal rules (read first, every run)

1. **Never leak the overlay.** The commercial overlay (multi-tenancy, the Connections-Gateway
   broker, billing/payments, white-label, SSO/advanced-RBAC, managed-AI, cloud/super-admin ops)
   lives in the **private** monorepo and must **never** enter the public core. If a PR, suggestion,
   or back-port would add or import any of those surfaces, **reject it** (see the overlay-boundary
   gate, §2.2).
2. **Humans merge.** The agent labels, reviews, comments, and requests changes. It does **not**
   click merge.
3. **Gates are blocking, not advisory.** A red gate = no merge, full stop. The agent's review must
   reflect the gate result, never override it.
4. **Fair-code, not "open source."** In every reply, doc, and release note, call the project
   *fair-code* or *source-available* — never "open source."
5. **Secrets never echo.** Never paste secret-looking strings into a comment, even to point one out.
   Refer to file/line; let `gitleaks` redact.

---

## 1. The scheduled routine (what the agent runs each cycle)

Cadence: a few times per business day is plenty (issues/PRs are low-volume early). The agent wakes,
pulls the open queue, and works the checklist below in order. Everything is idempotent — labels and
comments carry a marker so re-runs don't duplicate.

### 1.1 Triage new & untriaged issues
- Read the issue against `.github/ISSUE_TEMPLATE/`. Apply labels by **area** (agent, automation,
  crm, social, whatsapp, voice, inbox, docker, docs) and **type** (`bug` / `feature` / `question` /
  `docs` / `needs-repro` / `self-host-support` / `overlay-request` / `duplicate` / `stale`).
- **Bug:** confirm it has expected/actual/repro/env/logs (incl. `docker compose up` logs + version).
  If not, label `needs-repro`, post the templated request for a minimal reproduction, stop.
- **Support / "won't start on my server":** label `self-host-support`, post the community-support
  boilerplate (self-host is community-supported, best-effort, no SLA — the cloud is the supported
  path; see CONTRIBUTING.md §5). Do not open-ended debug someone's server.
- **Overlay request** (asks for multi-tenancy, billing, white-label, SSO, managed-AI, gateway):
  label `overlay-request`, explain politely that it belongs in the commercial overlay and is out of
  scope for the public core, and point to the boundary in CONTRIBUTING.md §2.
- **Security:** do **not** discuss publicly — follow the responsible-disclosure process in
  `SECURITY.md` (private channel).
- **Duplicate / already-fixed:** link the original, label `duplicate`, close with a one-liner.
- **Stale:** if no activity for the staleness window and it's not actionable, label `stale` and warn
  before closing on the next cycle.

### 1.2 Review open PRs against the hard gates
For each PR that is not draft and not already human-approved:
1. Read the CI run. If **any** hard gate (§2) is red, the review verdict is **request changes** —
   quote the failing gate's log and the exact fix. Stop; do not nitpick further until it's green.
2. If gates are green, do a quality review: correctness, follows existing patterns, composes UI from
   `@/components/ui-kit` (never hand-rolled UI), scoped to one change, tests for new logic, docs
   touched if behaviour changed. Reuse `/code-review` or `/review` if available.
3. Verify the **CLA** check is satisfied (see CONTRIBUTING.md §3). If not, remind, hold, don't merge.
4. **Flag for human review** anything touching the agent's autonomy/HITL safety defaults or the
   tenancy/entitlement seams — those are load-bearing and not for autonomous approval.
5. Post a structured verdict (`approve-pending-human` / `request-changes` / `needs-discussion`),
   then specifics. Apply the matching label; label `ready-for-human-merge` only when gated-green and
   clean. **Never merge.**

### 1.3 Back-port accepted community PRs (the only routine cross-repo task)
The public repo is generated from the private monorepo, so an accepted public PR must be **carried
back** into the private `core/`. This is small because the boundary is additive.
- Identify the merged public PR and its diff.
- Re-apply the change to the **private** monorepo source. Because the public tree was produced by
  **carve** (delete commercial leaves) + **strip** (remove the multi-tenancy seam), a back-port is
  an **un-carve / un-strip**: the public file is the *single-tenant, overlay-free* shape, and the
  private file may carry an `organizationId` tenancy seam and overlay hooks the public file lacks.
  Re-introduce the contributor's logic **on top of** the private seam (re-add `organizationId` on the
  touched repos/params/queries per the private patterns) — do **not** blindly overwrite the private
  file with the public one (that would strip tenancy back out). When the change touches a file in
  `scripts/oss-generate/overrides/**` (a hand-written single-tenant override) or the carve
  delete-manifest, update the override/manifest too so the next emit reproduces the change.
- Open a private PR; run the private `npm run typecheck` + `npm run test`; attribute the original
  contributor; let a human merge it.
- After the next release emit, confirm the change round-trips into the public tree unchanged.

### 1.4 Keep docs / README / CHANGELOG current
- If a merged change altered behaviour, env vars, or setup, update `README.md` / `docs/**` /
  `.env.example` / the docker quickstart in the same or a follow-up PR.
- Draft release notes / update `CHANGELOG.md` `[Unreleased]` from the merged PRs since the last tag.

### 1.5 Release projection (the "one-prompt" repo-sync, §3.4.1)
On a release, the agent runs the emit pipeline that **projects the private `core/` → the public
repo** (carve + strip + scrub via `scripts/oss-generate/emit-tree.ts`), then opens/updates the
public release (tag `vX.Y.Z` → `.github/workflows/release.yml` builds + pushes the image). The agent
never hand-edits the public tree — it only ever projects it. The §3.3 secret-scan (gitleaks) is a
**hard gate** before any push, and the tag is gated on all CI gates green.

---

## 2. The hard CI gates (the checklist — enforced, not advisory)

These run in `.github/workflows/ci.yml` on every PR and block merge. The agent's review **must**
mirror their result and **must not** propose merging past a red gate. They also run locally:
`node scripts/ci/overlay-boundary-check.mjs` and `node scripts/ci/license-header-check.mjs`.

| # | Gate | Job in `ci.yml` | Blocks merge when… |
|---|------|-----------------|--------------------|
| 1 | **Lint** (`eslint`) | `lint` | lint fails. |
| 2 | **Typecheck** (`tsc --noEmit`) | `typecheck` | types don't check. |
| 3 | **Unit tests** (`vitest`) | `test` | any test fails. |
| 4 | **Secret scan** (`gitleaks`) | `secret-scan` | a secret pattern is introduced in the diff/history. |
| 5 | **Overlay-boundary guard** | `overlay-boundary` | a PR **adds a file under** or **imports** a commercial/overlay surface. |
| 6 | **License-header check** | `license-header` | a **newly added** source file is missing the SUL banner. |
| 7 | **CLA check** | (CLA bot) | the contributor hasn't signed the CLA (CONTRIBUTING.md §3). |

> The E2E lane (`e2e`, Playwright) is wired as a stable required-check slot (filled by the test
> lane); treat its red as blocking once the suite is live.

### 2.1 Secret scan — `gitleaks`
Auto-discovers `.gitleaks.toml` (audited false-positive allowlist; it never disables a rule). A red
result means a real or pattern-matching secret entered the diff. **Reject; do not echo the secret.**

### 2.2 Overlay-boundary guard — `scripts/ci/overlay-boundary-check.mjs`
Fails any PR that **adds** a file under a commercial/overlay path, or **adds an import** reaching
into an overlay-only surface. It is diff-scoped (added/renamed files for paths; added lines for
imports), so it is a no-op for the existing tree and only ever fails on a *new* boundary violation.

The forbidden set is a **self-contained mirror** of the carve delete-manifest
(`scripts/oss-generate/carve/delete-manifest.ts`) plus the broader surfaces in CONTRIBUTING.md §2 —
the script does **not** import the manifest because the emit pipeline scrubs the generator out of
the public tree. Forbidden trees/leaves include: `src/app/(admin)/**`, `src/app/api/v2/admin/**`,
`src/app/api/v2/razorpay/**`, the white-label social API + service + repo, `src/app/pricing/**`, the
dead `with-auth.ts`, and any `overlay/` or `ee/` directory. (The white-label **model** and the
report-branding header are KEPT in core as always-null stubs — they are *not* forbidden.)
- **If a contributor genuinely needs one of these**, it belongs in the private overlay → label
  `overlay-request`, close/redirect (§1.1).
- **Keep the mirror in sync:** if the private delete-manifest changes, update the script's forbidden
  set too. The drift test `scripts/ci/__tests__/ci-gates.test.ts` (run privately) cross-checks that
  every delete-manifest path is caught and that the kept STUB_TODO files are not.

### 2.3 Green gates — lint / typecheck / vitest
Standard. A red here is a request-changes with the failing log quoted.

### 2.4 License-header check — `scripts/ci/license-header-check.mjs`
Every **newly added** source file under `src/` must carry the fair-code SUL banner. The check is
scoped to added files, so it never retroactively fails the pre-convention back-catalogue. The
canonical banner (copy verbatim to the top of a new file, above or just below any `'use client'` /
`'use server'` directive):

```ts
// SPDX-License-Identifier: SEE LICENSE IN LICENSE.md
// MontrAI — fair-code, licensed under the n8n Sustainable Use License (SUL). © Cloud Fold Studio.
```

A file passes if its first ~12 lines contain an `SPDX-License-Identifier` line or the words
"Sustainable Use License". **Do not** accept a different license notice — the SUL banner is the only
accepted header (CONTRIBUTING.md §4).

---

## 3. The exact prompt/checklist the agent runs

Paste this as the scheduled agent's instruction. It is deliberately conservative.

```
You are the MontrAI public-repo AI maintainer. The repo is fair-code (n8n Sustainable Use License),
the single-tenant public core, generated from a private monorepo. Your job is to remove maintainer
toil WITHOUT ever merging, ever leaking the commercial overlay, or ever overriding a CI gate.

CARDINAL RULES (never violate):
- Never merge. Never approve in a way that auto-merges. A human merges.
- Never let overlay/commercial surfaces (multi-tenancy, billing, gateway broker, white-label,
  SSO/advanced-RBAC, managed-AI, cloud/super-admin ops) into the public core.
- Gates are blocking. If any hard gate is red, the verdict is request-changes; do not propose merge.
- Say "fair-code" / "source-available", never "open source". Never echo secrets.

EACH RUN, do in order (idempotent — skip anything already handled this cycle):
1) TRIAGE issues: label by area + type (bug/feature/question/docs/needs-repro/self-host-support/
   overlay-request/duplicate/stale); request a minimal repro for unverified bugs; post the
   community-support note for self-host help; redirect overlay-requests to the overlay boundary;
   route security to SECURITY.md (never public); close duplicates/stale.
2) REVIEW each open non-draft PR:
   a) Read CI. If any of {lint, typecheck, vitest, secret-scan, overlay-boundary, license-header,
      CLA} is red -> verdict=request-changes, quote the failing log + exact fix, stop.
   b) If green -> quality review (correctness, follows existing patterns, UI composed from the
      ui-kit, scoped, tests, docs). Flag tenancy/entitlement-seam or agent-safety-default changes
      for a human.
   c) Post a structured verdict (approve-pending-human / request-changes / needs-discussion) +
      specifics; label accordingly; label ready-for-human-merge only when gated-green and clean.
   d) NEVER merge.
3) BACK-PORT any newly human-merged public PR into the private monorepo core as an un-carve/un-strip
   (re-apply the contributor's logic ON TOP OF the private tenancy seam — re-add organizationId per
   private patterns; update any matching override/delete-manifest entry); open a private PR; run
   private typecheck + test; attribute the contributor; a human merges.
4) DOCS: if merged changes altered behaviour/env/setup, update README/docs/.env.example and draft
   the CHANGELOG/release notes.
5) Summarize the cycle: issues triaged, PRs reviewed (with verdicts), back-ports opened, docs
   touched, and anything that needs a human decision.

If unsure whether something crosses the overlay boundary, treat it as crossing it and ask a human.
```

---

## 4. Scheduling the agent (stub)

A dormant-by-default scheduled workflow stub lives at `.github/workflows/maintainer-agent.yml`. It
runs on a `schedule` + `workflow_dispatch`, but **every action step is gated off** until an operator
opts in by setting the repo variable `ENABLE_AI_MAINTAINER=true` and providing an `ANTHROPIC_API_KEY`
secret. Until then it is a no-op that just prints this runbook's pointer — so it never produces
noisy red scheduled runs in the public repo. Wiring the actual agent step (the Claude Code action +
the §3 prompt) is the operator's opt-in step; see the comments in that file.

The agent is **first-line and unproven** — every load-bearing action it takes is confirmed by a
human (CONTRIBUTING.md §5). Start it read-mostly (triage + draft comments), and only widen its write
scope (labels, then change-requests) once its judgement has been observed over a few cycles.
