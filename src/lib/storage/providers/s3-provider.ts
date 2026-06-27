import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { IStorageProvider, UploadOptions, UploadResult, StorageFile, StorageProvider } from '../types';

/**
 * S3-Compatible Storage Provider
 * 
 * Works with AWS S3 and Wasabi (same API)
 */
export class S3Provider implements IStorageProvider {
    readonly provider: StorageProvider;
    private client: S3Client;
    private bucket: string;
    private publicUrl: string;

    constructor(config?: {
        provider?: 'aws' | 'wasabi';
        accessKeyId?: string;
        secretAccessKey?: string;
        region?: string;
        endpoint?: string;
        bucket?: string;
    }) {
        const isWasabi = config?.provider === 'wasabi' || process.env.STORAGE_PROVIDER === 'wasabi';
        this.provider = isWasabi ? 'wasabi' : 'aws';

        // Wasabi configuration
        if (isWasabi) {
            this.client = new S3Client({
                region: config?.region || process.env.WASABI_REGION || 'us-east-1',
                endpoint: config?.endpoint || process.env.WASABI_ENDPOINT || 'https://s3.wasabisys.com',
                credentials: {
                    accessKeyId: config?.accessKeyId || process.env.WASABI_ACCESS_KEY || '',
                    secretAccessKey: config?.secretAccessKey || process.env.WASABI_SECRET_KEY || '',
                },
                forcePathStyle: true,
            });
            this.bucket = config?.bucket || process.env.WASABI_BUCKET || 'montrai';
            this.publicUrl = `https://s3.wasabisys.com/${this.bucket}`;
        } else {
            // AWS S3 configuration
            this.client = new S3Client({
                region: config?.region || process.env.AWS_REGION || 'us-east-1',
                credentials: {
                    accessKeyId: config?.accessKeyId || process.env.AWS_ACCESS_KEY_ID || '',
                    secretAccessKey: config?.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY || '',
                },
            });
            this.bucket = config?.bucket || process.env.AWS_S3_BUCKET || 'montrai';
            this.publicUrl = `https://${this.bucket}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com`;
        }
    }

    async upload(file: Buffer | Blob, options: UploadOptions): Promise<UploadResult> {
        const ext = this.getExtension(options.contentType || 'application/octet-stream');
        const filename = options.filename || `${uuidv4()}${ext}`;
        const key = options.folder ? `${options.folder}/${filename}` : filename;

        const body = file instanceof Blob ? Buffer.from(await file.arrayBuffer()) : file;

        const command = new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: body,
            ContentLength: body.length,
            ContentType: options.contentType,
            Metadata: options.metadata,
        });

        try {
            await this.client.send(command);
        } catch (error: unknown) {
            throw error;
        }

        const url = options.isPublic
            ? `${this.publicUrl}/${key}`
            : await this.getSignedUrl(key);

        return {
            url,
            key,
            provider: this.provider,
            size: body.length,
            contentType: options.contentType || 'application/octet-stream',
        };
    }

    async delete(key: string): Promise<boolean> {
        try {
            const command = new DeleteObjectCommand({
                Bucket: this.bucket,
                Key: key,
            });
            await this.client.send(command);
            return true;
        } catch (error) {
            console.error('S3 delete error:', error);
            return false;
        }
    }

    async getSignedUrl(key: string, expiresInSeconds: number = 3600): Promise<string> {
        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: key,
        });
        return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
    }

    async list(folder: string): Promise<StorageFile[]> {
        const command = new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: folder.endsWith('/') ? folder : `${folder}/`,
        });

        const response = await this.client.send(command);

        return (response.Contents || []).map(obj => ({
            key: obj.Key || '',
            url: `${this.publicUrl}/${obj.Key}`,
            name: obj.Key?.split('/').pop() || '',
            size: obj.Size || 0,
            contentType: 'application/octet-stream',
            lastModified: obj.LastModified || new Date(),
        }));
    }

    async exists(key: string): Promise<boolean> {
        try {
            const command = new HeadObjectCommand({
                Bucket: this.bucket,
                Key: key,
            });
            await this.client.send(command);
            return true;
        } catch {
            return false;
        }
    }

    private getExtension(contentType: string): string {
        const map: Record<string, string> = {
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'image/gif': '.gif',
            'image/webp': '.webp',
            'video/mp4': '.mp4',
            'video/webm': '.webm',
            'application/pdf': '.pdf',
        };
        return map[contentType] || '';
    }
}
