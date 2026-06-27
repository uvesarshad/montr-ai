'use server';
/**
 * @fileOverview Server action to publish a post to LinkedIn with media support.
 *
 * Supports single image, multi-image (carousel), and video posts via the
 * LinkedIn assets/ugcPosts API, plus an optional first comment posted on the
 * created UGC post.
 */

import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import { S3Provider } from '@/lib/storage/providers/s3-provider';

interface PublishToLinkedInInput {
  text: string;
  socialAccountId: string;
  mediaUrl?: string;
  /** Full ordered media list. When provided (and non-empty) takes precedence over mediaUrl. */
  mediaUrls?: string[];
  /** Whether the media is image(s) or a single video. Defaults to 'image'. */
  mediaType?: 'image' | 'video';
  /** Optional comment posted on the new UGC post after publishing (non-fatal). */
  firstComment?: string;
}

interface PublishToLinkedInOutput {
  postId?: string;
  error?: string;
}

export async function publishToLinkedIn(input: PublishToLinkedInInput): Promise<PublishToLinkedInOutput> {
  const { text, socialAccountId, firstComment } = input;

  // Normalize media inputs: prefer the full ordered list, fall back to single mediaUrl.
  const mediaUrls = (input.mediaUrls && input.mediaUrls.length > 0)
    ? input.mediaUrls
    : (input.mediaUrl ? [input.mediaUrl] : []);
  const mediaType: 'image' | 'video' = input.mediaType || 'image';

  console.log('[LinkedIn] publishToLinkedIn called', { socialAccountId, mediaCount: mediaUrls.length, mediaType });

  try {
    console.log('[LinkedIn] Step 1: fetching account data from DB...');
    const accountData = await socialAccountRepository.findByIdWithTokens(socialAccountId);
    console.log('[LinkedIn] Step 1 done. accountData found:', !!accountData);

    if (!accountData) {
      return { error: 'Social account not found. Please reconnect your LinkedIn account.' };
    }

    const { account, accessToken } = accountData;

    if (account.platform !== 'linkedin') {
      return { error: 'Invalid account. This is not a LinkedIn account.' };
    }

    if (!accessToken) {
      return { error: 'Access token not found. Please reconnect your LinkedIn account.' };
    }

    let authorUrn = '';
    if (account.platformAccountId.startsWith('urn:li:organization:')) {
      authorUrn = account.platformAccountId;
    } else {
      authorUrn = `urn:li:person:${account.platformAccountId}`;
    }
    console.log('[LinkedIn] Step 2: authorUrn =', authorUrn);

    // For video, LinkedIn only allows a single media asset per post.
    const effectiveMediaUrls = mediaType === 'video' ? mediaUrls.slice(0, 1) : mediaUrls;

    // Step 3: Register + upload each media item, collecting the resulting asset URNs.
    const mediaAssets: string[] = [];
    for (const mediaUrl of effectiveMediaUrls) {
      const asset = await uploadLinkedInMedia({ accessToken, authorUrn, mediaUrl, mediaType });
      if ('error' in asset) {
        return { error: asset.error };
      }
      mediaAssets.push(asset.asset);
    }

    // Step 6: Create post
    console.log('[LinkedIn] Step 6: creating ugcPost...');
    const endpointURL = 'https://api.linkedin.com/v2/ugcPosts';

    type LinkedInShareContent = {
      shareCommentary: { text: string };
      shareMediaCategory: 'IMAGE' | 'VIDEO' | 'NONE';
      media?: Array<{ status: string; media: string }>;
    };
    type LinkedInUgcPost = {
      author: string;
      lifecycleState: string;
      specificContent: { 'com.linkedin.ugc.ShareContent': LinkedInShareContent };
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': string };
    };

    let shareMediaCategory: 'IMAGE' | 'VIDEO' | 'NONE' = 'NONE';
    if (mediaAssets.length > 0) {
      shareMediaCategory = mediaType === 'video' ? 'VIDEO' : 'IMAGE';
    }

    const requestBody: LinkedInUgcPost = {
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: {
            text: text,
          },
          shareMediaCategory,
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    };

    if (mediaAssets.length > 0) {
      requestBody.specificContent['com.linkedin.ugc.ShareContent'].media = mediaAssets.map(asset => ({
        status: 'READY',
        media: asset,
      }));
    }

    const response = await fetch(endpointURL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(requestBody),
    });

    console.log('[LinkedIn] Step 6 response status:', response.status);
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: 'Unknown error' }));
      console.error('[LinkedIn] Step 6 FAILED:', response.status, JSON.stringify(errorBody));

      await socialAccountRepository.recordError(
        socialAccountId,
        `${response.status}: ${errorBody.message || 'Unknown error'}`
      );

      if (response.status === 401) {
        return { error: `LinkedIn API Error: 401 Unauthorized. Your access token may be expired. Please reconnect your LinkedIn account.` };
      }
      if (response.status === 403) {
        return { error: `LinkedIn API Error: 403 Forbidden. Your app may not have the required permissions.` };
      }
      return { error: `LinkedIn API Error: ${response.status} - ${errorBody.message || 'Unknown error'}` };
    }

    let postId = response.headers.get('x-restli-id');
    if (!postId) {
      const responseData = await response.json();
      postId = responseData.id;
    }
    console.log('[LinkedIn] Step 6 done. postId:', postId);

    await socialAccountRepository.markUsed(socialAccountId);

    // Step 7: Post first comment on the new UGC post (non-fatal).
    if (firstComment && firstComment.trim() && postId) {
      try {
        await postLinkedInComment({ accessToken, authorUrn, postUrn: postId, text: firstComment });
      } catch (err) {
        console.error('[LinkedIn] Step 7 first-comment FAILED (non-fatal):', err);
      }
    }

    return { postId: postId || 'unknown' };

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[LinkedIn] UNCAUGHT ERROR:', error);
    return { error: `LinkedIn publish error: ${message}` };
  }
}

/**
 * Register an upload, download the source media (signing S3 URLs when needed),
 * upload the bytes to LinkedIn, and return the resulting asset URN.
 */
async function uploadLinkedInMedia(params: {
  accessToken: string;
  authorUrn: string;
  mediaUrl: string;
  mediaType: 'image' | 'video';
}): Promise<{ asset: string } | { error: string }> {
  const { accessToken, authorUrn, mediaUrl, mediaType } = params;

  const recipe = mediaType === 'video'
    ? 'urn:li:digitalmediaRecipe:feedshare-video'
    : 'urn:li:digitalmediaRecipe:feedshare-image';

  console.log('[LinkedIn] Step 3: registering media upload with LinkedIn...', { mediaType });
  const registerResponse = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      registerUploadRequest: {
        recipes: [recipe],
        owner: authorUrn,
        serviceRelationships: [{
          relationshipType: 'OWNER',
          identifier: 'urn:li:userGeneratedContent',
        }],
      },
    }),
  });

  console.log('[LinkedIn] Step 3 registerResponse status:', registerResponse.status);
  if (!registerResponse.ok) {
    const errBody = await registerResponse.text();
    console.error('[LinkedIn] Step 3 FAILED:', registerResponse.status, errBody);
    return { error: `Failed to register media upload with LinkedIn (${registerResponse.status}): ${errBody}` };
  }

  const registerData = await registerResponse.json();
  const uploadUrl = registerData.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
  const asset = registerData.value.asset;
  console.log('[LinkedIn] Step 3 done. asset:', asset);

  console.log('[LinkedIn] Step 4: downloading media from S3...', mediaUrl);
  let downloadUrl = mediaUrl;
  try {
    if (mediaUrl.includes('s3') && mediaUrl.includes('amazonaws.com')) {
      const urlObj = new URL(mediaUrl);
      const key = urlObj.pathname.substring(1); // removes leading slash
      console.log('[LinkedIn] Generating signed URL for key:', key);
      const provider = new S3Provider();
      downloadUrl = await provider.getSignedUrl(key, 3600);
    }
  } catch (err) {
    console.error('[LinkedIn] Failed to generate signed url. Falling back to original.', err);
  }

  const mediaResponse = await fetch(downloadUrl);
  console.log('[LinkedIn] Step 4 mediaResponse status:', mediaResponse.status);
  if (!mediaResponse.ok) {
    console.error('[LinkedIn] Step 4 FAILED: could not fetch media from S3');
    return { error: `Failed to download media from S3 (${mediaResponse.status}). The bucket may not be publicly accessible.` };
  }
  const mediaBuffer = await mediaResponse.arrayBuffer();
  console.log('[LinkedIn] Step 4 done. mediaBuffer byteLength:', mediaBuffer.byteLength);

  console.log('[LinkedIn] Step 5: uploading media to LinkedIn uploadUrl...');
  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
    body: mediaBuffer,
  });

  console.log('[LinkedIn] Step 5 uploadResponse status:', uploadResponse.status);
  if (!uploadResponse.ok) {
    const errBody = await uploadResponse.text();
    console.error('[LinkedIn] Step 5 FAILED:', uploadResponse.status, errBody);
    return { error: `Failed to upload media to LinkedIn (${uploadResponse.status}): ${errBody}` };
  }
  console.log('[LinkedIn] Step 5 done.');

  return { asset };
}

/**
 * Post a comment on a UGC post. Uses the socialActions comments endpoint.
 * The actor is the same author URN that created the post.
 */
async function postLinkedInComment(params: {
  accessToken: string;
  authorUrn: string;
  postUrn: string;
  text: string;
}): Promise<void> {
  const { accessToken, authorUrn, postUrn, text } = params;
  const encodedUrn = encodeURIComponent(postUrn);
  const url = `https://api.linkedin.com/v2/socialActions/${encodedUrn}/comments`;

  console.log('[LinkedIn] Step 7: posting first comment on', postUrn);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      actor: authorUrn,
      message: { text },
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`LinkedIn comment failed (${response.status}): ${errBody}`);
  }
  console.log('[LinkedIn] Step 7 done.');
}
