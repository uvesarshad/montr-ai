/**
 * Storage Provider Interface
 * 
 * Abstraction for different storage backends (S3, Wasabi, Google Drive)
 */

export interface UploadOptions {
    folder?: string;
    filename?: string;
    contentType?: string;
    isPublic?: boolean;
    metadata?: Record<string, string>;
}

export interface UploadResult {
    url: string;
    key: string;
    provider: StorageProvider;
    size: number;
    contentType: string;
}

export interface StorageFile {
    key: string;
    url: string;
    name: string;
    size: number;
    contentType: string;
    lastModified: Date;
}

export type StorageProvider = 'aws' | 'wasabi' | 'google-drive' | 'local';

export interface IStorageProvider {
    readonly provider: StorageProvider;

    /**
     * Upload a file
     */
    upload(file: Buffer | Blob, options: UploadOptions): Promise<UploadResult>;

    /**
     * Delete a file
     */
    delete(key: string): Promise<boolean>;

    /**
     * Get a signed URL for private file access
     */
    getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;

    /**
     * List files in a folder
     */
    list(folder: string): Promise<StorageFile[]>;

    /**
     * Check if a file exists
     */
    exists(key: string): Promise<boolean>;
}
