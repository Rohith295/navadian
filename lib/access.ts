import { supabaseAdmin } from '@/lib/slack';

// Verifies a Supabase access token and confirms the user has team access to
// the task's project (owner, project_members, or a shared/team route),
// mirroring the same access model the task_* tables' RLS policies enforce.
export async function requireTaskAccess(accessToken: string | null, taskId: string) {
  if (!accessToken) return null;

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
  if (userError || !userData.user) return null;
  const userId = userData.user.id;

  const { data: task } = await supabaseAdmin
    .from('tasks')
    .select('id, column_id, columns!inner(project_id)')
    .eq('id', taskId)
    .maybeSingle();

  if (!task) return null;
  const projectId = (task as any).columns.project_id as string;

  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('user_id')
    .eq('id', projectId)
    .maybeSingle();

  if (project?.user_id === userId) return { userId, projectId };

  const { data: membership } = await supabaseAdmin
    .from('project_members')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle();

  return membership ? { userId, projectId } : null;
}
