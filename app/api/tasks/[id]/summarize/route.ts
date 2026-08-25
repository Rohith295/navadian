import { NextRequest, NextResponse } from 'next/server';
import { requireTaskAccess } from '@/lib/access';
import { supabaseAdmin } from '@/lib/slack';
import { summarizeThread } from '@/lib/ai';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const accessToken = request.headers.get('authorization')?.replace('Bearer ', '') || null;
  const taskId = params.id;

  const access = await requireTaskAccess(accessToken, taskId);
  if (!access) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  const { data: comments } = await supabaseAdmin
    .from('task_comments')
    .select('content, profiles:user_id(full_name, email)')
    .eq('task_id', taskId)
    .order('created_at');

  try {
    const summary = await summarizeThread({
      comments: (comments || []).map((c: any) => ({
        author: c.profiles?.full_name || c.profiles?.email || 'Unknown',
        content: c.content,
      })),
    });

    return NextResponse.json({ summary });
  } catch (error: any) {
    console.error('Error summarizing thread:', error);
    return NextResponse.json({ error: 'Failed to summarize thread' }, { status: 500 });
  }
}
