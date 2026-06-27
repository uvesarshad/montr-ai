/**
 * SSRF Guard
 *
 * Resolves a URL's hostname and refuses any request targeting:
 *   - private IPv4 ranges (10/8, 172.16/12, 192.168/16, 169.254/16, 127/8, 100.64/10)
 *   - IPv6 loopback / link-local / unique-local
 *   - cloud metadata endpoints (169.254.169.254, fd00:ec2::254)
 *   - non-http(s) schemes
 *
 * Two APIs:
 *   - `assertSafeOutboundUrl(url)` — validates URL; throws if unsafe.
 *   - `safeOutboundFetch(url, init)` — validates THEN fetches, with DNS pinning
 *     so the resolved IP at validation time is also the one fetch dials. This
 *     closes the TOCTOU/DNS-rebinding window the plain `assert + fetch` pair
 *     would otherwise leave open.
 */

import { promises as dns } from 'dns';
import net from 'net';
import { Agent, fetch as undiciFetch } from 'undici';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.goog',
]);

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => Number.isNaN(p) || p < 0 || p > 255)) {
    return true; // malformed — refuse
  }
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local + AWS/GCP metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1') return true;
  if (lower === '::') return true;
  if (lower.startsWith('fe80:')) return true; // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
  if (lower.startsWith('ff')) return true; // multicast
  // IPv4-mapped IPv6: ::ffff:a.b.c.d
  const v4mapped = lower.match(/^::ffff:([0-9.]+)$/);
  if (v4mapped && isPrivateIPv4(v4mapped[1])) return true;
  return false;
}

function isPrivateAddress(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return isPrivateIPv4(ip);
  if (family === 6) return isPrivateIPv6(ip);
  return true; // not a valid IP — refuse
}

export async function assertSafeOutboundUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Outbound URL is malformed.');
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`Outbound protocol "${parsed.protocol}" is not allowed (use http or https).`);
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname) {
    throw new Error('Outbound URL has no hostname.');
  }
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new Error(`Outbound host "${hostname}" is blocked.`);
  }

  // If the host is already a literal IP, validate it directly.
  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      throw new Error(`Outbound IP "${hostname}" is in a blocked range.`);
    }
    return;
  }

  // Otherwise resolve via DNS and refuse if any answer is private.
  let addresses: { address: string; family: number }[];
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Outbound DNS lookup failed for "${hostname}": ${message}`);
  }

  for (const { address } of addresses) {
    if (isPrivateAddress(address)) {
      throw new Error(`Outbound host "${hostname}" resolves to a blocked address (${address}).`);
    }
  }
}

/**
 * Resolve the URL once, validate every answer, and return the first usable IP.
 * The caller dials this exact IP via `safeOutboundFetch` so the IP we validate
 * is the IP we connect to — no second DNS round-trip the attacker can race.
 *
 * Returns `null` for hostnames that are already IP literals (the caller dials
 * them directly without DNS substitution).
 */
async function resolveSafeIp(hostname: string): Promise<{ ip: string; family: 4 | 6 } | null> {
    if (net.isIP(hostname)) return null;
    const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
    for (const { address } of addresses) {
        if (isPrivateAddress(address)) {
            throw new Error(
                `Outbound host "${hostname}" resolves to a blocked address (${address}).`,
            );
        }
    }
    if (addresses.length === 0) {
        throw new Error(`Outbound DNS lookup returned no addresses for "${hostname}".`);
    }
    const first = addresses[0];
    return { ip: first.address, family: first.family === 6 ? 6 : 4 };
}

/**
 * Validates an outbound URL and performs the fetch with DNS pinned to the
 * IP discovered during validation. Pinning happens via an undici Agent that
 * uses a custom `lookup` returning the pre-validated IP.
 *
 * TLS still validates against the original hostname (SNI + cert SAN), so HTTPS
 * targets cannot be silently downgraded to whatever the IP is currently
 * serving — only the L3 destination is locked.
 */
export async function safeOutboundFetch(rawUrl: string, init?: RequestInit) {
    // First pass: protocol / hostname / IP-literal validation. This throws on
    // anything obviously unsafe before we ever touch DNS.
    await assertSafeOutboundUrl(rawUrl);

    // Processors build DOM-typed RequestInit; undici accepts the same shape at
    // runtime (Next.js' global fetch IS undici). Cast once here.
    const undiciInit = init as Parameters<typeof undiciFetch>[1];

    const parsed = new URL(rawUrl);
    const pinned = await resolveSafeIp(parsed.hostname.toLowerCase());

    if (!pinned) {
        // Hostname was an IP literal — assertSafeOutboundUrl already checked it.
        return undiciFetch(rawUrl, undiciInit);
    }

    // Pin DNS to the validated IP. The hostname stays in the URL so SNI/cert
    // verification works correctly; only the underlying TCP dial is rewritten.
    const agent = new Agent({
        connect: {
            lookup: (
                _hostname: string,
                _options: unknown,
                callback: (err: NodeJS.ErrnoException | null, address: string, family: number) => void,
            ) => callback(null, pinned.ip, pinned.family),
        },
    });

    try {
        return await undiciFetch(rawUrl, { ...(undiciInit || {}), dispatcher: agent });
    } finally {
        // Agent is per-request — close it to free sockets. Best-effort.
        agent.close().catch(() => undefined);
    }
}
