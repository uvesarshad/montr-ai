'use server';

import { isValidHttpUrl } from '@/lib/url-validators';

interface FetchImageResult {
    success: boolean;
    dataUri?: string;
    error?: string;
    mimeType?: string;
}

const BLOCKED_PATTERNS = [
    /^localhost/i,
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./,
    /^0\./,
    /^169\.254\./,
    /\.local$/i,
    /\.internal$/i,
];

/**
 * Securely fetches an image from a remote URL and returns it as a data URI.
 * Includes SSRF protection to prevent fetching from internal networks.
 * 
 * @param url - The remote image URL to fetch
 * @returns The image as a base64 data URI or an error
 */
export async function fetchRemoteImage(url: string): Promise<FetchImageResult> {
    // Validate URL format
    if (!url || !isValidHttpUrl(url)) {
        return { success: false, error: 'Invalid URL format' };
    }

    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase();

        // Block internal/private networks (SSRF protection)
        for (const pattern of BLOCKED_PATTERNS) {
            if (pattern.test(hostname)) {
                return {
                    success: false,
                    error: 'Access to internal networks is not allowed',
                };
            }
        }

        // Only allow HTTPS in production for added security
        if (
            process.env.NODE_ENV === 'production' &&
            urlObj.protocol !== 'https:'
        ) {
            return { success: false, error: 'Only HTTPS URLs are allowed' };
        }

        // Fetch with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'MontrAI-ImageFetcher/1.0',
                Accept: 'image/*',
            },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            return {
                success: false,
                error: `Failed to fetch image: ${response.status} ${response.statusText}`,
            };
        }

        // Validate content type
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.startsWith('image/')) {
            return { success: false, error: 'URL does not point to a valid image' };
        }

        // Limit file size (10MB max)
        const contentLength = response.headers.get('content-length');
        if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) {
            return { success: false, error: 'Image file is too large (max 10MB)' };
        }

        // Convert to buffer and then to base64
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Double-check size after download
        if (buffer.length > 10 * 1024 * 1024) {
            return { success: false, error: 'Image file is too large (max 10MB)' };
        }

        const base64 = buffer.toString('base64');
        const mimeType = contentType.split(';')[0].trim();
        const dataUri = `data:${mimeType};base64,${base64}`;

        return { success: true, dataUri, mimeType };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const name = error instanceof Error ? error.name : '';
        if (name === 'AbortError') {
            return { success: false, error: 'Request timed out' };
        }
        return {
            success: false,
            error: message || 'Failed to fetch image',
        };
    }
}
