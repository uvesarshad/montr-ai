/**
 * URL validation utilities for social media platforms.
 * Provides secure validation with proper regex patterns.
 */

const URL_PATTERNS = {
    twitter: /^https?:\/\/(www\.)?(twitter\.com|x\.com)\/\w+\/status\/(\d+)/,
    linkedin: /^https?:\/\/(www\.)?linkedin\.com\/(posts|feed|pulse|in)\/.+/,
    instagram: /^https?:\/\/(www\.)?instagram\.com\/(p|reel)\/[\w-]+/,
    reddit: /^https?:\/\/(www\.)?reddit\.com\/r\/\w+\/comments\/\w+/,
    youtube:
        /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)[\w-]+/,
    pinterest: /^https?:\/\/((www\.|[a-z]{2}\.)?pinterest\.(com|co\.\w+)\/pin\/[\w-]+|pin\.it\/[\w-]+)/,
} as const;



type SocialPlatform = keyof typeof URL_PATTERNS;

interface ValidationResult {
    isValid: boolean;
    extractedId?: string;
    error?: string;
}

/**
 * Validates a social media URL and extracts relevant IDs
 */
export function validateSocialUrl(
    url: string,
    platform: SocialPlatform
): ValidationResult {
    if (!url || typeof url !== 'string') {
        return { isValid: false, error: 'URL is required' };
    }

    // Basic URL validation
    try {
        new URL(url);
    } catch {
        return { isValid: false, error: 'Invalid URL format' };
    }

    const pattern = URL_PATTERNS[platform];
    const match = url.match(pattern);

    if (!match) {
        return { isValid: false, error: `Invalid ${platform} URL format` };
    }

    // Platform-specific ID extraction
    let extractedId: string | undefined;
    switch (platform) {
        case 'twitter':
            extractedId = match[3]; // Tweet ID
            break;
        case 'youtube':
            extractedId = extractYouTubeId(url) ?? undefined;
            break;
        case 'instagram':
            extractedId = extractInstagramShortcode(url) ?? undefined;
            break;
        default:
            extractedId = undefined;
    }


    return { isValid: true, extractedId };
}

/**
 * Extracts YouTube video ID from various URL formats
 */
export function extractYouTubeId(url: string): string | null {
    try {
        const urlObj = new URL(url);

        // Handle youtu.be short URLs
        if (urlObj.hostname === 'youtu.be') {
            return urlObj.pathname.slice(1).split('?')[0];
        }

        // Handle youtube.com URLs
        if (urlObj.hostname.includes('youtube.com')) {
            // Standard watch URL
            const videoId = urlObj.searchParams.get('v');
            if (videoId) return videoId;

            // Shorts URL
            const pathParts = urlObj.pathname.split('/');
            if (pathParts[1] === 'shorts' && pathParts[2]) {
                return pathParts[2];
            }
        }

        return null;
    } catch {
        return null;
    }
}

/**
 * Extracts Instagram shortcode from URL
 */
export function extractInstagramShortcode(url: string): string | null {
    try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/').filter((p) => p);

        if ((pathParts[0] === 'p' || pathParts[0] === 'reel') && pathParts[1]) {
            return pathParts[1];
        }

        return null;
    } catch {
        return null;
    }
}

/**
 * Extracts Twitter/X tweet ID from URL
 */
export function extractTweetId(url: string): string | null {
    const match = url.match(URL_PATTERNS.twitter);
    return match ? match[3] : null;
}

/**
 * Validates if a URL is from an allowed domain for image fetching
 * Used to prevent SSRF attacks
 */
export function isAllowedImageDomain(url: string): boolean {
    const ALLOWED_DOMAINS = [
        'images.unsplash.com',
        'cdn.pixabay.com',
        'i.imgur.com',
        'pbs.twimg.com',
        'scontent.cdninstagram.com',
        'img.youtube.com',
        'i.ytimg.com',
        'preview.redd.it',
        'external-preview.redd.it',
        // Add your S3/Wasabi bucket domains
    ];

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

    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase();

        // Block internal/private networks
        for (const pattern of BLOCKED_PATTERNS) {
            if (pattern.test(hostname)) {
                return false;
            }
        }

        // Allow specific trusted domains
        return ALLOWED_DOMAINS.some(
            (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
        );
    } catch {
        return false;
    }
}

/**
 * Validates any URL and returns whether it's safe to fetch
 */
export function isValidHttpUrl(url: string): boolean {
    try {
        const urlObj = new URL(url);
        return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
        return false;
    }
}
