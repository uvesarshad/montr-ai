import { IStorageProvider, UploadOptions, UploadResult, StorageFile, StorageProvider } from './types';
import { S3Provider } from './providers/s3-provider';
import { GoogleDriveProvider } from './providers/google-drive-provider';

/**
 * Global Storage Service
 * 
 * Unified interface for all storage operations.
 * Supports AWS S3, Wasabi, and user-connected Google Drive.
 */
class StorageService {
    private defaultProvider: IStorageProvider;

    constructor() {
        // Initialize default provider based on environment
        const provider = process.env.STORAGE_PROVIDER as 'aws' | 'wasabi' || 'aws';
        this.defaultProvider = new S3Provider({ provider });
    }

    /**
     * Get the default storage provider (S3/Wasabi)
     */
    getDefaultProvider(): IStorageProvider {
        return this.defaultProvider;
    }

    /**
     * Get a Google Drive provider for a user
     */
    getGoogleDriveProvider(accessToken: string, folderId?: string): IStorageProvider {
        return new GoogleDriveProvider(accessToken, folderId);
    }

    /**
     * Upload to default storage
     */
    async upload(file: Buffer | Blob, options: UploadOptions): Promise<UploadResult> {
        return this.defaultProvider.upload(file, options);
    }

    /**
     * Upload to user's Google Drive
     */
    async uploadToGoogleDrive(
        file: Buffer | Blob,
        options: UploadOptions,
        accessToken: string
    ): Promise<UploadResult> {
        const provider = this.getGoogleDriveProvider(accessToken);
        return provider.upload(file, options);
    }

    /**
     * Delete from default storage
     */
    async delete(key: string): Promise<boolean> {
        return this.defaultProvider.delete(key);
    }

    /**
     * Delete from specific provider
     */
    async deleteFrom(key: string, provider: StorageProvider, accessToken?: string): Promise<boolean> {
        if (provider === 'google-drive' && accessToken) {
            const gdProvider = this.getGoogleDriveProvider(accessToken);
            return gdProvider.delete(key);
        }
        return this.defaultProvider.delete(key);
    }

    /**
     * Get signed URL from default storage
     */
    async getSignedUrl(key: string, expiresInSeconds?: number): Promise<string> {
        return this.defaultProvider.getSignedUrl(key, expiresInSeconds);
    }

    /**
     * List files in default storage
     */
    async list(folder: string): Promise<StorageFile[]> {
        return this.defaultProvider.list(folder);
    }

    /**
     * Check if using Wasabi (for migration status)
     */
    isUsingWasabi(): boolean {
        return this.defaultProvider.provider === 'wasabi';
    }
}

// Export singleton instance
export const storageService = new StorageService();

// Export types and providers
export { S3Provider, GoogleDriveProvider };
export type { IStorageProvider, UploadOptions, UploadResult, StorageFile, StorageProvider };
