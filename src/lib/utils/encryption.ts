import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const _AUTH_TAG_LENGTH = 16;

/**
 * Encryption Utility
 * Uses AES-256-GCM for secure encryption/decryption
 */
export class EncryptionUtil {
    private key: Buffer;

    constructor() {
        const encryptionKey = process.env.ENCRYPTION_KEY;

        if (!encryptionKey) {
            throw new Error('ENCRYPTION_KEY environment variable is not set');
        }

        // Convert hex string to buffer
        this.key = Buffer.from(encryptionKey, 'hex');

        if (this.key.length !== 32) {
            throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex characters)');
        }
    }

    /**
     * Encrypt a string
     * @param text Plain text to encrypt
     * @returns Encrypted string in format: iv:authTag:encrypted
     */
    encrypt(text: string): string {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);

        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        const authTag = cipher.getAuthTag();

        // Return format: iv:authTag:encrypted
        return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    }

    /**
     * Decrypt an encrypted string
     * @param encryptedData Encrypted string in format: iv:authTag:encrypted
     * @returns Decrypted plain text
     */
    decrypt(encryptedData: string): string {
        const parts = encryptedData.split(':');

        if (parts.length !== 3) {
            throw new Error('Invalid encrypted data format');
        }

        const iv = Buffer.from(parts[0], 'hex');
        const authTag = Buffer.from(parts[1], 'hex');
        const encrypted = parts[2];

        const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    }

    /**
     * Generate a new encryption key (for setup)
     * @returns 64-character hex string
     */
    static generateKey(): string {
        return crypto.randomBytes(32).toString('hex');
    }
}

// Singleton instance
let encryptionUtil: EncryptionUtil | null = null;

export function getEncryptionUtil(): EncryptionUtil {
    if (!encryptionUtil) {
        encryptionUtil = new EncryptionUtil();
    }
    return encryptionUtil;
}

const encryptionExports = { getEncryptionUtil, EncryptionUtil };
export default encryptionExports;
