import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getURL } from '@/lib/stripe';
import { supabaseAdmin, verifySlackSignature } from '@/lib/slack';
import { suggestRequestFields, refineIntakeRequest, classifyThreadReply } from '@/lib/ai';

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

  if (
    payload.type === 'event_callback' &&
    payload.event?.type === 'message' &&
    payload.event.thread_ts &&
    !payload.event.bot_id
  ) {
    try {
      await handleThreadReply(payload.event, payload.team_id);
    } catch (error) {
      console.error('Failed to handle Slack thread reply:', error);
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
    .select('project_id, bot_access_token, installed_by, projects:project_id(slug)')
    .eq('team_id', teamId)
    .maybeSingle();

  if (!workspace) {
    console.warn(`No slack_workspaces row for team_id ${teamId}`);
    return;
  }

  // Mentioning the bot again inside an already-tracked thread (e.g. "@Navadian
  // assign this to Priya") is a follow-up, not a new request — without this
  // check every such reply would silently create a duplicate Request.
  if (event.thread_ts) {
    const { data: existingThread } = await supabaseAdmin
      .from('task_slack_threads')
      .select('task_id')
      .eq('channel', event.channel)
      .eq('thread_ts', event.thread_ts)
      .maybeSingle();

    if (existingThread) {
      const strippedFollowUp = (event.text || '').replace(/<@[A-Z0-9]+>/g, '').trim();
      if (strippedFollowUp && workspace.installed_by) {
        await handleThreadFollowUp({
          taskId: existingThread.task_id,
          text: strippedFollowUp,
          slackUserId: event.user,
          installedBy: workspace.installed_by,
          botAccessToken: workspace.bot_access_token,
          channel: event.channel,
          threadTs: event.thread_ts,
        });
      }
      return;
    }
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
  const requesterName = await fetchSlackDisplayName(event.user, workspace.bot_access_token);

  // Best-effort AI cleanup + classification — falls back to the raw text
  // and safe defaults if the configured model is unreachable, never blocks
  // Request creation. The raw message is always kept in source_text either way.
  let title = strippedText || 'Slack request from Slack';
  let description = requesterName ? `Requested via Slack by ${requesterName}` : 'Requested via Slack';
  let requestType: 'NDA' | 'Contract' | 'MSA' | 'Other' = 'Other';
  let priority: 'low' | 'medium' | 'high' = 'medium';

  try {
    if (strippedText) {
      const refined = await refineIntakeRequest({ rawText: strippedText, requesterName, channel: 'slack' });
      title = refined.title;
      description = refined.description;
    }
    const suggestion = await suggestRequestFields({ title, description, teamMembers: [] });
    requestType = suggestion.request_type;
    priority = suggestion.priority;
  } catch (error) {
    console.error('AI processing failed for Slack request, using raw text/defaults:', error);
  }

  const { data: task } = await supabaseAdmin
    .from('tasks')
    .insert({
      title,
      description,
      source_text: strippedText || null,
      source_channel: 'slack',
      column_id: column.id,
      request_type: requestType,
      priority,
      position: count || 0,
      created_by: null,
    })
    .select('id, task_key')
    .single();

  if (!task) return;

  await supabaseAdmin.from('task_slack_threads').insert({
    task_id: task.id,
    team_id: teamId,
    channel: event.channel,
    thread_ts: event.ts,
  });

  const attachedCount = workspace.installed_by
    ? await attachSlackFiles(event.files, task.id, workspace.bot_access_token, workspace.installed_by)
    : 0;

  const projectSlug = (workspace as any).projects?.slug || workspace.project_id;
  const link = `${getURL()}dashboard/projects/${projectSlug}?task=${task.task_key}`;
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

// Syncs a reply in a Slack thread we created a Request from into that
// Request's comments, so context discussed in Slack isn't lost.
async function handleThreadReply(event: any, teamId: string) {
  // Same dedupe key as handleAppMention's — a message that mentions the bot
  // fires both an app_mention AND a plain message event for the identical
  // underlying message, so they must share one identity to avoid double-processing.
  const eventId = `${event.event_ts || event.ts}:${event.channel}`;
  const { error: dedupeError } = await supabaseAdmin
    .from('slack_processed_events')
    .insert({ slack_event_id: eventId });

  if (dedupeError) return;

  const { data: thread } = await supabaseAdmin
    .from('task_slack_threads')
    .select('task_id')
    .eq('channel', event.channel)
    .eq('thread_ts', event.thread_ts)
    .maybeSingle();

  if (!thread) return; // not a thread we're tracking

  const { data: workspace } = await supabaseAdmin
    .from('slack_workspaces')
    .select('bot_access_token, installed_by')
    .eq('team_id', teamId)
    .maybeSingle();

  if (!workspace || !workspace.installed_by || !event.text) return;

  await handleThreadFollowUp({
    taskId: thread.task_id,
    text: event.text,
    slackUserId: event.user,
    installedBy: workspace.installed_by,
    botAccessToken: workspace.bot_access_token,
    channel: event.channel,
    threadTs: event.thread_ts,
  });
}

// Logs a thread reply as a comment (always, for the audit trail), then asks
// the model whether it's actually requesting a concrete change (reassign,
// change priority/type). If so, drafts a pending task_ai_suggestions row —
// same table/UI as the "Get AI Suggestion" button — rather than applying it
// directly, matching the confirm-first pattern used everywhere else here.
async function handleThreadFollowUp({
  taskId,
  text,
  slackUserId,
  installedBy,
  botAccessToken,
  channel,
  threadTs,
}: {
  taskId: string;
  text: string;
  slackUserId: string;
  installedBy: string;
  botAccessToken: string;
  channel: string;
  threadTs: string;
}) {
  const replierName = (await fetchSlackDisplayName(slackUserId, botAccessToken)) || 'Someone';

  await supabaseAdmin.from('task_comments').insert({
    task_id: taskId,
    user_id: installedBy,
    content: `${replierName} (Slack): ${text}`,
  });

  const { data: task } = await supabaseAdmin
    .from('tasks')
    .select('task_key, columns:column_id(project_id, projects:project_id(slug))')
    .eq('id', taskId)
    .maybeSingle();

  const projectId = (task as any)?.columns?.project_id;
  if (!task || !projectId) return;

  const { data: members } = await supabaseAdmin
    .from('project_members')
    .select('user_id, profiles:user_id(full_name, email)')
    .eq('project_id', projectId);

  const teamMembers = (members || []).map((m: any) => ({
    id: m.user_id,
    name: m.profiles?.full_name || m.profiles?.email || m.user_id,
  }));

  try {
    const intent = await classifyThreadReply({ text, teamMembers });
    if (!intent.is_actionable) return;

    const hasChange = intent.suggested_assignee_id || intent.suggested_priority || intent.suggested_request_type;

    if (!hasChange) {
      // Actionable request, but nothing could be resolved (e.g. no matching
      // team member) — the model writes its own explanation (who's actually
      // available, etc.) in reply_message rather than us templating one.
      if (intent.reply_message) {
        await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${botAccessToken}` },
          body: JSON.stringify({ channel, thread_ts: threadTs, text: intent.reply_message }),
        });
      }
      return;
    }

    const modelId = process.env.AI_MODEL || (process.env.AI_PROVIDER === 'openai' ? 'gpt-4o' : 'claude-sonnet-5');

    await supabaseAdmin.from('task_ai_suggestions').insert({
      task_id: taskId,
      request_type: intent.suggested_request_type,
      priority: intent.suggested_priority,
      suggested_assignee: intent.suggested_assignee_id,
      rationale: intent.rationale,
      model: modelId,
    });

    const projectSlug = (task as any).columns?.projects?.slug;
    const link = `${getURL()}dashboard/projects/${projectSlug}?task=${task.task_key}`;
    const message = intent.reply_message ? `${intent.reply_message} ${link}` : `Drafted that change — review and confirm here: ${link}`;

    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${botAccessToken}` },
      body: JSON.stringify({ channel, thread_ts: threadTs, text: message }),
    });
  } catch (error) {
    console.error('Failed to classify thread reply:', error);
  }
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
