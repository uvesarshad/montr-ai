# Security Policy

We take the security of MontrAI seriously. Thank you for helping keep MontrAI and its users safe.

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues, discussions, or pull
requests.** Public disclosure before a fix is available puts every self-hoster at risk.

Instead, report it privately through one of the following:

- **Email:** `security@montrai.com` *(placeholder — confirm/replace with the live address before
  launch)*
- **GitHub private vulnerability reporting:** use the repository's
  **Security → Report a vulnerability** ("Privately report a vulnerability") flow, if enabled.

When you report, please include as much of the following as you can:

- A description of the vulnerability and its potential impact.
- Step-by-step instructions to reproduce it (a minimal proof-of-concept is ideal).
- The affected version, commit, or self-host configuration.
- Any logs or screenshots (with secrets and personal data redacted).

Please report only vulnerabilities you have found yourself, and do not run tests against
infrastructure you do not own (e.g. someone else's hosted instance). Do not access, modify, or
exfiltrate data that is not yours.

## What to expect

- **Acknowledgement:** we aim to acknowledge your report within **3 business days**.
- **Assessment & updates:** we will investigate, keep you informed of progress, and let you know
  when a fix is planned or released.
- **Coordinated disclosure:** we ask that you give us a reasonable window to ship a fix before any
  public disclosure. We're happy to credit you in the release notes (unless you prefer to remain
  anonymous).

> **Note on support:** MontrAI is **fair-code / source-available** and self-hosting is
> **community-supported only, with no guarantees or SLA** (see [`CONTRIBUTING.md`](./CONTRIBUTING.md)).
> Security reports are the exception — we treat them as a priority regardless of support tier, on a
> best-effort basis.

## Supported versions

Security fixes are applied to the **latest released version** of the public core. We do not
back-port fixes to older releases.

| Version            | Supported          |
| ------------------ | ------------------ |
| Latest release     | ✅ Yes             |
| Older releases     | ❌ No — please upgrade |

If you are self-hosting, **stay on the latest release** to receive security fixes. Pin your
deployment to a tagged release rather than an arbitrary commit, and upgrade promptly when new
releases ship.

## Scope

This policy covers the **public core** in this repository. The hosted/cloud service and the private
commercial overlay are covered separately by the operator of that service.
