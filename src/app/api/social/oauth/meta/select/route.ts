import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/get-session';
import { brandRepository } from '@/lib/db/repository/brand.repository';
import { socialAccountRepository } from '@/lib/db/repository/social-account.repository';
import {
  extractMetaAssets,
  getMetaOAuthCookieNames,
  MetaAccountsResponse,
  MetaOAuthPlatform,
} from '@/lib/social/meta-oauth';

function parsePlatform(value: unknown): MetaOAuthPlatform | null {
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

function clearMetaOAuthCookies(
  cookieStore: Awaited<Awaited<ReturnType<typeof cookies>>>,
  platform: MetaOAuthPlatform,
) {
  const names = getMetaOAuthCookieNames(platform);
  cookieStore.delete(names.state);
  cookieStore.delete(names.brandId);
  cookieStore.delete(names.userToken);
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();

  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const platform = parsePlatform(body.platform);
    const assetId = typeof body.assetId === 'string' ? body.assetId : null;

    if (!platform || !assetId) {
      return NextResponse.json({ error: 'Invalid selection payload' }, { status: 400 });
    }

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
    const asset = extractMetaAssets(platform, accountsResponse).find((candidate) => candidate.id === assetId);

    if (!asset) {
      return NextResponse.json({ error: 'Selected asset not found' }, { status: 404 });
    }

    const existingAccount = await socialAccountRepository.findByPlatformAccountId(platform, asset.id);
    if (existingAccount && existingAccount.brandId !== brandId) {
      return NextResponse.json(
        { error: `This ${platform} account is already connected to another brand` },
        { status: 409 },
      );
    }

    if (existingAccount) {
      await socialAccountRepository.update(
        existingAccount._id.toString(),
        {
          accessToken: asset.accessToken,
          avatarUrl: asset.avatarUrl,
          platformUsername: asset.username,
          platformDisplayName: asset.displayName,
          lastError: '',
        },
      );
    } else {
      await socialAccountRepository.create({
        brandId,
        platform,
        platformAccountId: asset.id,
        platformUsername: asset.username,
        platformDisplayName: asset.displayName,
        avatarUrl: asset.avatarUrl,
        accessToken: asset.accessToken,
        scopes: platform === 'facebook'
          ? ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts']
          : ['instagram_basic', 'instagram_content_publish', 'pages_show_list', 'pages_read_engagement'],
      });
    }

    clearMetaOAuthCookies(cookieStore, platform);

    return NextResponse.json({ connected: platform });
  } catch (error) {
    console.error('Meta OAuth selection error:', error);
    return NextResponse.json({ error: 'Failed to finalize account connection' }, { status: 500 });
  }
}
