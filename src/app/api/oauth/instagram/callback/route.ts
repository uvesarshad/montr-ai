import { NextRequest, NextResponse } from 'next/server';

/**
 * OAuth callback handler for Instagram
 * Handles the OAuth redirect from Facebook/Instagram
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

    const tokenResponse = await fetch('https://graph.facebook.com/v18.0/oauth/access_token', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.FACEBOOK_APP_ID,
        client_secret: process.env.FACEBOOK_APP_SECRET,
        redirect_uri: `${process.env.NEXTAUTH_URL}/api/oauth/instagram/callback`,
        code,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      return NextResponse.redirect(
        '/conversations/channels?error=token_exchange_failed'
      );
    }

    const accountsResponse = await fetch(
      `https://graph.facebook.com/v18.0/me/accounts?access_token=${tokenData.access_token}`
    );
    const accountsData = await accountsResponse.json();

    const redirectUrl = new URL('/conversations/channels', process.env.NEXTAUTH_URL!);
    redirectUrl.searchParams.set('channel', 'instagram');
    redirectUrl.searchParams.set('access_token', tokenData.access_token);
    redirectUrl.searchParams.set('accounts', JSON.stringify(accountsData.data || []));

    return NextResponse.redirect(redirectUrl.toString());
  } catch (error: unknown) {
    console.error('Instagram OAuth error:', error);
    return NextResponse.redirect(
      `/conversations/channels?error=${encodeURIComponent(error instanceof Error ? error.message : 'oauth_failed')}`
    );
  }
}
