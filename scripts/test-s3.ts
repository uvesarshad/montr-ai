// @ts-ignore
import { getS3Client, checkS3Connection } from '../src/lib/storage/s3-client.ts';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function verifyS3() {
    console.log('Testing S3 Connection...');
    console.log('Provider:', process.env.STORAGE_PROVIDER);

    if (process.env.STORAGE_PROVIDER === 'wasabi') {
        console.log('Bucket:', process.env.WASABI_BUCKET || process.env.WASABI_BUCKET_NAME);
        console.log('Access Key ID:', process.env.WASABI_ACCESS_KEY_ID ? '******' : 'MISSING');
    } else {
        console.log('Bucket:', process.env.AWS_S3_BUCKET);
        console.log('Access Key ID:', process.env.AWS_ACCESS_KEY_ID ? '******' : 'MISSING');
    }

    try {
        const isConnected = await checkS3Connection();
        if (isConnected) {
            console.log('\n✅ SUCCESS: S3 is configured correctly!');
        } else {
            console.log('\n❌ FAILURE: Could not connect to S3.');
        }
    } catch (e) {
        console.error('Error during test:', e);
    }
}

verifyS3();
