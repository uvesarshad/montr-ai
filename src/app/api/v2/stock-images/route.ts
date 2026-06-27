import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/get-session';

interface StockImageResult {
    id: string;
    url: string;
    thumbnailUrl: string;
    alt: string;
    source: 'unsplash' | 'pexels' | 'pixabay';
    author: string;
    downloadUrl: string;
}

// Unsplash API
async function searchUnsplash(query: string, page: number = 1): Promise<StockImageResult[]> {
    const accessKey = process.env.UNSPLASH_ACCESS_KEY;
    if (!accessKey) {
        console.warn('UNSPLASH_ACCESS_KEY not configured');
        return [];
    }

    try {
        const response = await fetch(
            `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&page=${page}&per_page=20`,
            {
                headers: {
                    Authorization: `Client-ID ${accessKey}`,
                },
            }
        );

        if (!response.ok) {
            console.error('Unsplash API error:', response.status);
            return [];
        }

        const data = await response.json() as { results: Array<{ id: string; urls: { regular: string; small: string }; alt_description?: string; description?: string; user: { name: string }; links: { download: string } }> };
        return data.results.map((photo) => ({
            id: `unsplash-${photo.id}`,
            url: photo.urls.regular,
            thumbnailUrl: photo.urls.small,
            alt: photo.alt_description || photo.description || 'Unsplash image',
            source: 'unsplash' as const,
            author: photo.user.name,
            downloadUrl: photo.links.download,
        }));
    } catch (error) {
        console.error('Unsplash search error:', error);
        return [];
    }
}

// Pexels API
async function searchPexels(query: string, page: number = 1): Promise<StockImageResult[]> {
    const apiKey = process.env.PEXELS_API_KEY;
    if (!apiKey) {
        console.warn('PEXELS_API_KEY not configured');
        return [];
    }

    try {
        const response = await fetch(
            `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&page=${page}&per_page=20`,
            {
                headers: {
                    Authorization: apiKey,
                },
            }
        );

        if (!response.ok) {
            console.error('Pexels API error:', response.status);
            return [];
        }

        const data = await response.json() as { photos: Array<{ id: string; src: { large: string; medium: string; original: string }; alt?: string; photographer: string }> };
        return data.photos.map((photo) => ({
            id: `pexels-${photo.id}`,
            url: photo.src.large,
            thumbnailUrl: photo.src.medium,
            alt: photo.alt || 'Pexels image',
            source: 'pexels' as const,
            author: photo.photographer,
            downloadUrl: photo.src.original,
        }));
    } catch (error) {
        console.error('Pexels search error:', error);
        return [];
    }
}

// Pixabay API
async function searchPixabay(query: string, page: number = 1): Promise<StockImageResult[]> {
    const apiKey = process.env.PIXABAY_API_KEY;
    if (!apiKey) {
        console.warn('PIXABAY_API_KEY not configured');
        return [];
    }

    try {
        const response = await fetch(
            `https://pixabay.com/api/?key=${apiKey}&q=${encodeURIComponent(query)}&page=${page}&per_page=20&image_type=photo`
        );

        if (!response.ok) {
            console.error('Pixabay API error:', response.status);
            return [];
        }

        const data = await response.json() as { hits: Array<{ id: string; largeImageURL: string; webformatURL: string; tags?: string; user: string }> };
        return data.hits.map((photo) => ({
            id: `pixabay-${photo.id}`,
            url: photo.largeImageURL,
            thumbnailUrl: photo.webformatURL,
            alt: photo.tags || 'Pixabay image',
            source: 'pixabay' as const,
            author: photo.user,
            downloadUrl: photo.largeImageURL,
        }));
    } catch (error) {
        console.error('Pixabay search error:', error);
        return [];
    }
}

export async function GET(request: NextRequest) {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query');
    const source = searchParams.get('source') || 'all'; // 'unsplash' | 'pexels' | 'pixabay' | 'all'
    const page = parseInt(searchParams.get('page') || '1', 10);

    if (!query) {
        return NextResponse.json({ error: 'Query parameter is required' }, { status: 400 });
    }

    let results: StockImageResult[] = [];

    try {
        if (source === 'all') {
            // Fetch from all sources in parallel
            const [unsplashResults, pexelsResults, pixabayResults] = await Promise.all([
                searchUnsplash(query, page),
                searchPexels(query, page),
                searchPixabay(query, page),
            ]);

            // Interleave results from different sources
            const maxLength = Math.max(
                unsplashResults.length,
                pexelsResults.length,
                pixabayResults.length
            );

            for (let i = 0; i < maxLength; i++) {
                if (i < unsplashResults.length) results.push(unsplashResults[i]);
                if (i < pexelsResults.length) results.push(pexelsResults[i]);
                if (i < pixabayResults.length) results.push(pixabayResults[i]);
            }
        } else if (source === 'unsplash') {
            results = await searchUnsplash(query, page);
        } else if (source === 'pexels') {
            results = await searchPexels(query, page);
        } else if (source === 'pixabay') {
            results = await searchPixabay(query, page);
        }

        return NextResponse.json({
            results,
            query,
            source,
            page,
            hasMore: results.length >= 20,
        });
    } catch (error) {
        console.error('Stock image search error:', error);
        return NextResponse.json(
            { error: 'Failed to search stock images' },
            { status: 500 }
        );
    }
}
