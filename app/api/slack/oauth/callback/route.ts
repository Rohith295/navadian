import { NextRequest, NextResponse } from 'next/server';
import { getURL } from '@/lib/stripe';
import { supabaseAdmin, verifyInstallState } from '@/lib/slack';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const siteUrl = getURL();

  if (!code || !state) {
    return NextResponse.redirect(`${siteUrl}dashboard/integrations?slack_error=missing_params`);
  }

  const parsedState = verifyInstallState(state);
  if (!parsedState) {
    return NextResponse.redirect(`${siteUrl}dashboard/integrations?slack_error=invalid_state`);
  }

  const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.SLACK_CLIENT_ID!,
      client_secret: process.env.SLACK_CLIENT_SECRET!,
      code,
      redirect_uri: `${siteUrl}api/slack/oauth/callback`,
    }),
  });

  const tokenData = await tokenResponse.json();

  if (!tokenData.ok) {
    console.error('Slack OAuth exchange failed:', tokenData.error);
    return NextResponse.redirect(`${siteUrl}dashboard/integrations?slack_error=oauth_failed`);
  }

  const { error } = await supabaseAdmin.from('slack_workspaces').upsert(
    {
      team_id: tokenData.team.id,
      team_name: tokenData.team.name,
      bot_access_token: tokenData.access_token,
      project_id: parsedState.projectId,
      installed_by: parsedState.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'team_id' }
  );

  if (error) {
    console.error('Failed to store Slack workspace:', error);
    return NextResponse.redirect(`${siteUrl}dashboard/integrations?slack_error=save_failed`);
  }

  return NextResponse.redirect(`${siteUrl}dashboard/integrations?slack_connected=1`);
}
