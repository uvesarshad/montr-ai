/**
 * Unit tests for the workflow credential vault (AES-256-GCM, PBKDF2-derived
 * per-row keys). Covers:
 *
 *   - encrypt -> decrypt round-trip (string + structured oauth credential),
 *   - per-row uniqueness (fresh salt + IV per encryption),
 *   - wrong-scope / wrong-key rejection and the fallback-scope read path,
 *   - GCM auth-tag + ciphertext TAMPER rejection (the integrity guarantee),
 *   - key-rotation re-encryption (reEncrypt) round-trip,
 *   - constructor key-validation, and the masking / validation helpers.
 *
 * Uses a TEST master key set on process.env only for the duration of the suite
 * — never reads or writes the real WORKFLOW_ENCRYPTION_KEY. Pure: no DB / Redis.
 * Run with: npx vitest run src/lib/workflow/credential-encryption.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import crypto from 'crypto';
import {
  CredentialEncryptionService,
  maskCredentialValue,
  type EncryptedData,
} from './credential-encryption';

// Deterministic, obviously-fake 64-hex (32-byte) test key.
const TEST_KEY = 'ab'.repeat(32);
const ALT_KEY = 'cd'.repeat(32);

let savedKey: string | undefined;

beforeAll(() => {
  savedKey = process.env.WORKFLOW_ENCRYPTION_KEY;
});

afterAll(() => {
  if (savedKey === undefined) delete process.env.WORKFLOW_ENCRYPTION_KEY;
  else process.env.WORKFLOW_ENCRYPTION_KEY = savedKey;
});

beforeEach(() => {
  // Reset to the canonical test key before each test; individual tests that
  // probe constructor validation override it locally.
  process.env.WORKFLOW_ENCRYPTION_KEY = TEST_KEY;
});

describe('CredentialEncryptionService — round-trip', () => {
  it('decrypts back to the original plaintext under the same scope', () => {
    const svc = new CredentialEncryptionService();
    const enc = svc.encrypt('super-secret-token', 'org-1');
    expect(svc.decrypt(enc, 'org-1')).toBe('super-secret-token');
  });

  it('round-trips a structured oauth credential (object -> JSON -> object)', () => {
    const svc = new CredentialEncryptionService();
    const stored = svc.encryptCredential(
      'Stripe',
      'oauth',
      { accessToken: 'at_123', refreshToken: 'rt_456' },
      'org-1'
    );
    const out = svc.decryptCredential({ ...stored, metadata: stored.metadata }, 'org-1');
    expect(out.value).toEqual({ accessToken: 'at_123', refreshToken: 'rt_456' });
    expect(out.type).toBe('oauth');
    expect(out.name).toBe('Stripe');
  });

  it('produces a unique salt + IV per encryption (no deterministic ciphertext)', () => {
    const svc = new CredentialEncryptionService();
    const a = svc.encrypt('same-value', 'org-1');
    const b = svc.encrypt('same-value', 'org-1');
    expect(a.encryptedValue).not.toBe(b.encryptedValue);
    expect(a.iv).not.toBe(b.iv);
    expect(a.salt).not.toBe(b.salt);
    // ...yet both still decrypt to the same plaintext.
    expect(svc.decrypt(a, 'org-1')).toBe('same-value');
    expect(svc.decrypt(b, 'org-1')).toBe('same-value');
  });

  it('refuses to encrypt an empty value', () => {
    const svc = new CredentialEncryptionService();
    expect(() => svc.encrypt('', 'org-1')).toThrow(/empty/i);
  });
});

describe('CredentialEncryptionService — wrong key / wrong scope / fallback', () => {
  it('fails to decrypt under a different scopeId', () => {
    const svc = new CredentialEncryptionService();
    const enc = svc.encrypt('secret', 'org-1');
    expect(() => svc.decrypt(enc, 'org-2')).toThrow(/Failed to decrypt/i);
  });

  it('fails to decrypt under a different master key', () => {
    const svc = new CredentialEncryptionService();
    const enc = svc.encrypt('secret', 'org-1');

    process.env.WORKFLOW_ENCRYPTION_KEY = ALT_KEY;
    const other = new CredentialEncryptionService();
    expect(() => other.decrypt(enc, 'org-1')).toThrow(/Failed to decrypt/i);
  });

  it('reads a row encrypted under a legacy scope via fallbackScopeId', () => {
    const svc = new CredentialEncryptionService();
    // Encrypted under the original creator's userId...
    const enc = svc.encrypt('legacy-secret', 'user-legacy');
    // ...now read with the org scope primary + legacy userId fallback.
    expect(svc.decrypt(enc, 'org-current', 'user-legacy')).toBe('legacy-secret');
  });

  it('still throws if neither primary nor fallback scope matches', () => {
    const svc = new CredentialEncryptionService();
    const enc = svc.encrypt('secret', 'real-scope');
    expect(() => svc.decrypt(enc, 'wrong-a', 'wrong-b')).toThrow(/Failed to decrypt/i);
  });
});

describe('CredentialEncryptionService — tamper rejection (GCM integrity)', () => {
  it('rejects a flipped auth tag', () => {
    const svc = new CredentialEncryptionService();
    const enc = svc.encrypt('secret', 'org-1');
    const tagBuf = Buffer.from(enc.authTag, 'base64');
    tagBuf[0] ^= 0xff;
    const tampered: EncryptedData = { ...enc, authTag: tagBuf.toString('base64') };
    expect(() => svc.decrypt(tampered, 'org-1')).toThrow(/Failed to decrypt/i);
  });

  it('rejects flipped ciphertext', () => {
    const svc = new CredentialEncryptionService();
    const enc = svc.encrypt('secret', 'org-1');
    const ctBuf = Buffer.from(enc.encryptedValue, 'base64');
    ctBuf[0] ^= 0xff;
    const tampered: EncryptedData = { ...enc, encryptedValue: ctBuf.toString('base64') };
    expect(() => svc.decrypt(tampered, 'org-1')).toThrow(/Failed to decrypt/i);
  });

  it('rejects a swapped salt (key no longer derives correctly)', () => {
    const svc = new CredentialEncryptionService();
    const enc = svc.encrypt('secret', 'org-1');
    const tampered: EncryptedData = {
      ...enc,
      salt: crypto.randomBytes(32).toString('base64'),
    };
    expect(() => svc.decrypt(tampered, 'org-1')).toThrow(/Failed to decrypt/i);
  });
});

describe('CredentialEncryptionService — key rotation (reEncrypt)', () => {
  it('re-encrypts a payload from an old master key to a new one', () => {
    const oldBuf = Buffer.from(TEST_KEY, 'hex');
    const newBuf = Buffer.from(ALT_KEY, 'hex');

    const svcOld = new CredentialEncryptionService(); // env == TEST_KEY
    const original = svcOld.encrypt('rotate-me', 'org-1');

    const rotated = svcOld.reEncrypt(original, 'org-1', oldBuf, newBuf);
    // Fresh salt/IV after rotation.
    expect(rotated.salt).not.toBe(original.salt);
    expect(rotated.iv).not.toBe(original.iv);

    // The rotated payload decrypts under the NEW key, not the old one.
    process.env.WORKFLOW_ENCRYPTION_KEY = ALT_KEY;
    const svcNew = new CredentialEncryptionService();
    expect(svcNew.decrypt(rotated, 'org-1')).toBe('rotate-me');
    // ...and the old service can no longer read the rotated payload.
    expect(() => svcOld.decrypt(rotated, 'org-1')).toThrow(/Failed to decrypt/i);
  });
});

describe('CredentialEncryptionService — constructor key validation', () => {
  it('throws when the key env var is missing', () => {
    delete process.env.WORKFLOW_ENCRYPTION_KEY;
    expect(() => new CredentialEncryptionService()).toThrow(/required/i);
  });

  it('throws when the key is not 64 hex characters', () => {
    process.env.WORKFLOW_ENCRYPTION_KEY = 'too-short';
    expect(() => new CredentialEncryptionService()).toThrow(/64 hex/i);
  });

  it('generateMasterKey returns 64 hex characters', () => {
    const key = CredentialEncryptionService.generateMasterKey();
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('CredentialEncryptionService — helpers', () => {
  it('validateEncryptedData accepts a well-formed payload and rejects junk', () => {
    const svc = new CredentialEncryptionService();
    const enc = svc.encrypt('secret', 'org-1');
    expect(svc.validateEncryptedData(enc)).toBe(true);
    expect(svc.validateEncryptedData(null)).toBe(false);
    expect(svc.validateEncryptedData({ encryptedValue: 'x' })).toBe(false);
    expect(svc.validateEncryptedData({ iv: 1, authTag: 2, salt: 3, encryptedValue: 4 })).toBe(false);
  });
});

describe('maskCredentialValue', () => {
  it('shows only the last N characters', () => {
    expect(maskCredentialValue('sk_live_ABCDEFGH', 4)).toBe('************EFGH');
  });

  it('fully masks short values', () => {
    expect(maskCredentialValue('abc', 4)).toBe('***');
    expect(maskCredentialValue('', 4)).toBe('***');
  });
});
