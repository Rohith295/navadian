import { NextRequest, NextResponse } from 'next/server';
import { getURL } from '@/lib/stripe';
import { requireProjectAdmin, signInstallState } from '@/lib/slack';

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('project_id');
  const accessToken = request.nextUrl.searchParams.get('access_token');

  if (!projectId || !accessToken) {
    return NextResponse.json({ error: 'Missing project_id or access_token' }, { status: 400 });
  }

  const userId = await requireProjectAdmin(accessToken, projectId);
  if (!userId) {
    return NextResponse.json({ error: 'Not authorized to connect Slack for this project' }, { status: 403 });
  }

  const state = signInstallState(projectId, userId);
  const redirectUri = `${getURL()}api/slack/oauth/callback`;

  const authorizeUrl = new URL('https://slack.com/oauth/v2/authorize');
  authorizeUrl.searchParams.set('client_id', process.env.SLACK_CLIENT_ID!);
  authorizeUrl.searchParams.set('scope', 'app_mentions:read,chat:write,users:read,files:read,channels:history');
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('state', state);

  return NextResponse.redirect(authorizeUrl.toString());
}
