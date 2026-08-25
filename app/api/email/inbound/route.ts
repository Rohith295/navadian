import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getURL } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/slack';
import { refineIntakeRequest, suggestRequestFields } from '@/lib/ai';

interface PostmarkAttachment {
  Name: string;
  Content: string; // base64
  ContentType: string;
  ContentLength: number;
}

interface PostmarkInboundPayload {
  MessageID: string;
  Subject: string;
  TextBody: string;
  From: string;
  FromName: string;
  References?: string;
  Attachments?: PostmarkAttachment[];
}

export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token || token !== process.env.EMAIL_INBOUND_SECRET) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  const payload: PostmarkInboundPayload = await request.json();

  try {
    await handleInboundEmail(payload);
  } catch (error) {
    console.error('Failed to handle inbound email:', error);
  }

  return NextResponse.json({ ok: true });
}

async function handleInboundEmail(payload: PostmarkInboundPayload) {
  const { error: dedupeError } = await supabaseAdmin
    .from('email_processed_messages')
    .insert({ message_id: payload.MessageID });

  if (dedupeError) return; // already processed or dedupe failed; skip either way

  // A reply to an existing Request's thread — add as a comment, not a new Request.
  if (payload.References) {
    const referencedIds = payload.References.split(/\s+/);
    const { data: thread } = await supabaseAdmin
      .from('task_email_threads')
      .select('task_id')
      .in('message_id', referencedIds)
      .maybeSingle();

    if (thread) {
      const { data: settings } = await supabaseAdmin
        .from('email_intake_settings')
        .select('installed_by')
        .limit(1)
        .maybeSingle();

      if (settings?.installed_by) {
        await supabaseAdmin.from('task_comments').insert({
          task_id: thread.task_id,
          user_id: settings.installed_by,
          content: `${payload.FromName || payload.From} (email): ${payload.TextBody}`,
        });
      }
      return;
    }
  }

  const { data: settings } = await supabaseAdmin
    .from('email_intake_settings')
    .select('project_id, installed_by')
    .limit(1)
    .maybeSingle();

  if (!settings) {
    console.warn('Received inbound email but no email_intake_settings configured');
    return;
  }

  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('slug')
    .eq('id', settings.project_id)
    .maybeSingle();

  const { data: column } = await supabaseAdmin
    .from('columns')
    .select('id')
    .eq('project_id', settings.project_id)
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!column || !project) {
    console.warn(`Project ${settings.project_id} has no columns to create a Request in`);
    return;
  }

  const { count } = await supabaseAdmin
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('column_id', column.id);

  const rawText = `${payload.Subject}\n\n${payload.TextBody}`.trim();
  const requesterName = payload.FromName || payload.From || null;

  let title = payload.Subject || 'Email request';
  let description = requesterName ? `Requested via email by ${requesterName}` : 'Requested via email';
  let requestType: 'NDA' | 'Contract' | 'MSA' | 'Other' = 'Other';
  let priority: 'low' | 'medium' | 'high' = 'medium';

  try {
    const refined = await refineIntakeRequest({ rawText, requesterName, channel: 'email' });
    title = refined.title;
    description = refined.description;

    const suggestion = await suggestRequestFields({ title, description, teamMembers: [] });
    requestType = suggestion.request_type;
    priority = suggestion.priority;
  } catch (error) {
    console.error('AI processing failed for inbound email, using raw text/defaults:', error);
  }

  const { data: task } = await supabaseAdmin
    .from('tasks')
    .insert({
      title,
      description,
      source_text: rawText,
      source_channel: 'email',
      column_id: column.id,
      request_type: requestType,
      priority,
      position: count || 0,
      created_by: null,
    })
    .select('id, task_key')
    .single();

  if (!task) return;

  await supabaseAdmin.from('task_email_threads').insert({
    task_id: task.id,
    message_id: payload.MessageID,
  });

  if (settings.installed_by) {
    await attachEmailFiles(payload.Attachments, task.id, settings.installed_by);
  }

  const link = `${getURL()}dashboard/projects/${project.slug}?task=${task.task_key}`;

  if (process.env.POSTMARK_SERVER_TOKEN) {
    await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': process.env.POSTMARK_SERVER_TOKEN,
      },
      body: JSON.stringify({
        From: process.env.EMAIL_INBOUND_ADDRESS,
        To: payload.From,
        Subject: `Re: ${payload.Subject}`,
        TextBody: `Created a Request: ${link}`,
        MessageStream: 'outbound',
      }),
    });
  }
}

// Decodes any files attached to the inbound email and stores them as Request
// attachments. Credited to whoever set up email intake, since the sender
// isn't a navadian user — same choice as Slack attachment attribution.
async function attachEmailFiles(attachments: PostmarkAttachment[] | undefined, taskId: string, installedBy: string) {
  if (!attachments || attachments.length === 0) return;

  for (const attachment of attachments) {
    try {
      const buffer = Buffer.from(attachment.Content, 'base64');
      const path = `${taskId}/${crypto.randomUUID()}-${attachment.Name}`;

      const { error: uploadError } = await supabaseAdmin.storage
        .from('task-attachments')
        .upload(path, buffer, { contentType: attachment.ContentType });
      if (uploadError) continue;

      await supabaseAdmin.from('task_attachments').insert({
        task_id: taskId,
        uploaded_by: installedBy,
        file_name: attachment.Name,
        file_path: path,
        file_size: attachment.ContentLength,
        mime_type: attachment.ContentType || null,
      });
    } catch (error) {
      console.error('Failed to attach email file:', error);
    }
  }
}
