import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/get-session';
import { brandRepository } from '@/lib/db/repository/brand.repository';
import {
  extractMetaAssets,
  getMetaOAuthCookieNames,
  MetaAccountsResponse,
  MetaOAuthPlatform,
} from '@/lib/social/meta-oauth';

function parsePlatform(value: string | null): MetaOAuthPlatform | null {
  return value === 'facebook' || value === 'instagram' ? value : null;
}

async function fetchMetaAccounts(userAccessToken: string): Promise<MetaAccountsResponse> {
  const url = new URL('https://graph.facebook.com/v18.0/me/accounts');
  url.searchParams.set(
    'fields',
    'id,name,picture{url},access_token,instagram_business_account{id,username,name,profile_picture_url}',
  );
  url.searchParams.set('access_token', userAccessToken);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Meta asset fetch failed: ${await response.text()}`);
  }

  return response.json();
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const platform = parsePlatform(new URL(request.url).searchParams.get('platform'));
    if (!platform) {
      return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
    }

    const cookieStore = await cookies();
    const cookieNames = getMetaOAuthCookieNames(platform);
    const brandId = cookieStore.get(cookieNames.brandId)?.value;
    const userAccessToken = cookieStore.get(cookieNames.userToken)?.value;

    if (!brandId || !userAccessToken) {
      return NextResponse.json({ error: 'Missing OAuth session data' }, { status: 400 });
    }

    const brand = await brandRepository.findById(brandId);
    if (!brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
    }

    const hasAccess = brand.userId === session.user.id! ||
      (brand.userId && brand.userId === session.user.id);

    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const accountsResponse = await fetchMetaAccounts(userAccessToken);
    const assets = extractMetaAssets(platform, accountsResponse).map(({ accessToken: _accessToken, ...asset }) => asset);

    return NextResponse.json({ assets });
  } catch (error) {
    console.error('Meta OAuth assets error:', error);
    return NextResponse.json({ error: 'Failed to fetch connectable assets' }, { status: 500 });
  }
}
