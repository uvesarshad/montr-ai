import { S3Client } from '@aws-sdk/client-s3';

// S3 Configuration that supports both AWS and Wasabi
const getS3Config = () => {
    const isWasabi = process.env.STORAGE_PROVIDER === 'wasabi';

    const accessKeyId = isWasabi
        ? (process.env.WASABI_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || '')
        : (process.env.AWS_ACCESS_KEY_ID || '');

    const secretAccessKey = isWasabi
        ? (process.env.WASABI_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || '')
        : (process.env.AWS_SECRET_ACCESS_KEY || '');

    return {
        region: isWasabi ? (process.env.WASABI_REGION || 'us-east-1') : (process.env.AWS_REGION || 'us-east-1'),
        credentials: {
            accessKeyId,
            secretAccessKey,
        },
        ...(isWasabi && {
            endpoint: process.env.WASABI_ENDPOINT || 'https://s3.wasabisys.com',
            forcePathStyle: true, // Required for Wasabi
        }),
    };
};

// Create S3 client instance
let s3Client: S3Client | null = null;

/**
 * Get or create S3 client instance
 * @returns S3Client
 */
export function getS3Client(): S3Client {
    if (!s3Client) {
        const config = getS3Config();

        if (!config.credentials.accessKeyId || !config.credentials.secretAccessKey) {
            throw new Error('AWS credentials not configured. Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY');
        }



        s3Client = new S3Client(config);
    }

    return s3Client;
}

/**
 * Get S3 bucket name
 * @returns string
 */
export function getBucketName(): string {
    const bucket = process.env.STORAGE_PROVIDER === 'wasabi'
        ? (process.env.WASABI_BUCKET || process.env.WASABI_BUCKET_NAME)
        : process.env.AWS_S3_BUCKET;

    if (!bucket) {
        throw new Error('S3 bucket not configured');
    }

    return bucket;
}

/**
 * Health check for S3 connection
 * @returns Promise<boolean>
 */
export async function checkS3Connection(): Promise<boolean> {
    try {
        const { HeadBucketCommand } = await import('@aws-sdk/client-s3');
        const client = getS3Client();
        const bucket = getBucketName();

        await client.send(new HeadBucketCommand({ Bucket: bucket }));
        console.log('✅ S3 connection successful');
        return true;
    } catch (error) {
        console.error('❌ S3 connection failed:', error);
        return false;
    }
}

export default getS3Client;
