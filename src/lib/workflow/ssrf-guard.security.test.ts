/**
 * Adversarial + DNS-path unit tests for the SSRF guard. Complements
 * `ssrf-guard.test.ts` (IP-literal smoke) by exercising:
 *
 *   - the full private-range classification surface (CGNAT, multicast, 0/8,
 *     IPv4-mapped IPv6, public IPv6 literals),
 *   - case-insensitive hostname blocking, and
 *   - the HOSTNAME → DNS resolution branch, with `dns.promises.lookup` spied so
 *     the suite stays hermetic (no real network). A host that resolves to any
 *     private address must be refused; one resolving only to public addresses
 *     must pass.
 *
 * Pure unit test — no real network. Spies are restored after each test.
 * Run with: npx vitest run src/lib/workflow/ssrf-guard.security.test.ts
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { promises as dnsPromises } from 'dns';
import { assertSafeOutboundUrl } from './ssrf-guard';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('assertSafeOutboundUrl — IP-literal classification', () => {
  it('allows public IPv4 and public IPv6 literals', async () => {
    await expect(assertSafeOutboundUrl('https://1.1.1.1/x')).resolves.toBeUndefined();
    await expect(
      assertSafeOutboundUrl('https://[2606:4700:4700::1111]/x')
    ).resolves.toBeUndefined();
  });

  it('blocks CGNAT (100.64/10) and 0/8', async () => {
    await expect(assertSafeOutboundUrl('http://100.64.0.1/x')).rejects.toThrow(/blocked/i);
    await expect(assertSafeOutboundUrl('http://100.127.255.255/x')).rejects.toThrow(/blocked/i);
    await expect(assertSafeOutboundUrl('http://0.0.0.0/x')).rejects.toThrow(/blocked/i);
  });

  it('blocks multicast / reserved (>= 224)', async () => {
    await expect(assertSafeOutboundUrl('http://224.0.0.1/x')).rejects.toThrow(/blocked/i);
    await expect(assertSafeOutboundUrl('http://239.255.255.250/x')).rejects.toThrow(/blocked/i);
  });

  it('blocks the upper/lower edges of the RFC1918 ranges', async () => {
    await expect(assertSafeOutboundUrl('http://172.31.255.255/x')).rejects.toThrow(/blocked/i);
    await expect(assertSafeOutboundUrl('http://172.16.0.0/x')).rejects.toThrow(/blocked/i);
    // 172.15.x and 172.32.x are NOT in the private block.
    await expect(assertSafeOutboundUrl('http://172.15.0.1/x')).resolves.toBeUndefined();
    await expect(assertSafeOutboundUrl('http://172.32.0.1/x')).resolves.toBeUndefined();
  });

  it('blocks IPv4-mapped IPv6 loopback literals', async () => {
    await expect(assertSafeOutboundUrl('http://[::ffff:127.0.0.1]/x')).rejects.toThrow(/blocked/i);
  });

  it('blocks IPv6 unique-local and multicast literals', async () => {
    await expect(assertSafeOutboundUrl('http://[fc00::1]/x')).rejects.toThrow(/blocked/i);
    await expect(assertSafeOutboundUrl('http://[ff02::1]/x')).rejects.toThrow(/blocked/i);
  });
});

describe('assertSafeOutboundUrl — hostname / scheme guards', () => {
  it('blocks localhost case-insensitively, before any DNS', async () => {
    const spy = vi.spyOn(dnsPromises, 'lookup');
    await expect(assertSafeOutboundUrl('http://LOCALHOST/admin')).rejects.toThrow(/blocked/i);
    await expect(assertSafeOutboundUrl('http://LocalHost:8080/x')).rejects.toThrow(/blocked/i);
    expect(spy).not.toHaveBeenCalled();
  });

  it('blocks cloud-metadata hostnames', async () => {
    await expect(
      assertSafeOutboundUrl('http://metadata.google.internal/computeMetadata/v1/')
    ).rejects.toThrow(/blocked/i);
    await expect(assertSafeOutboundUrl('http://metadata.goog/x')).rejects.toThrow(/blocked/i);
  });

  it('rejects non-http(s) schemes', async () => {
    await expect(assertSafeOutboundUrl('file:///etc/passwd')).rejects.toThrow(/protocol/i);
    await expect(assertSafeOutboundUrl('gopher://1.1.1.1/x')).rejects.toThrow(/protocol/i);
    await expect(assertSafeOutboundUrl('data:text/html,<script>')).rejects.toThrow(/protocol/i);
  });

  it('rejects malformed URLs', async () => {
    await expect(assertSafeOutboundUrl('not a url')).rejects.toThrow(/malformed/i);
    await expect(assertSafeOutboundUrl('')).rejects.toThrow(/malformed/i);
  });
});

describe('assertSafeOutboundUrl — DNS resolution branch (mocked)', () => {
  it('allows a hostname that resolves only to public addresses', async () => {
    vi.spyOn(dnsPromises, 'lookup').mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
    ] as never);
    await expect(assertSafeOutboundUrl('https://example.com/path')).resolves.toBeUndefined();
  });

  it('blocks a hostname that resolves to a private address (DNS rebinding)', async () => {
    vi.spyOn(dnsPromises, 'lookup').mockResolvedValue([
      { address: '10.0.0.5', family: 4 },
    ] as never);
    await expect(assertSafeOutboundUrl('https://rebind.attacker.test/x')).rejects.toThrow(
      /blocked address/i
    );
  });

  it('blocks if ANY resolved address is private (mixed answer set)', async () => {
    vi.spyOn(dnsPromises, 'lookup').mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '169.254.169.254', family: 4 }, // metadata smuggled in
    ] as never);
    await expect(assertSafeOutboundUrl('https://mixed.attacker.test/x')).rejects.toThrow(
      /blocked address/i
    );
  });

  it('blocks a hostname resolving to a private IPv4-mapped IPv6 answer', async () => {
    vi.spyOn(dnsPromises, 'lookup').mockResolvedValue([
      { address: '::ffff:10.0.0.1', family: 6 },
    ] as never);
    await expect(assertSafeOutboundUrl('https://v6map.attacker.test/x')).rejects.toThrow(
      /blocked address/i
    );
  });

  it('surfaces a DNS lookup failure as a thrown error (fail-closed)', async () => {
    vi.spyOn(dnsPromises, 'lookup').mockRejectedValue(new Error('ENOTFOUND'));
    await expect(assertSafeOutboundUrl('https://nxdomain.attacker.test/x')).rejects.toThrow(
      /DNS lookup failed/i
    );
  });
});
