/**
 * Token Encryption Utility
 * Uses AES-256-GCM for secure OAuth token storage.
 *
 * Key: SOCIAL_TOKEN_ENCRYPTION_KEY (used DIRECTLY as the AES key, no derivation).
 * Wire format: `iv:authTag:encryptedData`, all hex, colon-separated (no salt).
 * Covers: social OAuth tokens (SocialAccount) + IntegrationConnection blobs.
 *
 * This is intentionally SEPARATE from the workflow credential vault
 * (`src/lib/workflow/credential-encryption.ts`, key WORKFLOW_ENCRYPTION_KEY),
 * which uses PBKDF2 per-row key derivation and a base64 object wire format. The
 * two formats are not interchangeable and hold existing production data — see
 * that file's header for the full two-key story and rotation steps. Do not
 * unify them.
 */
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Gets the encryption key from environment variables
 * Key must be a 64-character hex string (32 bytes)
 */
function getEncryptionKey(): Buffer {
    const key = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;

    if (!key) {
        throw new Error('SOCIAL_TOKEN_ENCRYPTION_KEY environment variable is not set');
    }

    if (key.length !== 64) {
        throw new Error('SOCIAL_TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
    }

    return Buffer.from(key, 'hex');
}

/**
 * Encrypts a token using AES-256-GCM
 * Returns: iv:authTag:encryptedData (all hex encoded, colon separated)
 */
export function encryptToken(plaintext: string): string {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
        authTagLength: AUTH_TAG_LENGTH,
    });

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:encryptedData
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts an encrypted token
 * Expects format: iv:authTag:encryptedData (hex encoded)
 */
export function decryptToken(ciphertext: string): string {
    const key = getEncryptionKey();

    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
        throw new Error('Invalid encrypted token format');
    }

    const [ivHex, authTagHex, encryptedData] = parts;

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
        authTagLength: AUTH_TAG_LENGTH,
    });

    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}

/**
 * Generates a secure encryption key for use in .env file
 * Run this once to generate your key: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
export function generateEncryptionKey(): string {
    return crypto.randomBytes(32).toString('hex');
}
