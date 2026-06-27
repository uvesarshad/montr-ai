'use server';

import { getSession } from '@/lib/get-session';


interface PinterestData {
    title: string;
    description: string;
    imageUrl: string | null;
    dominantColors: string[];
    boardName: string | null;
    link: string | null;
    pinner: {
        name: string | null;
        username: string | null;
    } | null;
    aiPrompt: string;
}

interface ProcessPinterestResult {
    success: boolean;
    data?: PinterestData;
    error?: string;
}

/**
 * Extracts Pinterest Pin ID from a URL
 */
function extractPinId(url: string): string | null {
    // Match patterns like /pin/123456789/ or /pin/123456789
    const match = url.match(/\/pin\/(\d+)/);
    return match ? match[1] : null;
}

/**
 * Processes a Pinterest URL and extracts design inspiration data.
 * Uses Pinterest's oEmbed API for basic metadata.
 */
export async function processPinterestPin(input: { url: string }): Promise<ProcessPinterestResult> {
    const session = await getSession();
    if (!session?.user) {
        return { success: false, error: 'Authentication required' };
    }

    const { url } = input;

    try {
        // Extract pin ID for validation
        const pinId = extractPinId(url);
        if (!pinId) {
            return { success: false, error: 'Invalid Pinterest URL - could not extract pin ID' };
        }

        // Use Pinterest oEmbed API for basic metadata
        const oEmbedUrl = `https://www.pinterest.com/oembed.json?url=${encodeURIComponent(url)}`;

        const response = await fetch(oEmbedUrl, {
            headers: {
                'User-Agent': 'MontrAI/1.0'
            }
        });

        if (!response.ok) {
            throw new Error(`Pinterest API returned ${response.status}`);
        }

        const oEmbedData = await response.json();

        // Extract data from oEmbed response
        const title = oEmbedData.title || 'Untitled Pin';
        const description = oEmbedData.description || '';
        const authorName = oEmbedData.author_name || null;
        const authorUrl = oEmbedData.author_url || null;

        // Extract thumbnail/image URL from the HTML embed
        let imageUrl: string | null = null;
        if (oEmbedData.thumbnail_url) {
            imageUrl = oEmbedData.thumbnail_url;
        }

        // Extract username from author URL
        let username: string | null = null;
        if (authorUrl) {
            const usernameMatch = authorUrl.match(/pinterest\.com\/([^\/]+)/);
            username = usernameMatch ? usernameMatch[1] : null;
        }

        // Generate an AI-ready prompt from the Pinterest data
        const aiPrompt = generateDesignPrompt(title, description, imageUrl);

        const pinterestData: PinterestData = {
            title,
            description,
            imageUrl,
            dominantColors: [], // Would require image analysis
            boardName: null, // Not available via oEmbed
            link: url,
            pinner: authorName ? {
                name: authorName,
                username: username
            } : null,
            aiPrompt
        };

        return { success: true, data: pinterestData };

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('Pinterest processing failed:', error);
        return {
            success: false,
            error: message || 'Failed to process Pinterest pin'
        };
    }
}

/**
 * Generates an AI-ready design prompt from Pinterest data
 */
function generateDesignPrompt(title: string, description: string, imageUrl: string | null): string {
    const parts: string[] = [];

    parts.push('Design Inspiration from Pinterest:');

    if (title && title !== 'Untitled Pin') {
        parts.push(`Title: ${title}`);
    }

    if (description) {
        parts.push(`Description: ${description}`);
    }

    if (imageUrl) {
        parts.push(`\nReference Image: ${imageUrl}`);
    }

    parts.push('\n---');
    parts.push('Use this as inspiration for your design. Consider the visual style, color palette, composition, and mood conveyed in this pin.');

    return parts.join('\n');
}
