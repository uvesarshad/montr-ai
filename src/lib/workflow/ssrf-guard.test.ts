/**
 * Smoke tests for the SSRF guard. Covers the IP-literal branches end-to-end
 * (no DNS) so the suite stays hermetic. Hostname/DNS paths can be added once
 * we have a network-isolated test harness.
 */
import { describe, it, expect } from 'vitest';
import { assertSafeOutboundUrl } from './ssrf-guard';

describe('assertSafeOutboundUrl', () => {
    it('accepts public IPv4 literals', async () => {
        await expect(assertSafeOutboundUrl('https://1.1.1.1/health')).resolves.toBeUndefined();
        await expect(assertSafeOutboundUrl('https://8.8.8.8/health')).resolves.toBeUndefined();
    });

    it('rejects private IPv4 ranges', async () => {
        const blocked = [
            'http://10.0.0.1/admin',
            'http://172.16.0.1/admin',
            'http://192.168.1.1/admin',
            'http://127.0.0.1:9000/admin',
            'http://169.254.169.254/latest/meta-data/', // AWS metadata
            'http://0.0.0.0/admin',
        ];
        for (const url of blocked) {
            await expect(assertSafeOutboundUrl(url)).rejects.toThrow(/blocked/i);
        }
    });

    it('rejects loopback / link-local IPv6', async () => {
        await expect(assertSafeOutboundUrl('http://[::1]/admin')).rejects.toThrow(/blocked/i);
        await expect(assertSafeOutboundUrl('http://[fe80::1]/admin')).rejects.toThrow(/blocked/i);
        await expect(assertSafeOutboundUrl('http://[fd00::1]/admin')).rejects.toThrow(/blocked/i);
    });

    it('rejects non-http(s) schemes', async () => {
        await expect(assertSafeOutboundUrl('file:///etc/passwd')).rejects.toThrow(/protocol/i);
        await expect(assertSafeOutboundUrl('ftp://example.com/secret')).rejects.toThrow(/protocol/i);
        await expect(assertSafeOutboundUrl('javascript:alert(1)')).rejects.toThrow(/protocol/i);
    });

    it('rejects localhost / metadata hostnames before DNS', async () => {
        await expect(assertSafeOutboundUrl('http://localhost/admin')).rejects.toThrow(/blocked/i);
        await expect(assertSafeOutboundUrl('http://metadata.google.internal/computeMetadata/v1/')).rejects.toThrow(/blocked/i);
    });

    it('rejects malformed URLs', async () => {
        await expect(assertSafeOutboundUrl('not-a-url')).rejects.toThrow(/malformed/i);
    });
});
