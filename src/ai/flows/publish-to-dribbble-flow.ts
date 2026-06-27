'use server';
/**
 * @fileOverview A flow to publish a shot to Dribbble.
 *
 * - publishToDribbble - Uploads a shot to Dribbble with image and description.
 * - Creates beautiful presentation with gradient background based on image colors
 * - PublishToDribbbleInput - The input type.
 * - PublishToDribbbleOutput - The return type.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import sharp from 'sharp';

const PublishToDribbbleInputSchema = z.object({
    title: z.string().describe('The title of the shot.'),
    description: z.string().optional().describe('Optional description of the shot.'),
    imageUrl: z.string().describe('Base64 data URL of the image to upload.'),
    socialAccountId: z.string().describe('The ID of the connected Dribbble account.'),
    tags: z.array(z.string()).optional().describe('Optional tags (max 12).'),
});
export type PublishToDribbbleInput = z.infer<typeof PublishToDribbbleInputSchema>;

const PublishToDribbbleOutputSchema = z.object({
    shotId: z.number().describe('The ID of the created shot.'),
    shotUrl: z.string().describe('The URL of the shot on Dribbble.'),
});
export type PublishToDribbbleOutput = z.infer<typeof PublishToDribbbleOutputSchema>;


export async function publishToDribbble(input: PublishToDribbbleInput): Promise<PublishToDribbbleOutput> {
    return publishToDribbbleFlow(input);
}


const publishToDribbbleFlow = ai.defineFlow(
    {
        name: 'publishToDribbbleFlow',
        inputSchema: PublishToDribbbleInputSchema,
        outputSchema: PublishToDribbbleOutputSchema,
    },
    async ({ title, description, imageUrl, socialAccountId, tags }) => {
        const accountData = await socialAccountRepository.findByIdWithTokens(socialAccountId);

        if (!accountData) {
            throw new Error('Social account not found. Please reconnect your Dribbble account.');
        }

        const { account, accessToken } = accountData;

        if (account.platform !== 'dribbble') {
            throw new Error('Invalid account. This is not a Dribbble account.');
        }

        if (!accessToken) {
            throw new Error('Access token not found. Please reconnect your Dribbble account.');
        }

        try {
            const buffer = await getImageBuffer(imageUrl);

            // Dribbble requires 4:3 ratio between 400×300 and 1600×1200
            const canvasWidth = 1600;
            const canvasHeight = 1200;
            const padding = 80; // Padding around the image
            const cornerRadius = 20;

            // Get original image
            const originalImage = sharp(buffer);
            const metadata = await originalImage.metadata();

            if (!metadata.width || !metadata.height) {
                throw new Error('Could not determine image dimensions');
            }

            // Extract dominant colors from the image for gradient
            const stats = await originalImage.stats();
            const dominantColor = stats.dominant;

            // Create gradient colors based on dominant color
            const color1 = {
                r: Math.min(255, dominantColor.r + 20),
                g: Math.min(255, dominantColor.g + 20),
                b: Math.min(255, dominantColor.b + 20),
            };
            const color2 = {
                r: Math.max(0, dominantColor.r - 30),
                g: Math.max(0, dominantColor.g - 30),
                b: Math.max(0, dominantColor.b - 30),
            };

            // Calculate image size to fit within canvas with padding
            const maxImageWidth = canvasWidth - (padding * 2);
            const maxImageHeight = canvasHeight - (padding * 2);

            let imageWidth = metadata.width;
            let imageHeight = metadata.height;

            // Scale down if needed while maintaining aspect ratio
            if (imageWidth > maxImageWidth || imageHeight > maxImageHeight) {
                const widthRatio = maxImageWidth / imageWidth;
                const heightRatio = maxImageHeight / imageHeight;
                const scale = Math.min(widthRatio, heightRatio);

                imageWidth = Math.round(imageWidth * scale);
                imageHeight = Math.round(imageHeight * scale);
            }

            // Resize original image
            const resizedImage = await originalImage
                .resize(imageWidth, imageHeight, { fit: 'inside' })
                .toBuffer();

            // Create rounded corners with shadow effect
            const roundedImage = await sharp(resizedImage)
                .composite([{
                    input: Buffer.from(
                        `<svg width="${imageWidth}" height="${imageHeight}">
                            <rect x="0" y="0" width="${imageWidth}" height="${imageHeight}" rx="${cornerRadius}" ry="${cornerRadius}" fill="white"/>
                        </svg>`
                    ),
                    blend: 'dest-in'
                }])
                .png()
                .toBuffer();

            // Create gradient background using SVG
            const gradientSVG = `
                <svg width="${canvasWidth}" height="${canvasHeight}">
                    <defs>
                        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" style="stop-color:rgb(${color1.r},${color1.g},${color1.b});stop-opacity:1" />
                            <stop offset="100%" style="stop-color:rgb(${color2.r},${color2.g},${color2.b});stop-opacity:1" />
                        </linearGradient>
                    </defs>
                    <rect width="${canvasWidth}" height="${canvasHeight}" fill="url(#grad)" />
                </svg>
            `;

            // Calculate position to center the image
            const left = Math.round((canvasWidth - imageWidth) / 2);
            const top = Math.round((canvasHeight - imageHeight) / 2);

            // Create shadow layer (slightly larger, offset, blurred)
            const shadowWidth = imageWidth + 20;
            const shadowHeight = imageHeight + 20;
            const shadowLeft = left - 10 + 5; // Offset shadow slightly
            const shadowTop = top - 10 + 8;

            const shadowSVG = `
                <svg width="${shadowWidth}" height="${shadowHeight}">
                    <defs>
                        <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
                            <feGaussianBlur in="SourceAlpha" stdDeviation="15"/>
                            <feOffset dx="0" dy="4" result="offsetblur"/>
                            <feComponentTransfer>
                                <feFuncA type="linear" slope="0.3"/>
                            </feComponentTransfer>
                            <feMerge>
                                <feMergeNode/>
                                <feMergeNode in="SourceGraphic"/>
                            </feMerge>
                        </filter>
                    </defs>
                    <rect x="10" y="10" width="${imageWidth}" height="${imageHeight}" rx="${cornerRadius}" fill="rgba(0,0,0,0.4)" filter="url(#shadow)"/>
                </svg>
            `;

            // Compose final image: gradient background + shadow + rounded image
            const finalImage = await sharp(Buffer.from(gradientSVG))
                .composite([
                    {
                        input: Buffer.from(shadowSVG),
                        top: shadowTop,
                        left: shadowLeft,
                    },
                    {
                        input: roundedImage,
                        top: top,
                        left: left,
                    }
                ])
                .jpeg({ quality: 95 })
                .toBuffer();

            console.log(`Dribbble: Created presentation ${canvasWidth}×${canvasHeight} with ${imageWidth}×${imageHeight} image`);

            // Check final size
            const finalSizeMB = finalImage.length / (1024 * 1024);
            if (finalSizeMB > 10) {
                throw new Error(`Final image is too large (${finalSizeMB.toFixed(2)}MB). Maximum is 10MB.`);
            }

            // Create FormData for multipart upload
            const formData = new FormData();
            const blob = new Blob([new Uint8Array(finalImage)], { type: 'image/jpeg' });
            formData.append('image', blob, 'shot.jpg');
            formData.append('title', title);

            if (description) {
                formData.append('description', description);
            }

            if (tags && tags.length > 0) {
                const limitedTags = tags.slice(0, 12);
                formData.append('tags', limitedTags.join(','));
            }

            console.log('Uploading to Dribbble:', { title, hasDescription: !!description, imageSize: finalImage.length });

            // Upload shot to Dribbble
            const response = await fetch('https://api.dribbble.com/v2/shots', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                },
                body: formData,
            });

            console.log('Dribbble API response status:', response.status);

            if (!response.ok && response.status !== 202) {
                const responseText = await response.text();
                console.error('Dribbble API Error Response:', responseText);

                let errorMessage = response.statusText;
                try {
                    const errorData = JSON.parse(responseText);
                    errorMessage = errorData.message || errorData.error || JSON.stringify(errorData);
                } catch {
                    errorMessage = responseText || response.statusText;
                }

                await socialAccountRepository.recordError(
                    socialAccountId,
                    errorMessage
                );

                throw new Error(`Dribbble API Error (${response.status}): ${errorMessage}`);
            }

            // Handle 202 Accepted - Dribbble processes uploads asynchronously
            if (response.status === 202) {
                console.log('Dribbble accepted upload for async processing');
                await socialAccountRepository.markUsed(socialAccountId);

                return {
                    shotId: 0,
                    shotUrl: 'https://dribbble.com/shots',
                };
            }

            const responseText = await response.text();
            console.log('Dribbble API success response:', responseText);

            let shotData;
            try {
                shotData = JSON.parse(responseText);
            } catch {
                console.error('Failed to parse Dribbble response:', responseText);
                await socialAccountRepository.markUsed(socialAccountId);
                return {
                    shotId: 0,
                    shotUrl: 'https://dribbble.com/shots',
                };
            }

            await socialAccountRepository.markUsed(socialAccountId);

            return {
                shotId: shotData.id,
                shotUrl: shotData.html_url,
            };

        } catch (error: unknown) {
            console.error('Failed to publish to Dribbble:', error);
            throw new Error(`Could not upload shot to Dribbble: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
);

async function getImageBuffer(imageUrl: string): Promise<Buffer> {
    const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (matches) {
        return Buffer.from(matches[2], 'base64');
    }

    const response = await fetch(imageUrl);
    if (!response.ok) {
        throw new Error('Failed to download image from URL');
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}
