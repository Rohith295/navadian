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

  const { data: settings } = await supabaseAdmin
    .from('email_intake_settings')
    .select('inbound_address')
    .eq('project_id', projectId)
    .maybeSingle();

  return NextResponse.json({
    connected: !!settings,
    inboundAddress: settings?.inbound_address || null,
  });
}

export async function POST(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get('project_id');
  const accessToken = request.headers.get('authorization')?.replace('Bearer ', '') || null;

  if (!projectId) {
    return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });
  }

  const userId = await requireProjectAdmin(accessToken, projectId);
  if (!userId) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  if (!process.env.EMAIL_INBOUND_ADDRESS) {
    return NextResponse.json({ error: 'EMAIL_INBOUND_ADDRESS is not configured' }, { status: 500 });
  }

  // Single-tenant deployment — at most one active row, so replace rather than append.
  await supabaseAdmin.from('email_intake_settings').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  const { error } = await supabaseAdmin.from('email_intake_settings').insert({
    project_id: projectId,
    inbound_address: process.env.EMAIL_INBOUND_ADDRESS,
    installed_by: userId,
  });

  if (error) {
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, inboundAddress: process.env.EMAIL_INBOUND_ADDRESS });
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

  const { error } = await supabaseAdmin.from('email_intake_settings').delete().eq('project_id', projectId);
  if (error) {
    return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
