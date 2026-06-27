import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { storageService } from '@/lib/storage/storage-service';
import { userStorageRepository } from '@/lib/db/repository/user-storage.repository';
import { GoogleDriveProvider } from '@/lib/storage/providers/google-drive-provider';

/**
 * POST /api/storage/upload
 * Upload file to storage (default provider or Google Drive)
 */
export async function POST(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const formData = await request.formData();
        const file = formData.get('file') as File;
        const folder = formData.get('folder') as string || 'uploads';
        const provider = formData.get('provider') as string || 'default';
        const storageId = formData.get('storageId') as string;

        if (!file) {
            return NextResponse.json({ error: 'File is required' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());

        // Upload to Google Drive if specified
        if (provider === 'google-drive' && storageId) {
            const storage = await userStorageRepository.findById(storageId);
            if (!storage) {
                return NextResponse.json({ error: 'Storage account not found' }, { status: 404 });
            }

            // Ownership check: previously any authenticated user could pass an
            // arbitrary storageId and use that account's decrypted Drive token.
            // Return 404 (not 403) to avoid id-enumeration.
            if (storage.userId?.toString() !== session.user.id) {
                return NextResponse.json({ error: 'Storage account not found' }, { status: 404 });
            }

            const accessToken = userStorageRepository.decryptToken(storage.accessTokenEncrypted);
            const driveProvider = new GoogleDriveProvider(accessToken);

            const result = await driveProvider.upload(buffer, {
                folder,
                filename: file.name,
                contentType: file.type,
            });

            return NextResponse.json({
                success: true,
                ...result,
            });
        }

        // Default: upload to S3/Wasabi
        const result = await storageService.upload(buffer, {
            folder,
            filename: file.name,
            contentType: file.type,
            isPublic: true,
        });

        return NextResponse.json({
            success: true,
            ...result,
        });
    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json(
            { error: (error instanceof Error ? error.message : String(error)) || 'Upload failed' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/storage/upload
 * Get storage providers for user
 */
export async function GET(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const brandId = searchParams.get('brandId');

        // Get connected storage accounts
        const storageAccounts = brandId
            ? await userStorageRepository.findByBrandId(brandId)
            : await userStorageRepository.findByUserId(session.user.id!);

        const providers = [
            {
                id: 'default',
                name: storageService.isUsingWasabi() ? 'Wasabi Cloud' : 'AWS S3',
                provider: storageService.isUsingWasabi() ? 'wasabi' : 'aws',
                isDefault: true,
            },
            ...storageAccounts.map(account => ({
                id: account._id.toString(),
                name: account.accountName || 'Google Drive',
                email: account.accountEmail,
                provider: account.provider,
                usedBytes: account.usedBytes,
                quotaBytes: account.quotaBytes,
                isDefault: false,
            })),
        ];

        return NextResponse.json({ providers });
    } catch (error) {
        console.error('Storage providers error:', error);
        return NextResponse.json({ error: 'Failed to get providers' }, { status: 500 });
    }
}

/**
 * DELETE /api/storage/upload
 * Delete a file from storage
 */
export async function DELETE(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const key = searchParams.get('key');
        const provider = searchParams.get('provider') || 'default';
        const storageId = searchParams.get('storageId');

        if (!key) {
            return NextResponse.json({ error: 'Key is required' }, { status: 400 });
        }

        if (provider === 'google-drive' && storageId) {
            const storage = await userStorageRepository.findById(storageId);
            // Ownership check before decrypting another user's tokens.
            if (storage && storage.userId?.toString() === session.user.id) {
                const accessToken = userStorageRepository.decryptToken(storage.accessTokenEncrypted);
                const driveProvider = new GoogleDriveProvider(accessToken);
                await driveProvider.delete(key);
            }
        } else {
            await storageService.delete(key);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Delete error:', error);
        return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
    }
}
