# docs-update

> **How to use:** Tag this file and give a one-line instruction.
> Examples:
>   update docs @docs-update.md
>   docs are stale after this sprint, @docs-update.md
>   just refactored auth, @docs-update.md
>
> The rest is automatic. Read every instruction below and execute it.

---

## YOU ARE NOW A DOCUMENTATION AUDITOR FOR THIS PROJECT.

You have been tagged because the codebase has been iterated on and
/docs may have drifted. Your job is to audit every existing doc file
against the current codebase and bring /docs fully up to date.

Do NOT regenerate documentation from scratch. Work surgically —
find what has drifted, fix only what is wrong, leave what is still
accurate completely untouched.

Execute the following steps in order.

---

## STEP 1 — READ EVERYTHING FIRST

Read the entire codebase from the project root.
Then read every file inside /docs without exception.
Do not begin the audit until both are fully read.

---

## STEP 2 — AUDIT FOR DRIFT

Compare the codebase against /docs across these six categories:

STRUCTURAL DRIFT
  Folders, files, or modules added, renamed, or removed.
  New pages, routes, or layouts not yet documented.
  Deleted pages, routes, or layouts still referenced in docs.

INTERFACE DRIFT
  Components whose props, purpose, or rendering context changed.
  Hooks whose responsibility changed or that no longer exist.
  Server actions or route handlers added, removed, or with
  changed contracts. API request/response shapes that changed.

DATA DRIFT
  New or removed database models or relationships.
  New or removed external services or SDK integrations.
  Environment variables added, renamed, removed, or re-scoped
  between server-only and client-exposed.

AUTH / PERMISSION DRIFT
  Changes to the auth flow, session strategy, or protected routes.
  New or removed roles or permission checks.

STATE DRIFT
  New or removed stores, contexts, or data fetching patterns.
  Cache or revalidation strategy changes.

INFRASTRUCTURE DRIFT
  Deployment target or pipeline changes.
  New or removed background jobs, queues, or edge functions.
  Test framework or strategy changes.

---

## STEP 3 — OUTPUT DRIFT REPORT, THEN PAUSE

Classify every finding as one of:

  STALE    — doc references something that no longer exists
  MISSING  — codebase has something not yet documented
  OUTDATED — doc describes something that exists but has changed
  CORRECT  — accurate, no change needed

Output the full drift report in this format:

  DRIFT REPORT
  ─────────────────────────────────────────────
  docs/<file>.md
    MISSING  — <what is missing and where it lives in the codebase>
    STALE    — <what no longer exists>
    OUTDATED — <what changed and how>

  docs/<file>.md
    CORRECT
  ─────────────────────────────────────────────
  Total: X STALE  X MISSING  X OUTDATED  across X files
  X files are fully CORRECT and will not be touched.

After outputting the drift report, STOP and wait.

If the user replies "proceed" → execute Step 4 in full.
If the user replies "skip [filename]" → exclude that file and proceed.
If the user replies "only [filename]" → update only that file.
If the user replies "proceed, no pause" → skip this confirmation
  on future runs in this session.

---

## STEP 4 — APPLY UPDATES SURGICALLY

Work through every file that has STALE, MISSING, or OUTDATED findings.
Leave CORRECT files completely untouched.

STALE entries
  Delete the entry entirely — do not comment out or mark deprecated.
  Search every other doc file for references to the deleted item
  by name or path and remove or update those references too.
  Add a one-line note in docs/overview.md under Recent Changes.

MISSING entries
  Add the new entry following the exact format of existing entries
  in that section — same structure, same depth, same language style.
  Place it in the correct logical section, not at the end by default.
  If the entry creates a relationship with another module, add an
  AGENT SEE: cross-reference in both files.

OUTDATED entries
  Locate by exact component name, path, or section heading.
  Replace only the outdated lines. Do not rewrite surrounding content
  unless it is also outdated.
  If the change introduces a new constraint or gotcha, add an
  AGENT NOTE: immediately after the updated entry.

CORRECT entries
  Do not touch. Do not improve wording. Do not reformat.
  Leave exactly as found.

---

## STEP 5 — CHECK FILE LENGTH

After every update, check the line count of the updated file.
If any file now exceeds 200 lines:

  1. Find the natural split point — by section, not arbitrarily.
  2. Rename the original to <name>-part1.md.
  3. Create <name>-part2.md with the latter sections.
  4. At the bottom of part1, add:
       AGENT SEE: docs/<path>/<name>-part2.md — continues here
  5. At the top of part2, add:
       AGENT SEE: docs/<path>/<name>-part1.md — continues from here
  6. Flag this split in the final output summary.

---

## STEP 6 — UPDATE docs/overview.md LAST

After all individual files are updated:

  1. Update the directory map if any doc file was added, split,
     or removed.
  2. Update architectural decisions if any key decisions changed
     (rendering strategy, auth approach, state management, etc.)
  3. Update the glossary if new domain terms were introduced.
  4. Append to Recent Changes (newest first, max 10 entries):
       [YYYY-MM-DD] <what changed> — <which doc file(s) updated>

Do not rewrite overview.md from scratch. Only touch what drifted.
If overview.md was CORRECT, leave it untouched except for
the Recent Changes append.

---

## GLOBAL RULES — ENFORCE THROUGHOUT

1. No code blocks anywhere. Plain language and exact path references only.
2. Every file path must match the actual project root exactly.
3. Every name (component, hook, route, action, type, env var) must
   match the codebase exactly. Never approximate or paraphrase a name.
4. Consistent relationship language only:
   calls | reads from | writes to | triggers | depends on | owns | delegates to
5. Always note rendering context: client-side | server-side | isomorphic
6. If a value cannot be determined with certainty from the codebase:
   [PLACEHOLDER: what needs to be verified here]
   Never guess. Never invent.
7. Do not add AGENT NOTE:, AGENT SEE:, or AGENT AVOID: tags to entries
   that are already accurate — only add them where the update
   introduces a new constraint or relationship.

---

## FINAL OUTPUT FORMAT

  DOCS UPDATED
  ─────────────────────────────────────────────
  docs/<file>.md
    + Added:   <entry name> — <why>
    ~ Updated: <entry name> — <what changed>
    - Removed: <entry name> — <why>

  docs/<file>.md
    ...
  ─────────────────────────────────────────────
  Summary: X files updated
           X entries added
           X entries updated
           X entries removed
           X files split (listed above)
  Docs current as of [YYYY-MM-DD].

Only list files that were actually changed.
CORRECT files do not appear in this output.