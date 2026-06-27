'use server';
/**
 * @fileOverview A flow to generate a pre-signed URL for client-side uploads to Wasabi S3.
 */
import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Zod schema for the input
const GeneratePresignedUrlInputSchema = z.object({
  fileName: z.string().describe('The name of the file to be uploaded.'),
  fileType: z.string().describe('The MIME type of the file.'),
});
export type GeneratePresignedUrlInput = z.infer<typeof GeneratePresignedUrlInputSchema>;

// Zod schema for the output
const GeneratePresignedUrlOutputSchema = z.object({
  uploadUrl: z.string().url().describe('The pre-signed URL to upload the file to.'),
  fileUrl: z.string().url().describe('The final public URL of the file after upload.'),
});
export type GeneratePresignedUrlOutput = z.infer<typeof GeneratePresignedUrlOutputSchema>;

// Create an S3 client configured for Wasabi
const s3Client = new S3Client({
  region: process.env.WASABI_REGION!,
  endpoint: `https://s3.${process.env.WASABI_REGION}.wasabisys.com`,
  credentials: {
    accessKeyId: process.env.WASABI_ACCESS_KEY_ID!,
    secretAccessKey: process.env.WASABI_SECRET_ACCESS_KEY!,
  },
});

export async function generatePresignedUrl(
  input: GeneratePresignedUrlInput
): Promise<GeneratePresignedUrlOutput> {
  return generatePresignedUrlFlow(input);
}

const generatePresignedUrlFlow = ai.defineFlow(
  {
    name: 'generatePresignedUrlFlow',
    inputSchema: GeneratePresignedUrlInputSchema,
    outputSchema: GeneratePresignedUrlOutputSchema,
  },
  async ({ fileName, fileType }) => {
    const bucketName = process.env.WASABI_BUCKET_NAME;
    if (!bucketName) {
      throw new Error('WASABI_BUCKET_NAME environment variable is not set.');
    }

    // Sanitize file name and create a unique key
    const uniqueKey = `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '')}`;

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: uniqueKey,
      ContentType: fileType,
    });

    try {
      // Create the presigned URL
      const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // URL expires in 1 hour

      // Construct the final public URL
      const fileUrl = `https://${bucketName}.s3.${process.env.WASABI_REGION}.wasabisys.com/${uniqueKey}`;

      return {
        uploadUrl,
        fileUrl,
      };
    } catch (error) {
      console.error('Error generating pre-signed URL:', error);
      throw new Error('Could not generate file upload URL.');
    }
  }
);
