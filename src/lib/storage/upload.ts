import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getS3Client, getBucketName } from './s3-client';

export interface UploadOptions {
    buffer: Buffer;
    key: string;
    contentType?: string;
    metadata?: Record<string, string>;
}

export interface UploadResult {
    key: string;
    url: string;
    bucket: string;
}

/**
 * Upload file to S3
 * @param options - Upload options
 * @returns Promise<UploadResult>
 */
export async function uploadFile(options: UploadOptions): Promise<UploadResult> {
    const { buffer, key, contentType = 'application/octet-stream', metadata = {} } = options;

    const client = getS3Client();
    const bucket = getBucketName();

    const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        Metadata: metadata,
    });

    await client.send(command);

    // Generate presigned URL for the uploaded file
    const url = await getPresignedUrl(key);

    return {
        key,
        url,
        bucket,
    };
}

/**
 * Upload base64 string to S3 (useful for canvas previews)
 * @param base64Data - Base64 encoded data
 * @param key - S3 key
 * @param contentType - File content type
 * @returns Promise<UploadResult>
 */
export async function uploadBase64(
    base64Data: string,
    key: string,
    contentType: string = 'image/png'
): Promise<UploadResult> {
    // Remove data URL prefix if present
    const base64String = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64String, 'base64');

    return uploadFile({
        buffer,
        key,
        contentType,
    });
}

/**
 * Get presigned URL for S3 object (valid for 1 hour by default)
 * @param key - S3 key
 * @param expiresIn - URL expiration time in seconds (default: 3600)
 * @returns Promise<string>
 */
export async function getPresignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const client = getS3Client();
    const bucket = getBucketName();

    const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
    });

    const url = await getSignedUrl(client, command, { expiresIn });
    return url;
}

/**
 * Generate S3 key for user-specific files
 * @param userId - User ID
 * @param path - File path relative to user directory
 * @returns string
 */
export function generateUserFileKey(userId: string, path: string): string {
    return `users/${userId}/${path}`;
}

/**
 * Generate S3 key for canvas preview
 * @param userId - User ID
 * @param canvasId - Canvas ID
 * @returns string
 */
export function generateCanvasPreviewKey(userId: string, canvasId: string): string {
    return generateUserFileKey(userId, `canvases/${canvasId}/preview.png`);
}
