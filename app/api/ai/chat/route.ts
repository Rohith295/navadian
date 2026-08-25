import { NextRequest } from 'next/server';
import { streamText, convertToModelMessages, type UIMessage } from 'ai';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { getModel } from '@/lib/ai';

// Every tool below runs through a Supabase client authenticated as the
// calling user (their JWT, not the service-role key) — RLS is the safety
// boundary, identical to every other query in the app. A tool literally
// cannot see or touch a project the user isn't a member of.
function scopedClient(accessToken: string) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export async function POST(request: NextRequest) {
  const accessToken = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!accessToken) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = scopedClient(accessToken);
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { messages }: { messages: UIMessage[] } = await request.json();
  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    model: getModel(),
    system:
      'You are the AI assistant inside navadian, a contract lifecycle management tool for legal teams. ' +
      'You can look up Requests (contracts/NDAs/MSAs) the user has access to, and propose creating or ' +
      'changing them. You never modify data directly — proposeCreateRequest/proposeReassignRequest/' +
      'proposeUpdateStatus only draft a proposal that the user must explicitly confirm in the UI.',
    messages: modelMessages,
    tools: {
      listRequests: {
        description: 'List Requests the user has access to, optionally filtered.',
        inputSchema: z.object({
          is_done: z.boolean().nullable().describe('Filter by completion status'),
          request_type: z.enum(['NDA', 'Contract', 'MSA', 'Other']).nullable(),
          priority: z.enum(['low', 'medium', 'high']).nullable(),
          assigned_to_me: z.boolean().nullable().describe('Only requests assigned to the current user'),
          overdue: z.boolean().nullable().describe('Only requests with a due_date in the past and not done'),
        }),
        execute: async (params: any) => {
          let query = supabase
            .from('tasks')
            .select('id, task_key, title, priority, request_type, due_date, is_done, columns:column_id(projects:project_id(name, slug))')
            .limit(25);

          if (params.is_done !== null && params.is_done !== undefined) query = query.eq('is_done', params.is_done);
          if (params.request_type) query = query.eq('request_type', params.request_type);
          if (params.priority) query = query.eq('priority', params.priority);
          if (params.assigned_to_me) query = query.eq('assigned_to', userId);
          if (params.overdue) query = query.lt('due_date', new Date().toISOString()).eq('is_done', false);

          const { data, error } = await query;
          if (error) return { error: error.message };
          return { requests: data };
        },
      },
      searchRequests: {
        description: 'Search Requests by title or description text.',
        inputSchema: z.object({ query: z.string() }),
        execute: async ({ query }: { query: string }) => {
          const { data, error } = await supabase
            .from('tasks')
            .select('id, task_key, title, priority, request_type, columns:column_id(projects:project_id(name, slug))')
            .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
            .limit(25);
          if (error) return { error: error.message };
          return { requests: data };
        },
      },
      getProjectSummary: {
        description: 'Get counts of Requests grouped by type, priority, and completion for a project (or all accessible projects if omitted).',
        inputSchema: z.object({ project_id: z.string().nullable() }),
        execute: async ({ project_id }: { project_id: string | null }) => {
          let query = supabase.from('tasks').select('request_type, priority, is_done, columns:column_id!inner(project_id)');
          if (project_id) query = query.eq('columns.project_id', project_id);

          const { data, error } = await query;
          if (error) return { error: error.message };

          const summary = { total: data.length, by_type: {} as Record<string, number>, by_priority: {} as Record<string, number>, done: 0 };
          for (const t of data as any[]) {
            summary.by_type[t.request_type] = (summary.by_type[t.request_type] || 0) + 1;
            summary.by_priority[t.priority] = (summary.by_priority[t.priority] || 0) + 1;
            if (t.is_done) summary.done++;
          }
          return summary;
        },
      },
      getRequestDetail: {
        description: 'Get full detail on one Request, including its comments and checklist.',
        inputSchema: z.object({ task_id: z.string() }),
        execute: async ({ task_id }: { task_id: string }) => {
          const { data: task, error } = await supabase.from('tasks').select('*').eq('id', task_id).maybeSingle();
          if (error || !task) return { error: 'Request not found or not accessible' };

          const { data: comments } = await supabase.from('task_comments').select('content, created_at').eq('task_id', task_id).order('created_at');
          const { data: checklist } = await supabase.from('task_checklist_items').select('content, is_done').eq('task_id', task_id);

          return { task, comments, checklist };
        },
      },
      proposeCreateRequest: {
        description:
          'Propose creating a new Request. This does NOT create it — it only drafts a proposal the user must confirm.',
        inputSchema: z.object({
          project_id: z.string(),
          title: z.string(),
          description: z.string().nullable(),
          request_type: z.enum(['NDA', 'Contract', 'MSA', 'Other']),
          priority: z.enum(['low', 'medium', 'high']),
        }),
        execute: async (params: any) => ({ proposal: true, action: 'create_request', ...params }),
      },
      proposeReassignRequest: {
        description: 'Propose reassigning a Request to a different team member. Requires user confirmation.',
        inputSchema: z.object({ task_id: z.string(), assignee_id: z.string(), assignee_name: z.string() }),
        execute: async (params: any) => ({ proposal: true, action: 'reassign_request', ...params }),
      },
      proposeUpdateStatus: {
        description: 'Propose moving a Request to a different column/status. Requires user confirmation.',
        inputSchema: z.object({ task_id: z.string(), column_id: z.string(), column_name: z.string() }),
        execute: async (params: any) => ({ proposal: true, action: 'update_status', ...params }),
      },
    },
  });

  return result.toUIMessageStreamResponse();
}
