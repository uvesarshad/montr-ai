import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';
import { userStorageRepository } from '@/lib/db/repository/user-storage.repository';
import { GoogleDriveProvider } from '@/lib/storage/providers/google-drive-provider';
import {
    filterImportableStorageFiles,
    getBrandMediaStorageFolder,
} from '@/lib/social/media-library';

export async function GET(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const brandId = searchParams.get('brandId');
        const storageId = searchParams.get('storageId');
        const brandHandle = searchParams.get('brandHandle') || undefined;

        if (!brandId || !storageId) {
            return NextResponse.json(
                { error: 'brandId and storageId are required' },
                { status: 400 },
            );
        }

        const storage = await userStorageRepository.findById(storageId);
        if (!storage || storage.userId !== session.user.id! || storage.brandId !== brandId) {
            return NextResponse.json({ error: 'Storage account not found' }, { status: 404 });
        }

        if (storage.provider !== 'google-drive') {
            return NextResponse.json({ error: 'Unsupported storage provider' }, { status: 400 });
        }

        const accessToken = userStorageRepository.decryptToken(storage.accessTokenEncrypted);
        if (!accessToken) {
            return NextResponse.json({ error: 'Storage token unavailable' }, { status: 400 });
        }

        const driveProvider = new GoogleDriveProvider(accessToken);
        const files = await driveProvider.list(
            getBrandMediaStorageFolder({ brandId, brandHandle }),
        );

        return NextResponse.json({
            files: filterImportableStorageFiles(files),
        });
    } catch (error) {
        console.error('Storage file listing error:', error);
        return NextResponse.json(
            { error: 'Failed to list storage files' },
            { status: 500 },
        );
    }
}
