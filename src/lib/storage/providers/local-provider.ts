import { promises as fs } from 'fs';
import path from 'path';
import { IStorageProvider, UploadOptions, UploadResult, StorageFile, StorageProvider } from '../types';

/**
 * Local Storage Provider
 * 
 * Used for development or when S3 is not configured.
 * Saves files to the public/uploads directory.
 */
export class LocalProvider implements IStorageProvider {
    readonly provider: StorageProvider = 'local';
    private baseDir: string;

    constructor() {
        this.baseDir = path.join(process.cwd(), 'public');
    }

    async upload(file: Buffer | Blob, options: UploadOptions): Promise<UploadResult> {
        const ext = this.getExtension(options.contentType || 'application/octet-stream');
        const filename = options.filename || `${Date.now()}${ext}`;
        const key = options.folder ? `${options.folder}/${filename}` : filename;
        const uploadPath = path.join(this.baseDir, key);

        // Ensure directory exists
        await fs.mkdir(path.dirname(uploadPath), { recursive: true });

        const buffer = file instanceof Blob ? Buffer.from(await file.arrayBuffer()) : file;

        await fs.writeFile(uploadPath, buffer);

        // Convert path to URL
        const url = `/${key}`;

        return {
            url,
            key,
            provider: this.provider,
            size: buffer.length,
            contentType: options.contentType || 'application/octet-stream',
        };
    }

    async delete(key: string): Promise<boolean> {
        try {
            const filePath = path.join(this.baseDir, key);
            await fs.unlink(filePath);
            return true;
        } catch (error) {
            console.error('Local storage delete error:', error);
            return false;
        }
    }

    async getSignedUrl(key: string, _expiresInSeconds?: number): Promise<string> {
        // Local files in public folder are always accessible by URL
        return `/${key}`;
    }

    async list(folder: string): Promise<StorageFile[]> {
        const folderPath = path.join(this.baseDir, folder);
        try {
            const files = await fs.readdir(folderPath);
            const entries = await Promise.all(
                files.map(async (file) => {
                    const filePath = path.join(folderPath, file);
                    const stats = await fs.stat(filePath);
                    if (!stats.isFile()) return null;
                    return {
                        key: `${folder}/${file}`,
                        url: `/${folder}/${file}`,
                        name: file,
                        size: stats.size,
                        contentType: 'application/octet-stream',
                        lastModified: stats.mtime,
                    } satisfies StorageFile;
                }),
            );
            const storageFiles: StorageFile[] = entries.filter(
                (e): e is StorageFile => e !== null,
            );
            return storageFiles;
        } catch (error: unknown) {
             if (typeof error === 'object' && error !== null && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
                return [];
             }
             throw error;
        }
    }

    async exists(key: string): Promise<boolean> {
        try {
            const filePath = path.join(this.baseDir, key);
            await fs.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    private getExtension(contentType: string): string {
        const map: Record<string, string> = {
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'image/gif': '.gif',
            'image/svg+xml': '.svg',
            'video/mp4': '.mp4',
            'application/pdf': '.pdf',
        };
        return map[contentType] || '';
    }
}
