/**
 * Credential Encryption Service
 *
 * Provides AES-256-GCM encryption for secure credential storage.
 * Each credential is encrypted with a unique key derived from a master key and user ID.
 *
 * ---------------------------------------------------------------------------
 * TWO-KEY STORY (intentional — do NOT merge the two encryption modules)
 * ---------------------------------------------------------------------------
 * This codebase has two AES-256-GCM modules with separate keys and DIFFERENT,
 * non-interchangeable wire formats:
 *
 *   1. THIS module (`WORKFLOW_ENCRYPTION_KEY`)
 *      - Covers: the workflow credential vault (WorkflowCredential rows) and the
 *        voice provider-config secrets.
 *      - Key handling: PBKDF2(masterKey + scopeId, per-row random salt, 100k
 *        iters) → a UNIQUE derived key per row. Compromising one row's
 *        ciphertext leaks nothing about others.
 *      - Wire format: a structured object `{ encryptedValue, iv, authTag, salt }`
 *        with every field base64-encoded. The salt is required to re-derive the
 *        key on decrypt.
 *
 *   2. `src/lib/encryption.ts` (`SOCIAL_TOKEN_ENCRYPTION_KEY`)
 *      - Covers: social OAuth tokens (SocialAccount) and IntegrationConnection
 *        credential blobs.
 *      - Key handling: the env key is used DIRECTLY as the AES key (no salt, no
 *        derivation).
 *      - Wire format: a single string `iv:authTag:encryptedData`, all hex,
 *        colon-separated. No salt field exists.
 *
 * Why two keys: the two subsystems were built independently and already hold
 * production-encrypted data under their respective formats. The formats encode
 * different invariants (per-row salt + PBKDF2 vs. direct key, base64 object vs.
 * hex string), so a single "core" can't read both without per-format branching
 * that buys nothing. Sharing one AES helper would also force a single key,
 * which would silently break decryption of all existing rows — encrypted-data
 * compatibility is sacred, so the cores stay separate by design.
 *
 * HOW TO ROTATE (each key independently, no cross-module migration):
 *   - This module: re-encrypt each WorkflowCredential / voice-config secret with
 *     `reEncrypt(payload, scopeId, oldMasterKey, newMasterKey)` (pure — see
 *     below), then swap WORKFLOW_ENCRYPTION_KEY. A migration script would loop
 *     rows, call reEncrypt, and persist the new payload.
 *   - encryption.ts: decrypt with the old SOCIAL_TOKEN_ENCRYPTION_KEY and
 *     re-encrypt with the new one, then swap the env var.
 * ---------------------------------------------------------------------------
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;

export interface EncryptedData {
  encryptedValue: string;  // Base64 encoded
  iv: string;              // Base64 encoded initialization vector
  authTag: string;         // Base64 encoded authentication tag
  salt: string;            // Base64 encoded salt
}

export class CredentialEncryptionService {
  private masterKey: Buffer;

  constructor() {
    // Get master key from environment variable
    const masterKeyHex = process.env.WORKFLOW_ENCRYPTION_KEY;

    if (!masterKeyHex) {
      throw new Error(
        'WORKFLOW_ENCRYPTION_KEY environment variable is required for credential encryption'
      );
    }

    // Validate master key length (should be 64 hex characters = 32 bytes)
    if (masterKeyHex.length !== 64) {
      throw new Error(
        'WORKFLOW_ENCRYPTION_KEY must be 64 hexadecimal characters (32 bytes)'
      );
    }

    this.masterKey = Buffer.from(masterKeyHex, 'hex');
  }

  /**
   * Generate a random encryption key
   * Use this once to generate WORKFLOW_ENCRYPTION_KEY and store in .env
   */
  static generateMasterKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Derive encryption key from master key and user-specific data
   * This ensures each user has a unique encryption key
   */
  private deriveKey(userId: string, salt: Buffer): Buffer {
    // Use PBKDF2 to derive key from master key + userId + salt
    return crypto.pbkdf2Sync(
      Buffer.concat([this.masterKey, Buffer.from(userId, 'utf8')]),
      salt,
      100000, // iterations
      KEY_LENGTH,
      'sha256'
    );
  }

  /**
   * Encrypt a credential value
   */
  encrypt(value: string, userId: string): EncryptedData {
    if (!value) {
      throw new Error('Value to encrypt cannot be empty');
    }

    // Generate random salt for this credential
    const salt = crypto.randomBytes(SALT_LENGTH);

    // Derive encryption key
    const key = this.deriveKey(userId, salt);

    // Generate random IV
    const iv = crypto.randomBytes(IV_LENGTH);

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    // Encrypt the value
    let encrypted = cipher.update(value, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    return {
      encryptedValue: encrypted,
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      salt: salt.toString('base64')
    };
  }

  /**
   * Decrypt a credential value.
   *
   * `scopeId` is the identifier the key is derived from (e.g. organizationId for
   * org-shared vault credentials, or a userId for user-scoped credentials).
   * `fallbackScopeId` lets callers transparently read rows that were encrypted
   * under a legacy scope (e.g. the original creator's userId before org-scoping)
   * without a data migration.
   */
  decrypt(encryptedData: EncryptedData, scopeId: string, fallbackScopeId?: string): string {
    const attempt = (id: string): string => {
      const encryptedValue = Buffer.from(encryptedData.encryptedValue, 'base64');
      const iv = Buffer.from(encryptedData.iv, 'base64');
      const authTag = Buffer.from(encryptedData.authTag, 'base64');
      const salt = Buffer.from(encryptedData.salt, 'base64');

      const key = this.deriveKey(id, salt);
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);

      // Pass the buffer directly — avoids a redundant base64 round-trip.
      let decrypted = decipher.update(encryptedValue, undefined, 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    };

    try {
      return attempt(scopeId);
    } catch (primaryError) {
      if (fallbackScopeId && fallbackScopeId !== scopeId) {
        try {
          return attempt(fallbackScopeId);
        } catch {
          // fall through to the primary error report below
        }
      }
      console.error('Decryption failed:', primaryError);
      throw new Error('Failed to decrypt credential. The encryption key or data may be invalid.');
    }
  }

  /**
   * Encrypt credential object for storage
   */
  encryptCredential(
    name: string,
    type: 'api_key' | 'oauth' | 'basic_auth' | 'custom',
    value: string | Record<string, unknown>,
    userId: string,
    metadata?: Record<string, unknown>
  ) {
    // Convert object values to JSON string
    const valueString = typeof value === 'string' ? value : JSON.stringify(value);

    // Encrypt the value
    const encrypted = this.encrypt(valueString, userId);

    return {
      name,
      type,
      ...encrypted,
      metadata: metadata || {}
    };
  }

  /**
   * Decrypt credential from storage
   */
  decryptCredential(
    credential: {
      name: string;
      type: string;
      encryptedValue: string;
      iv: string;
      authTag: string;
      salt: string;
      metadata?: Record<string, unknown>;
    },
    scopeId: string,
    fallbackScopeId?: string
  ): { name: string; type: string; value: unknown; metadata?: Record<string, unknown> } {
    // Decrypt the value
    const decryptedString = this.decrypt(
      {
        encryptedValue: credential.encryptedValue,
        iv: credential.iv,
        authTag: credential.authTag,
        salt: credential.salt
      },
      scopeId,
      fallbackScopeId
    );

    // Try to parse as JSON for object types
    let value: unknown = decryptedString;
    if (credential.type === 'oauth' || credential.type === 'custom') {
      try {
        value = JSON.parse(decryptedString);
      } catch {
        // Keep as string if not valid JSON
      }
    }

    return {
      name: credential.name,
      type: credential.type,
      value,
      metadata: credential.metadata
    };
  }

  /**
   * Re-encrypt a payload from an old master key to a new one (for key rotation).
   *
   * Pure and concurrency-safe: it derives both the old and new keys locally and
   * never mutates `this.masterKey`, so it is safe to call from a parallel
   * rotation loop that shares the singleton instance. `scopeId` is the same id
   * the row was/will be derived under (see `decrypt`). Returns the new payload;
   * the caller is responsible for persisting it.
   */
  reEncrypt(
    encryptedData: EncryptedData,
    scopeId: string,
    oldMasterKey: Buffer,
    newMasterKey: Buffer
  ): EncryptedData {
    // --- Decrypt under the OLD master key (local key derivation, no mutation) ---
    const iv = Buffer.from(encryptedData.iv, 'base64');
    const authTag = Buffer.from(encryptedData.authTag, 'base64');
    const oldSalt = Buffer.from(encryptedData.salt, 'base64');
    const encryptedValue = Buffer.from(encryptedData.encryptedValue, 'base64');

    const oldKey = crypto.pbkdf2Sync(
      Buffer.concat([oldMasterKey, Buffer.from(scopeId, 'utf8')]),
      oldSalt,
      100000,
      KEY_LENGTH,
      'sha256'
    );
    const decipher = crypto.createDecipheriv(ALGORITHM, oldKey, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedValue, undefined, 'utf8');
    decrypted += decipher.final('utf8');

    // --- Encrypt under the NEW master key with a fresh salt + IV ---
    const newSalt = crypto.randomBytes(SALT_LENGTH);
    const newKey = crypto.pbkdf2Sync(
      Buffer.concat([newMasterKey, Buffer.from(scopeId, 'utf8')]),
      newSalt,
      100000,
      KEY_LENGTH,
      'sha256'
    );
    const newIv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, newKey, newIv);
    let encrypted = cipher.update(decrypted, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    return {
      encryptedValue: encrypted,
      iv: newIv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      salt: newSalt.toString('base64'),
    };
  }

  /**
   * Validate encrypted data structure
   */
  validateEncryptedData(data: unknown): data is EncryptedData {
    if (!data || typeof data !== 'object') return false;
    const d = data as Record<string, unknown>;
    return (
      typeof d.encryptedValue === 'string' &&
      typeof d.iv === 'string' &&
      typeof d.authTag === 'string' &&
      typeof d.salt === 'string'
    );
  }
}

// Singleton instance
let encryptionService: CredentialEncryptionService | null = null;

/**
 * Get or create encryption service instance
 */
export function getEncryptionService(): CredentialEncryptionService {
  if (!encryptionService) {
    encryptionService = new CredentialEncryptionService();
  }
  return encryptionService;
}

/**
 * Convenience functions
 */
export function encryptCredential(
  name: string,
  type: 'api_key' | 'oauth' | 'basic_auth' | 'custom',
  value: string | Record<string, unknown>,
  userId: string,
  metadata?: Record<string, unknown>
) {
  return getEncryptionService().encryptCredential(name, type, value, userId, metadata);
}

export function decryptCredential(
  credential: {
    name: string;
    type: string;
    encryptedValue: string;
    iv: string;
    authTag: string;
    salt: string;
    metadata?: Record<string, unknown>;
  },
  scopeId: string,
  fallbackScopeId?: string
) {
  return getEncryptionService().decryptCredential(credential, scopeId, fallbackScopeId);
}

/**
 * Helper to mask sensitive values for display
 */
export function maskCredentialValue(value: string, visibleChars: number = 4): string {
  if (!value || value.length <= visibleChars) {
    return '***';
  }

  const masked = '*'.repeat(Math.max(0, value.length - visibleChars));
  const visible = value.slice(-visibleChars);

  return masked + visible;
}

/**
 * Generate setup instructions for environment variable
 */
export function generateSetupInstructions(): string {
  const newKey = CredentialEncryptionService.generateMasterKey();

  return `
=======================================================================
WORKFLOW CREDENTIAL ENCRYPTION SETUP
=======================================================================

Add this to your .env file:

WORKFLOW_ENCRYPTION_KEY=${newKey}

⚠️  IMPORTANT:
1. Keep this key secret and secure
2. Never commit this key to version control
3. Back up this key securely - lost keys cannot decrypt existing credentials
4. Use the same key across all application instances
5. To rotate the key, use the re-encryption utility

=======================================================================
  `.trim();
}
