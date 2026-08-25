import { NextRequest, NextResponse } from 'next/server';
import { requireTaskAccess } from '@/lib/access';
import { supabaseAdmin } from '@/lib/slack';
import { suggestRequestFields } from '@/lib/ai';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const accessToken = request.headers.get('authorization')?.replace('Bearer ', '') || null;
  const taskId = params.id;

  const access = await requireTaskAccess(accessToken, taskId);
  if (!access) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const { data: task } = await supabaseAdmin
    .from('tasks')
    .select('title, description')
    .eq('id', taskId)
    .maybeSingle();

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  const { data: members } = await supabaseAdmin
    .from('project_members')
    .select('user_id, profiles:user_id(full_name, email)')
    .eq('project_id', access.projectId);

  const teamMembers = (members || []).map((m: any) => ({
    id: m.user_id,
    name: m.profiles?.full_name || m.profiles?.email || m.user_id,
  }));

  try {
    const suggestion = await suggestRequestFields({
      title: task.title,
      description: task.description,
      teamMembers,
    });

    const modelId = process.env.AI_MODEL || (process.env.AI_PROVIDER === 'openai' ? 'gpt-4o' : 'claude-sonnet-5');

    const { data: row, error } = await supabaseAdmin
      .from('task_ai_suggestions')
      .insert({
        task_id: taskId,
        request_type: suggestion.request_type,
        priority: suggestion.priority,
        suggested_assignee: suggestion.suggested_assignee_id,
        rationale: suggestion.rationale,
        model: modelId,
      })
      .select('*')
      .single();

    if (error) throw error;

    return NextResponse.json(row);
  } catch (error: any) {
    console.error('Error generating AI suggestion:', error);
    return NextResponse.json({ error: 'Failed to generate suggestion' }, { status: 500 });
  }
}
