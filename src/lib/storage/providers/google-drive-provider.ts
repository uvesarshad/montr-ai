import { v4 as uuidv4 } from 'uuid';
import { IStorageProvider, UploadOptions, UploadResult, StorageFile } from '../types';

/**
 * Google Drive Storage Provider
 * 
 * Uses user-connected Google Drive for personal storage
 */
export class GoogleDriveProvider implements IStorageProvider {
    readonly provider = 'google-drive' as const;
    private accessToken: string;
    private folderId?: string;

    constructor(accessToken: string, folderId?: string) {
        this.accessToken = accessToken;
        this.folderId = folderId;
    }

    async upload(file: Buffer | Blob, options: UploadOptions): Promise<UploadResult> {
        const filename = options.filename || `${uuidv4()}`;
        const contentType = options.contentType || 'application/octet-stream';

        // Prepare metadata
        const metadata: { name: string; mimeType: string; parents?: string[] } = {
            name: filename,
            mimeType: contentType,
        };

        if (this.folderId || options.folder) {
            // If folder specified, find or create it
            const folderId = await this.getOrCreateFolder(options.folder || 'MontrAI');
            metadata.parents = [folderId];
        }

        const body = file instanceof Blob ? file : new Blob([file as unknown as BlobPart], { type: contentType });

        // Create multipart form data
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', body);

        const response = await fetch(
            'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,mimeType,webViewLink,webContentLink',
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.accessToken}`,
                },
                body: form,
            }
        );

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`Google Drive upload failed: ${error.error?.message || 'Unknown error'}`);
        }

        const data = await response.json();

        // Make file publicly accessible
        await this.makePublic(data.id);

        return {
            url: data.webContentLink || `https://drive.google.com/uc?id=${data.id}`,
            key: data.id,
            provider: 'google-drive',
            size: parseInt(data.size) || body.size,
            contentType: data.mimeType || contentType,
        };
    }

    async delete(key: string): Promise<boolean> {
        try {
            const response = await fetch(`https://www.googleapis.com/drive/v3/files/${key}`, {
                method: 'DELETE',
                headers: {
                    Authorization: `Bearer ${this.accessToken}`,
                },
            });
            return response.ok;
        } catch (error) {
            console.error('Google Drive delete error:', error);
            return false;
        }
    }

    async getSignedUrl(key: string): Promise<string> {
        // Google Drive doesn't have signed URLs, return direct link
        return `https://drive.google.com/uc?id=${key}`;
    }

    async list(folder: string): Promise<StorageFile[]> {
        const folderId = await this.findFolder(folder);
        if (!folderId) return [];

        const query = `'${folderId}' in parents and trashed=false`;
        const response = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,size,mimeType,modifiedTime,webContentLink)`,
            {
                headers: {
                    Authorization: `Bearer ${this.accessToken}`,
                },
            }
        );

        if (!response.ok) return [];

        const data = await response.json();
        type DriveFile = { id: string; webContentLink?: string; name: string; size?: string; mimeType: string; modifiedTime: string };
        return (data.files || [] as DriveFile[]).map((file: DriveFile) => ({
            key: file.id,
            url: file.webContentLink || `https://drive.google.com/uc?id=${file.id}`,
            name: file.name,
            size: parseInt(file.size ?? '0') || 0,
            contentType: file.mimeType,
            lastModified: new Date(file.modifiedTime),
        }));
    }

    async exists(key: string): Promise<boolean> {
        try {
            const response = await fetch(`https://www.googleapis.com/drive/v3/files/${key}?fields=id`, {
                headers: {
                    Authorization: `Bearer ${this.accessToken}`,
                },
            });
            return response.ok;
        } catch {
            return false;
        }
    }

    private async makePublic(fileId: string): Promise<void> {
        try {
            await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    role: 'reader',
                    type: 'anyone',
                }),
            });
        } catch (error) {
            console.error('Failed to make file public:', error);
        }
    }

    private async findFolder(name: string): Promise<string | null> {
        const query = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        const response = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)`,
            {
                headers: {
                    Authorization: `Bearer ${this.accessToken}`,
                },
            }
        );

        if (!response.ok) return null;
        const data = await response.json();
        return data.files?.[0]?.id || null;
    }

    private async getOrCreateFolder(name: string): Promise<string> {
        const existing = await this.findFolder(name);
        if (existing) return existing;

        const response = await fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name,
                mimeType: 'application/vnd.google-apps.folder',
            }),
        });

        const data = await response.json();
        return data.id;
    }
}
