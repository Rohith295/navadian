import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/slack';

export async function GET(request: NextRequest) {
  const projectSlug = request.nextUrl.searchParams.get('project_id');
  const accessToken = request.nextUrl.searchParams.get('access_token');

  if (!projectSlug || !accessToken) {
    return NextResponse.json({ error: 'Missing project_id or access_token' }, { status: 400 });
  }

  const { data: userData } = await supabaseAdmin.auth.getUser(accessToken);
  if (!userData.user) {
    return NextResponse.json({ found: false });
  }
  const userId = userData.user.id;

  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('id, name, user_id')
    .eq('slug', projectSlug)
    .maybeSingle();

  if (!project) {
    return NextResponse.json({ found: false });
  }

  let hasAccess = project.user_id === userId;
  if (!hasAccess) {
    const { data: membership } = await supabaseAdmin
      .from('project_members')
      .select('id')
      .eq('project_id', project.id)
      .eq('user_id', userId)
      .maybeSingle();
    hasAccess = !!membership;
  }

  let requestStatus: 'none' | 'pending' | 'denied' = 'none';
  if (!hasAccess) {
    const { data: accessRequest } = await supabaseAdmin
      .from('project_access_requests')
      .select('status')
      .eq('project_id', project.id)
      .eq('requested_by', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (accessRequest?.status === 'pending') requestStatus = 'pending';
    else if (accessRequest?.status === 'denied') requestStatus = 'denied';
  }

  return NextResponse.json({
    found: true,
    projectName: project.name,
    projectDbId: project.id,
    hasAccess,
    requestStatus,
  });
}
