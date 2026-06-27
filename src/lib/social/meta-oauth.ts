export type MetaOAuthPlatform = 'facebook' | 'instagram';
export interface MetaOAuthCookieNames {
  state: string;
  brandId: string;
  userToken: string;
}

export interface MetaPagePicture {
  data?: {
    url?: string;
  };
}

export interface MetaInstagramBusinessAccount {
  id: string;
  username?: string;
  name?: string;
  profile_picture_url?: string;
}

export interface MetaPageAccount {
  id: string;
  name: string;
  access_token?: string;
  picture?: MetaPagePicture;
  instagram_business_account?: MetaInstagramBusinessAccount;
}

export interface MetaAccountsResponse {
  data?: MetaPageAccount[];
}

export interface MetaConnectableAsset {
  id: string;
  platform: MetaOAuthPlatform;
  displayName: string;
  username: string;
  avatarUrl?: string;
  accessToken: string;
  pageId: string;
  pageName: string;
}

function normalizeUsername(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

export function extractFacebookAssets(response: MetaAccountsResponse): MetaConnectableAsset[] {
  return (response.data || [])
    .filter((page) => Boolean(page.id && page.name && page.access_token))
    .map((page) => ({
      id: page.id,
      platform: 'facebook',
      displayName: page.name,
      username: normalizeUsername(page.name),
      avatarUrl: page.picture?.data?.url,
      accessToken: page.access_token as string,
      pageId: page.id,
      pageName: page.name,
    }));
}

export function extractInstagramAssets(response: MetaAccountsResponse): MetaConnectableAsset[] {
  return (response.data || [])
    .filter((page) => Boolean(page.access_token && page.instagram_business_account?.id))
    .map((page) => {
      const ig = page.instagram_business_account as MetaInstagramBusinessAccount;
      const displayName = ig.name || page.name;
      const username = ig.username || normalizeUsername(displayName);

      return {
        id: ig.id,
        platform: 'instagram',
        displayName,
        username,
        avatarUrl: ig.profile_picture_url,
        accessToken: page.access_token as string,
        pageId: page.id,
        pageName: page.name,
      };
    });
}

export function extractMetaAssets(
  platform: MetaOAuthPlatform,
  response: MetaAccountsResponse,
): MetaConnectableAsset[] {
  return platform === 'facebook'
    ? extractFacebookAssets(response)
    : extractInstagramAssets(response);
}

export function getMetaOAuthCookieNames(platform: MetaOAuthPlatform): MetaOAuthCookieNames {
  return {
    state: `${platform}_oauth_state`,
    brandId: `${platform}_oauth_brand_id`,
    userToken: `${platform}_oauth_user_token`,
  };
}
