'use server';
/**
 * @fileOverview A flow to publish a post to X (formerly Twitter) with media support.
 * Uses X API v2 media upload endpoints with OAuth 2.0
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';

const PublishToXInputSchema = z.object({
  text: z.string().describe('The text content of the tweet.'),
  socialAccountId: z.string().describe('The ID of the connected social account to post from.'),
  mediaUrl: z.string().optional().describe('Optional base64 data URL of media to attach.'),
  mediaUrls: z.array(z.string()).optional().describe('Optional ordered list of media (base64 data URLs or public URLs) to attach — up to 4 images.'),
  replyToTweetId: z.string().optional().describe('Optional tweet ID to reply to (for thread chaining or first-comment).'),
});
export type PublishToXInput = z.infer<typeof PublishToXInputSchema>;

const PublishToXOutputSchema = z.object({
  tweetId: z.string().describe('The ID of the newly created tweet.'),
  tweetUrl: z.string().url().describe('The URL of the newly created tweet.'),
});
export type PublishToXOutput = z.infer<typeof PublishToXOutputSchema>;


export async function publishToX(input: PublishToXInput): Promise<PublishToXOutput> {
  return publishToXFlow(input);
}


const publishToXFlow = ai.defineFlow(
  {
    name: 'publishToXFlow',
    inputSchema: PublishToXInputSchema,
    outputSchema: PublishToXOutputSchema,
  },
  async ({ text, socialAccountId, mediaUrl, mediaUrls, replyToTweetId }) => {
    const accountData = await socialAccountRepository.findByIdWithTokens(socialAccountId);

    if (!accountData) {
      throw new Error('Social account not found. Please reconnect your X account.');
    }

    const { account, accessToken } = accountData;

    if (account.platform !== 'x') {
      throw new Error('Invalid account. This is not an X (Twitter) account.');
    }

    if (!accessToken) {
      throw new Error('Access token not found. Please reconnect your X account.');
    }

    try {
      // Step 1: Upload media if provided using X API v2.
      // Prefer the ordered mediaUrls array (up to 4 images); fall back to the
      // legacy single mediaUrl for backward compatibility.
      const mediaSources = (mediaUrls && mediaUrls.length > 0)
        ? mediaUrls.slice(0, 4)
        : (mediaUrl ? [mediaUrl] : []);

      const mediaIds: string[] = [];
      for (const src of mediaSources) {
        if (!src) continue;
        const id = await uploadMediaToX(src, accessToken);
        mediaIds.push(id);
      }

      // Step 2: Create tweet with optional media / reply chaining
      const endpointURL = 'https://api.x.com/2/tweets';
      const requestBody: {
        text: string;
        media?: { media_ids: string[] };
        reply?: { in_reply_to_tweet_id: string };
      } = { text };

      if (mediaIds.length > 0) {
        requestBody.media = { media_ids: mediaIds };
      }

      if (replyToTweetId) {
        requestBody.reply = { in_reply_to_tweet_id: replyToTweetId };
      }

      const response = await fetch(endpointURL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': 'Montr-AI-Studio/1.0',
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorBody = await response.json();
        console.error('X API Error Response:', JSON.stringify(errorBody, null, 2));

        await socialAccountRepository.recordError(
          socialAccountId,
          `${response.status}: ${errorBody.detail || errorBody.title || 'Unknown error'}`
        );

        if (response.status === 401) {
          throw new Error(`X API Error: 401 Unauthorized. Your access token may be expired. Please reconnect your X account.`);
        }
        if (response.status === 403) {
          throw new Error(`X API Error: 403 Forbidden. Your app may not have write permissions.`);
        }
        throw new Error(`X API Error: ${response.status} - ${errorBody.detail || errorBody.title || 'Unknown error'}`);
      }

      const responseData = await response.json();
      const tweetId = responseData.data.id;
      const tweetUrl = `https://x.com/${account.platformUsername}/status/${tweetId}`;

      await socialAccountRepository.markUsed(socialAccountId);

      return {
        tweetId,
        tweetUrl,
      };

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Failed to publish to X:', error);
      throw new Error(`Could not publish post to X: ${message}`);
    }
  }
);

/**
 * Upload media to X using the v2 API (3-step process: init, append, finalize)
 */
async function uploadMediaToX(mediaUrl: string, accessToken: string): Promise<string> {
  // Convert base64 data URL to buffer
  let mediaBuffer: Buffer;
  let mimeType: string;

  if (mediaUrl.startsWith('data:')) {
    const matches = mediaUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      throw new Error('Invalid base64 data URL format');
    }
    mimeType = matches[1];
    const base64Data = matches[2];
    mediaBuffer = Buffer.from(base64Data, 'base64');
  } else {
    // Download from URL
    const response = await fetch(mediaUrl);
    if (!response.ok) {
      throw new Error('Failed to download media from URL');
    }
    const arrayBuffer = await response.arrayBuffer();
    mediaBuffer = Buffer.from(arrayBuffer);
    mimeType = response.headers.get('content-type') || 'image/jpeg';
  }

  const totalBytes = mediaBuffer.length;
  const mediaCategory = mimeType.startsWith('video/') ? 'tweet_video' : 'tweet_image';

  console.log(`Uploading media: ${totalBytes} bytes, type: ${mimeType}, category: ${mediaCategory}`);

  // Step 1: INIT - Initialize the upload
  const initResponse = await fetch('https://api.x.com/2/media/upload/initialize', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      total_bytes: totalBytes,
      media_type: mimeType,
      media_category: mediaCategory,
    }),
  });

  if (!initResponse.ok) {
    const errorText = await initResponse.text();
    console.error('X Media INIT Error:', initResponse.status, errorText);
    throw new Error(`Failed to initialize media upload: ${errorText}`);
  }

  const initData = await initResponse.json();
  console.log('X Media INIT Response:', JSON.stringify(initData, null, 2));

  // X API v2 may return media_id in different formats
  const mediaId = initData.media_id_string
    || initData.data?.media_id_string
    || initData.data?.id
    || initData.id
    || initData.media_id?.toString();

  if (!mediaId) {
    console.error('Init response (no media_id found):', JSON.stringify(initData, null, 2));
    throw new Error(`No media_id returned from init. Response: ${JSON.stringify(initData)}`);
  }

  console.log(`Media initialized with ID: ${mediaId}`);

  // Step 2: APPEND - Upload the media in chunks
  const chunkSize = 5 * 1024 * 1024; // 5MB chunks
  let segmentIndex = 0;

  for (let offset = 0; offset < totalBytes; offset += chunkSize) {
    const chunk = mediaBuffer.subarray(offset, Math.min(offset + chunkSize, totalBytes));
    const chunkBase64 = chunk.toString('base64');

    const appendUrl = `https://api.x.com/2/media/upload/${mediaId}/append`;
    const appendResponse = await fetch(appendUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        media: chunkBase64,
        segment_index: segmentIndex,
      }),
    });

    if (!appendResponse.ok) {
      const errorText = await appendResponse.text();
      console.error('X Media APPEND Error:', appendResponse.status, errorText);
      throw new Error(`Failed to append media chunk ${segmentIndex}: ${errorText}`);
    }

    console.log(`Uploaded chunk ${segmentIndex + 1}`);
    segmentIndex++;
  }

  // Step 3: FINALIZE - Complete the upload
  const finalizeUrl = `https://api.x.com/2/media/upload/${mediaId}/finalize`;
  const finalizeResponse = await fetch(finalizeUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!finalizeResponse.ok) {
    const errorText = await finalizeResponse.text();
    console.error('X Media FINALIZE Error:', finalizeResponse.status, errorText);
    throw new Error(`Failed to finalize media upload: ${errorText}`);
  }

  const finalizeData = await finalizeResponse.json();
  console.log('Media upload finalized:', JSON.stringify(finalizeData));

  // For videos, we may need to wait for processing
  if (finalizeData.processing_info) {
    await waitForMediaProcessing(mediaId, accessToken);
  }

  return mediaId;
}

/**
 * Wait for media processing to complete (for videos)
 */
async function waitForMediaProcessing(mediaId: string, accessToken: string): Promise<void> {
  const statusUrl = `https://api.x.com/2/media/upload/${mediaId}/status`;

  for (let i = 0; i < 30; i++) { // Max 30 attempts
    const statusResponse = await fetch(statusUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!statusResponse.ok) {
      throw new Error('Failed to check media processing status');
    }

    const statusData = await statusResponse.json();
    const state = statusData.processing_info?.state;

    if (state === 'succeeded') {
      console.log('Media processing complete');
      return;
    } else if (state === 'failed') {
      throw new Error('Media processing failed');
    }

    // Wait before checking again
    const waitTime = statusData.processing_info?.check_after_secs || 5;
    await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
  }

  throw new Error('Media processing timeout');
}
