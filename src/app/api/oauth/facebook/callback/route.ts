import { NextRequest, NextResponse } from 'next/server';

/**
 * OAuth callback handler for Facebook Messenger
 * Handles the OAuth redirect from Facebook
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      return NextResponse.redirect(
        `/conversations/channels?error=${encodeURIComponent(error)}`
      );
    }

    if (!code) {
      return NextResponse.redirect(
        '/conversations/channels?error=no_code'
      );
    }

    const tokenUrl = new URL('https://graph.facebook.com/v18.0/oauth/access_token');
    tokenUrl.searchParams.set('client_id', process.env.FACEBOOK_APP_ID!);
    tokenUrl.searchParams.set('client_secret', process.env.FACEBOOK_APP_SECRET!);
    tokenUrl.searchParams.set('redirect_uri', `${process.env.NEXTAUTH_URL}/api/oauth/facebook/callback`);
    tokenUrl.searchParams.set('code', code);

    const tokenResponse = await fetch(tokenUrl.toString());
    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      return NextResponse.redirect(
        '/conversations/channels?error=token_exchange_failed'
      );
    }

    const pagesResponse = await fetch(
      `https://graph.facebook.com/v18.0/me/accounts?access_token=${tokenData.access_token}`
    );
    const pagesData = await pagesResponse.json();

    const redirectUrl = new URL('/conversations/channels', process.env.NEXTAUTH_URL!);
    redirectUrl.searchParams.set('channel', 'facebook');
    redirectUrl.searchParams.set('access_token', tokenData.access_token);
    redirectUrl.searchParams.set('pages', JSON.stringify(pagesData.data || []));

    return NextResponse.redirect(redirectUrl.toString());
  } catch (error: unknown) {
    console.error('Facebook OAuth error:', error);
    return NextResponse.redirect(
      `/conversations/channels?error=${encodeURIComponent(error instanceof Error ? error.message : 'oauth_failed')}`
    );
  }
}
