import { IWhatsAppAccount } from '@/lib/db/models/whatsapp-account.model';

export interface MediaUploadResult {
    mediaId: string;
    url?: string;
}

export interface MediaDownloadResult {
    url: string;
    mimeType: string;
    sha256: string;
}

/**
 * Media Handler Service for WhatsApp
 * Handles uploading and downloading media files via Meta Graph API
 */
export class MediaHandlerService {
    /**
     * Upload media to WhatsApp (Meta Graph API)
     * @param account WhatsApp account
     * @param file File buffer or URL
     * @param mimeType MIME type of the file
     * @returns Media ID from Meta
     */
    async uploadMedia(
        account: IWhatsAppAccount,
        file: Buffer | string,
        mimeType: string
    ): Promise<MediaUploadResult> {
        try {
            const url = `https://graph.facebook.com/v18.0/${account.phoneNumberId}/media`;

            let formData: FormData;

            if (typeof file === 'string') {
                // URL-based upload
                formData = new FormData();
                formData.append('messaging_product', 'whatsapp');
                formData.append('file', file);
                formData.append('type', mimeType);
            } else {
                // File buffer upload - convert Buffer to Uint8Array
                const uint8Array = new Uint8Array(file);
                const blob = new Blob([uint8Array], { type: mimeType });
                formData = new FormData();
                formData.append('messaging_product', 'whatsapp');
                formData.append('file', blob);
                formData.append('type', mimeType);
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${account.accessToken}`,
                },
                body: formData,
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(`Media upload failed: ${JSON.stringify(error)}`);
            }

            const result = await response.json();
            return {
                mediaId: result.id,
                url: result.url,
            };
        } catch (error) {
            console.error('Error uploading media:', error);
            throw error;
        }
    }

    /**
     * Download media from WhatsApp
     * @param account WhatsApp account
     * @param mediaId Media ID from Meta
     * @returns Media URL and metadata
     */
    async downloadMedia(
        account: IWhatsAppAccount,
        mediaId: string
    ): Promise<MediaDownloadResult> {
        try {
            // Step 1: Get media URL
            const urlResponse = await fetch(
                `https://graph.facebook.com/v18.0/${mediaId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${account.accessToken}`,
                    },
                }
            );

            if (!urlResponse.ok) {
                const error = await urlResponse.json();
                throw new Error(`Failed to get media URL: ${JSON.stringify(error)}`);
            }

            const urlData = await urlResponse.json();

            return {
                url: urlData.url,
                mimeType: urlData.mime_type,
                sha256: urlData.sha256,
            };
        } catch (error) {
            console.error('Error downloading media:', error);
            throw error;
        }
    }

    /**
     * Get supported media types
     */
    getSupportedMediaTypes() {
        return {
            image: ['image/jpeg', 'image/png'],
            video: ['video/mp4', 'video/3gpp'],
            audio: ['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg'],
            document: [
                'text/plain',
                'application/pdf',
                'application/vnd.ms-powerpoint',
                'application/msword',
                'application/vnd.ms-excel',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            ],
        };
    }

    /**
     * Validate media type
     */
    isValidMediaType(mimeType: string, mediaType: 'image' | 'video' | 'audio' | 'document'): boolean {
        const supportedTypes = this.getSupportedMediaTypes();
        return supportedTypes[mediaType].includes(mimeType);
    }
}

export const mediaHandlerService = new MediaHandlerService();
