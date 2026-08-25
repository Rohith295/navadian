import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const STATE_TTL_MS = 10 * 60 * 1000;

// Signed, tamper-proof state param carrying which project + user initiated the
// OAuth install, so the callback doesn't need a session cookie to trust it.
export function signInstallState(projectId: string, userId: string) {
  const payload = JSON.stringify({ projectId, userId, ts: Date.now() });
  const encoded = Buffer.from(payload).toString('base64url');
  const signature = crypto
    .createHmac('sha256', process.env.SLACK_SIGNING_SECRET!)
    .update(encoded)
    .digest('hex');
  return `${encoded}.${signature}`;
}

export function verifyInstallState(state: string): { projectId: string; userId: string } | null {
  const [encoded, signature] = state.split('.');
  if (!encoded || !signature) return null;

  const expected = crypto
    .createHmac('sha256', process.env.SLACK_SIGNING_SECRET!)
    .update(encoded)
    .digest('hex');

  const expectedBuf = Buffer.from(expected);
  const gotBuf = Buffer.from(signature);
  if (expectedBuf.length !== gotBuf.length || !crypto.timingSafeEqual(new Uint8Array(expectedBuf), new Uint8Array(gotBuf))) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8'));
    if (Date.now() - payload.ts > STATE_TTL_MS) return null;
    return { projectId: payload.projectId, userId: payload.userId };
  } catch {
    return null;
  }
}

export function verifySlackSignature(rawBody: string, timestamp: string | null, signature: string | null) {
  if (!timestamp || !signature) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 60 * 5) return false;

  const baseString = `v0:${timestamp}:${rawBody}`;
  const expected =
    'v0=' +
    crypto.createHmac('sha256', process.env.SLACK_SIGNING_SECRET!).update(baseString).digest('hex');

  const expectedBuf = Buffer.from(expected);
  const gotBuf = Buffer.from(signature);
  return expectedBuf.length === gotBuf.length && crypto.timingSafeEqual(new Uint8Array(expectedBuf), new Uint8Array(gotBuf));
}

// Verifies a Supabase access token (sent as a Bearer header by the client)
// and confirms the user is the project's owner or an admin/owner project_member.
export async function requireProjectAdmin(accessToken: string | null, projectId: string) {
  if (!accessToken) {
    console.error('requireProjectAdmin: no accessToken provided');
    return null;
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
  if (userError || !userData.user) {
    console.error('requireProjectAdmin: getUser failed', userError?.message);
    return null;
  }
  const userId = userData.user.id;

  const { data: project, error: projectError } = await supabaseAdmin
    .from('projects')
    .select('id, user_id')
    .eq('id', projectId)
    .maybeSingle();

  if (projectError) console.error('requireProjectAdmin: project lookup error', projectError.message);
  if (project?.user_id === userId) return userId;

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('project_members')
    .select('role')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .in('role', ['owner', 'admin'])
    .maybeSingle();

  if (membershipError) console.error('requireProjectAdmin: membership lookup error', membershipError.message);
  console.error('requireProjectAdmin result', { userId, projectId, projectOwner: project?.user_id, membership });

  return membership ? userId : null;
}
