import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAdmin, supabaseAdmin } from '@/lib/slack';

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('project_id');
  const accessToken = request.headers.get('authorization')?.replace('Bearer ', '') || null;

  if (!projectId) {
    return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });
  }

  const userId = await requireProjectAdmin(accessToken, projectId);
  if (!userId) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const { data: workspace } = await supabaseAdmin
    .from('slack_workspaces')
    .select('team_name, created_at')
    .eq('project_id', projectId)
    .maybeSingle();

  return NextResponse.json({
    connected: !!workspace,
    teamName: workspace?.team_name || null,
    connectedAt: workspace?.created_at || null,
  });
}

export async function DELETE(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('project_id');
  const accessToken = request.headers.get('authorization')?.replace('Bearer ', '') || null;

  if (!projectId) {
    return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });
  }

  const userId = await requireProjectAdmin(accessToken, projectId);
  if (!userId) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const { error } = await supabaseAdmin.from('slack_workspaces').delete().eq('project_id', projectId);
  if (error) {
    return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
