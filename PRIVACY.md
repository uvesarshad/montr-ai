# MontrAI Privacy Policy

**Policy version:** 1.0
**Last updated:** 2026-06-26
**Applies to:** the MontrAI fair-code / source-available core (self-hosted) and the MontrAI cloud service.

> **TL;DR — telemetry is opt-in and off by default.** MontrAI does **not** send any usage,
> diagnostic, or outcome data anywhere until *you* explicitly turn it on. If you never flip the
> toggle, nothing in this policy's "what we collect" section ever happens on your install. When you
> do opt in, we collect the **minimum** needed, **coarsen it on your machine before it leaves**, and
> only ever use it in **aggregate**. We never collect your contacts, your message content, your brand
> name, or your credentials.

---

## 1. What we collect (and only if you opt in)

There are two separate, independently-controlled telemetry systems. Both are **opt-in and off by
default**. Neither sends anything until you enable it.

### (A) Product & operations telemetry

If enabled, this helps us find crashes and understand which features get used so we can fix and
improve them. In plain English, it covers:

- **Crash and error reports** — that something broke, and a technical stack trace (never your data).
- **Feature usage** — which screens and features were opened, as anonymous counts.
- **Setup signals** — e.g. that a `docker compose up` install completed, so we know the install path
  works.
- **Anonymous page/interaction events** — pseudonymous device-level events, with no business outcomes
  attached.

This is tied only to a **pseudonymous device identifier**, not to your name or your business.

### (B) The improvement flywheel (anonymized, aggregated outcomes)

If enabled, this lets MontrAI's AI learn *which kinds of strategies tend to work for which kinds of
businesses* — so the product gets smarter for everyone. It is **aggregated and anonymized by design**:
it is built so that no individual brand's data can be singled out (see [section 3](#3-how-we-anonymize-it)).

For each opted-in mission/strategy outcome, we collect a small, structured record made of **coarse
categories and bucketed ranges**, for example:

- **Industry vertical** — as a coarse bucket (e.g. "DTC skincare"), one of roughly 50 categories.
  Never your brand name, domain, or logo.
- **Goal type** — what was attempted, as a category (e.g. "grow Instagram orders").
- **Channels used** — e.g. Instagram, email.
- **Strategy shape** — the cadence and content-mix pattern, expressed as **categories and ranges**,
  never as free text.
- **Outcome** — a KPI and a **bucketed range** (e.g. "orders, +10–25%"). Never a raw number.
- **Time horizon** — e.g. 90 days.
- **Template used** — which mission template was the starting point.
- **Install type** — "cloud" or "self-hosted", used only for weighting.

That is the entire flywheel payload. You can see the exact JSON that would be sent from the in-app
**"See exactly what we collect / see a sample payload"** link before you ever opt in.

---

## 2. What we NEVER collect

Regardless of any setting, MontrAI's telemetry **never** collects:

- ❌ Your **brand name, domain, logo**, or any free-text identifier of your business.
- ❌ The **content** of your messages, posts, emails, or calls.
- ❌ **Contact PII** — names, emails, phone numbers, or any CRM records of your customers.
- ❌ **OAuth tokens or credentials** — these stay encrypted in your install and never appear in
  telemetry.
- ❌ **Raw metric values** that could fingerprint a specific brand (e.g. exact follower counts or
  exact revenue).
- ❌ **IP addresses tied to flywheel events.** (Product/ops telemetry may retain a coarse country-level
  geo for operations; the flywheel does not.)
- ❌ **Anything at all from an install that has not opted in.**

---

## 3. How we anonymize it

This is the part a privacy regulator will ask about, so here it is in plain language:

- **Coarsening happens on your machine, before anything is sent.** Your self-hosted or cloud worker
  converts outcomes into buckets and maps your vertical to a coarse category **before transmission**.
  Raw values never leave your environment.
- **k-anonymity suppression (k = 25).** A given combination of *(vertical × goal × channel × strategy
  shape)* only becomes usable once **at least 25 different installs** have contributed to it. Until
  then, that combination is **suppressed** — so no query can ever surface a result that reflects a
  single business.
- **No re-identification keys.** Flywheel records carry a **rotating, salted pseudonymous batch ID**,
  not a stable user ID — so records cannot be stitched back together into one brand's history.

The flywheel is built to learn the *pattern*, never the *brand*.

---

## 4. Lawful basis & retention

- **Lawful basis: consent.** We process opted-in telemetry on the basis of your **explicit consent**.
  We record the timestamp of your consent and the version of this policy you consented to. You can
  withdraw consent at any time (see [section 5](#5-your-rights--how-to-exercise-them)).
- **Retention:** Raw opted-in flywheel events are retained for **`<<NEEDS DECISION: retention window,
  e.g. 24 months>>`**, after which they are deleted. Aggregated data that has passed the k-anonymity
  threshold is **no longer about an identifiable individual or business**, and may be retained
  indefinitely as anonymous statistics.

> **Note:** the exact raw-event retention window is pending a final decision and counsel review (see
> [section 8](#8-status--review-notes)).

---

## 5. Your rights & how to exercise them

Where applicable law (such as GDPR or CCPA/CPRA) grants you these rights, you can:

- **Access / export** — request a copy of what your install has contributed.
- **Delete** — request deletion of your install's contribution. This purges your install's
  not-yet-aggregated raw events. Data that has already been combined into k-anonymous aggregates is
  anonymous and cannot be tied back to you, so it is exempt from deletion (we state this plainly so
  there are no surprises).
- **Opt out / withdraw consent** — turn the telemetry toggle **off** at any time, in **Settings →
  Privacy** (cloud) or your install's first-run / settings screen (self-hosted). This stops all
  collection **immediately**.

To make an access or deletion request, contact us at **`<<CONTACT: privacy@montrai.example — replace
with the real privacy contact address>>`**.

---

## 6. Sub-processors

When telemetry is enabled, your data may be processed by:

| Sub-processor | Role | Used for |
|---|---|---|
| **PostHog** | Product analytics platform | System (A) product & operations telemetry, and (if configured as the transport) System (B) flywheel ingestion |
| **MontrAI's own database** | First-party storage | System (B) flywheel aggregate store |

If PostHog is also the transport for the flywheel (System B), a **Data Processing Agreement (DPA) with
PostHog is required** and is tracked as a launch-blocking item (see [section 8](#8-status--review-notes)).

**Cross-border transfers:** if your data is stored outside your region (for example, an EU user's data
stored outside the EU), the transfer relies on the appropriate safeguards (such as Standard
Contractual Clauses). `<<NEEDS COUNSEL: confirm transfer mechanism and sub-processor regions.>>`

---

## 7. Changes to this policy & version history

We will update this policy as the product evolves. Material changes that affect what is collected or
how it is used will be reflected by a new policy version and, where required, a fresh consent prompt.
Because we record which policy version you consented to, changes never retroactively expand what we
collect from data you already shared.

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-06-26 | Initial public privacy policy, derived from the MontrAI telemetry data-rights & privacy spec. Establishes opt-in/off-by-default telemetry, the two-system (product/ops vs flywheel) model, the never-collected list, coarsen-at-source + k-anonymity (k = 25) anonymization, consent-based lawful basis, data-subject rights, and PostHog as a sub-processor. |

---

## 8. Status & review notes

> This policy is a first public draft and is **pending legal counsel review before telemetry ships.**
> Open items, each tracked as launch-blocking:
>
> 1. **Counsel review** of this entire policy (GDPR / CCPA-CPRA wording, lawful-basis and
>    rights language).
> 2. **DPA with PostHog** — required if PostHog is the transport for flywheel (System B) data.
> 3. **Retention-window decision** — finalize the raw-event retention period in
>    [section 4](#4-lawful-basis--retention) (placeholder currently shown).
> 4. **Contact address** and **cross-border transfer mechanism** — fill the placeholders in
>    [sections 5](#5-your-rights--how-to-exercise-them) and [6](#6-sub-processors).
>
> Once these are resolved, remove this section and the `<<…>>` placeholders.
