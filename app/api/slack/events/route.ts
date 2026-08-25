import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getURL } from '@/lib/stripe';
import { supabaseAdmin, verifySlackSignature } from '@/lib/slack';

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-slack-signature');
  const timestamp = request.headers.get('x-slack-request-timestamp');

  if (!verifySlackSignature(rawBody, timestamp, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const payload = JSON.parse(rawBody);

  if (payload.type === 'url_verification') {
    return NextResponse.json({ challenge: payload.challenge });
  }

  if (payload.type === 'event_callback' && payload.event?.type === 'app_mention') {
    try {
      await handleAppMention(payload.event, payload.team_id);
    } catch (error) {
      console.error('Failed to handle Slack app_mention:', error);
    }
  }

  return NextResponse.json({ ok: true });
}

async function fetchSlackDisplayName(slackUserId: string, botToken: string): Promise<string | null> {
  if (!slackUserId) return null;
  try {
    const res = await fetch(`https://slack.com/api/users.info?user=${slackUserId}`, {
      headers: { Authorization: `Bearer ${botToken}` },
    });
    const data = await res.json();
    if (!data.ok) return null;
    return data.user?.profile?.display_name || data.user?.real_name || null;
  } catch {
    return null;
  }
}

async function handleAppMention(event: any, teamId: string) {
  const eventId = `${event.event_ts || event.ts}:${event.channel}`;
  const { error: dedupeError } = await supabaseAdmin
    .from('slack_processed_events')
    .insert({ slack_event_id: eventId });

  if (dedupeError) {
    return; // already processed (unique violation) or dedupe failed; skip either way
  }

  const { data: workspace } = await supabaseAdmin
    .from('slack_workspaces')
    .select('project_id, bot_access_token, installed_by')
    .eq('team_id', teamId)
    .maybeSingle();

  if (!workspace) {
    console.warn(`No slack_workspaces row for team_id ${teamId}`);
    return;
  }

  const { data: column } = await supabaseAdmin
    .from('columns')
    .select('id')
    .eq('project_id', workspace.project_id)
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!column) {
    console.warn(`Project ${workspace.project_id} has no columns to create a Request in`);
    return;
  }

  const { count } = await supabaseAdmin
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('column_id', column.id);

  const strippedText = (event.text || '').replace(/<@[A-Z0-9]+>/g, '').trim();
  const title = strippedText || `Slack request from Slack`;
  const requesterName = await fetchSlackDisplayName(event.user, workspace.bot_access_token);
  const description = requesterName ? `Requested via Slack by ${requesterName}` : 'Requested via Slack';

  const { data: task } = await supabaseAdmin
    .from('tasks')
    .insert({
      title,
      description,
      column_id: column.id,
      request_type: 'Other',
      priority: 'medium',
      position: count || 0,
      created_by: null,
    })
    .select('id')
    .single();

  if (!task) return;

  const attachedCount = workspace.installed_by
    ? await attachSlackFiles(event.files, task.id, workspace.bot_access_token, workspace.installed_by)
    : 0;

  const link = `${getURL()}dashboard/projects/${workspace.project_id}?task=${task.id}`;
  const attachmentNote = attachedCount > 0 ? ` (${attachedCount} file${attachedCount > 1 ? 's' : ''} attached)` : '';

  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${workspace.bot_access_token}`,
    },
    body: JSON.stringify({
      channel: event.channel,
      thread_ts: event.ts,
      text: `Created a Request: ${link}${attachmentNote}`,
    }),
  });
}

// Downloads any files Slack attached to the mention and stores them as Request
// attachments. Credited to whoever installed the Slack integration for this
// project, since the Slack requester isn't a navadian user.
async function attachSlackFiles(
  files: any[] | undefined,
  taskId: string,
  botToken: string,
  installedBy: string
): Promise<number> {
  if (!files || files.length === 0) return 0;

  let attached = 0;
  for (const file of files) {
    try {
      const fileRes = await fetch(file.url_private, {
        headers: { Authorization: `Bearer ${botToken}` },
      });
      if (!fileRes.ok) continue;

      const buffer = Buffer.from(await fileRes.arrayBuffer());
      const path = `${taskId}/${crypto.randomUUID()}-${file.name}`;

      const { error: uploadError } = await supabaseAdmin.storage
        .from('task-attachments')
        .upload(path, buffer, { contentType: file.mimetype });
      if (uploadError) continue;

      const { error: insertError } = await supabaseAdmin.from('task_attachments').insert({
        task_id: taskId,
        uploaded_by: installedBy,
        file_name: file.name,
        file_path: path,
        file_size: file.size,
        mime_type: file.mimetype || null,
      });
      if (!insertError) attached++;
    } catch (error) {
      console.error('Failed to attach Slack file:', error);
    }
  }
  return attached;
}
