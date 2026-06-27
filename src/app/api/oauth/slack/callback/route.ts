import { NextRequest, NextResponse } from 'next/server';

/**
 * OAuth callback handler for Slack
 * Handles the OAuth redirect from Slack
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

    const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.SLACK_CLIENT_ID!,
        client_secret: process.env.SLACK_CLIENT_SECRET!,
        code,
        redirect_uri: `${process.env.NEXTAUTH_URL}/api/oauth/slack/callback`,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenData.ok || !tokenData.access_token) {
      return NextResponse.redirect(
        '/conversations/channels?error=token_exchange_failed'
      );
    }

    const redirectUrl = new URL('/conversations/channels', process.env.NEXTAUTH_URL!);
    redirectUrl.searchParams.set('channel', 'slack');
    redirectUrl.searchParams.set('access_token', tokenData.access_token);
    redirectUrl.searchParams.set('bot_token', tokenData.bot_user_id || '');
    redirectUrl.searchParams.set('team_id', tokenData.team?.id || '');
    redirectUrl.searchParams.set('team_name', tokenData.team?.name || '');

    return NextResponse.redirect(redirectUrl.toString());
  } catch (error: unknown) {
    console.error('Slack OAuth error:', error);
    return NextResponse.redirect(
      `/conversations/channels?error=${encodeURIComponent(error instanceof Error ? error.message : 'oauth_failed')}`
    );
  }
}
