import { generateObject, generateText, stepCountIs } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai, createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/slack';

// Every call site asks for "the configured model" — never imports a provider
// directly. Switching AI_PROVIDER/AI_MODEL is a config change, not a rewrite.
//
// AI_PROVIDER=custom points at any OpenAI-compatible endpoint (AI_BASE_URL +
// AI_API_KEY) — e.g. a local gateway that serves multiple model families
// under one URL. Lets AI_MODEL be whatever model string that gateway exposes.
export function getModel() {
  const provider = process.env.AI_PROVIDER || 'anthropic';
  const modelId = process.env.AI_MODEL || (provider === 'openai' ? 'gpt-4o' : 'claude-sonnet-5');

  if (provider === 'custom') {
    // .chat() targets the classic /v1/chat/completions shape most gateways
    // implement — the bare call defaults to OpenAI's newer, stateful
    // Responses API, which most third-party endpoints don't support.
    const custom = createOpenAI({
      baseURL: process.env.AI_BASE_URL,
      apiKey: process.env.AI_API_KEY,
    });
    return custom.chat(modelId);
  }

  if (provider === 'openai') return openai.chat(modelId);
  return anthropic(modelId);
}

const suggestionSchema = z.object({
  request_type: z.enum(['NDA', 'Contract', 'MSA', 'Other']),
  priority: z.enum(['low', 'medium', 'high']),
  suggested_assignee_id: z.string().nullable().describe('The id of the best-fit team member, or null if unclear'),
  rationale: z.string().describe('One or two sentences explaining the suggestion'),
});

export type RequestSuggestion = z.infer<typeof suggestionSchema>;

export async function suggestRequestFields({
  title,
  description,
  teamMembers,
}: {
  title: string;
  description: string | null;
  teamMembers: { id: string; name: string }[];
}): Promise<RequestSuggestion> {
  const { object } = await generateObject({
    model: getModel(),
    schema: suggestionSchema,
    prompt: `You are triaging a legal request for a contract lifecycle management tool.

Request title: ${title}
Request description: ${description || '(none)'}

Team members available to assign (pick the best fit by name, or null if none fit):
${teamMembers.map((m) => `- ${m.id}: ${m.name}`).join('\n') || '(no team members)'}

Classify the request type (NDA, Contract, MSA, or Other), suggest a priority (low, medium, high), and suggest an assignee id from the list above if one is a clear fit.`,
  });

  return object;
}

const refinedRequestSchema = z.object({
  title: z.string().describe('A short, clear request title, e.g. "NDA review — Acme Corp"'),
  description: z.string().describe('A clean 1-3 sentence description of what is being asked, in professional language'),
});

export async function refineIntakeRequest({
  rawText,
  requesterName,
  channel,
}: {
  rawText: string;
  requesterName: string | null;
  channel: 'slack' | 'email';
}): Promise<{ title: string; description: string }> {
  const { object } = await generateObject({
    model: getModel(),
    schema: refinedRequestSchema,
    prompt: `Someone reached out via ${channel === 'email' ? 'email' : 'Slack'}, asking legal for something. Turn it into a clean, professional
Request title and description for a contract lifecycle management tool. Keep the original intent — don't add
details that weren't there. Message: "${rawText}"`,
  });

  const channelLabel = channel === 'email' ? 'email' : 'Slack';
  return {
    title: object.title,
    description: requesterName ? `${object.description}\n\nRequested via ${channelLabel} by ${requesterName}` : object.description,
  };
}

const requestIntentSchema = z.object({
  is_request: z
    .boolean()
    .describe('true only for a clear, actionable ask for something legal/contract-related — an NDA, contract, MSA, review, etc.'),
  rationale: z.string().describe('One short sentence explaining the decision'),
});

// Gate used for passive channel monitoring — the bot wasn't addressed, so
// this decides whether a message is worth turning into a Request at all.
// False negatives (missing a real request) are far cheaper than false
// positives (spamming a channel with junk tickets), so bias toward false.
export async function detectRequestIntent({ text }: { text: string }): Promise<{ is_request: boolean; rationale: string }> {
  const { object } = await generateObject({
    model: getModel(),
    schema: requestIntentSchema,
    prompt: `A message was posted in a Slack channel a legal-request bot is monitoring, without addressing the bot
directly. Decide whether it's a clear, actionable ask for something legal/contract-related (an NDA, contract, MSA,
review, etc.) that should become a Request — or just ordinary chat, a question not aimed at getting something done,
banter, etc. When in doubt, say it is NOT a request — a missed request is far cheaper than a false alarm.

Message: "${text}"`,
  });

  return object;
}

// Handles a Slack thread reply as an agent turn: the model decides whether
// to answer a question (getTaskStatus), look up who's available
// (getTeamMembers), draft a change (proposeChange — never applies anything
// directly, just inserts a pending task_ai_suggestions row), or just
// acknowledge a plain comment. One call replaces what used to be a growing
// set of hand-coded classification branches.
export async function runThreadAgent({
  text,
  taskId,
  teamMembers,
}: {
  text: string;
  taskId: string;
  teamMembers: { id: string; name: string }[];
}): Promise<{ reply: string | null; proposed: boolean }> {
  let proposed = false;
  const modelId = process.env.AI_MODEL || (process.env.AI_PROVIDER === 'openai' ? 'gpt-4o' : 'claude-sonnet-5');

  const result = await generateText({
    model: getModel(),
    stopWhen: stepCountIs(4),
    system: `You're handling a Slack reply on an existing legal request ticket (a CLM tool's Request).
Use getTaskStatus to answer questions about the ticket (status, priority, assignee, due date, checklist).
Use getTeamMembers if you need to know who's available, e.g. for a reassignment request.
If the message clearly requests a concrete change — reassign it, change its priority, or change its type —
call proposeChange. That only drafts the change for a human to confirm in the app; it does not apply anything,
so you can call it even if you're not 100% sure, the human will review it. If proposeChange can't find a
matching team member for a requested reassignment, don't call it — just explain who's actually available instead.
If the message is just a comment, FYI, or you have nothing useful to add, reply with an empty string.
Keep replies short and friendly, like a real Slack message.`,
    prompt: text,
    tools: {
      getTaskStatus: {
        description: "Get this ticket's current status, priority, type, assignee, due date, and checklist progress.",
        inputSchema: z.object({}),
        execute: async () => {
          const { data: task } = await supabaseAdmin
            .from('tasks')
            .select('title, priority, request_type, due_date, is_done, profiles:assigned_to(full_name, email), columns:column_id(name)')
            .eq('id', taskId)
            .maybeSingle();

          const { data: checklist } = await supabaseAdmin.from('task_checklist_items').select('is_done').eq('task_id', taskId);
          const done = (checklist || []).filter((c) => c.is_done).length;

          return {
            ...task,
            assignee: (task as any)?.profiles?.full_name || (task as any)?.profiles?.email || 'Unassigned',
            status: (task as any)?.columns?.name || 'Unknown',
            checklist: checklist ? `${done}/${checklist.length} done` : 'No checklist',
          };
        },
      },
      getTeamMembers: {
        description: 'List the team members available to assign this ticket to.',
        inputSchema: z.object({}),
        execute: async () => ({ teamMembers }),
      },
      proposeChange: {
        description: 'Draft a change to the ticket for human confirmation. Does not apply anything directly.',
        inputSchema: z.object({
          assignee_id: z.string().nullable().describe('Team member id to reassign to'),
          priority: z.enum(['low', 'medium', 'high']).nullable(),
          request_type: z.enum(['NDA', 'Contract', 'MSA', 'Other']).nullable(),
          rationale: z.string().describe('One short sentence explaining what was requested, for an internal audit log'),
        }),
        execute: async (params: any) => {
          await supabaseAdmin.from('task_ai_suggestions').insert({
            task_id: taskId,
            request_type: params.request_type,
            priority: params.priority,
            suggested_assignee: params.assignee_id,
            rationale: params.rationale,
            model: modelId,
          });
          proposed = true;
          return { drafted: true };
        },
      },
    },
  });

  return { reply: result.text.trim() || null, proposed };
}

export async function summarizeThread({
  comments,
}: {
  comments: { author: string; content: string }[];
}): Promise<string> {
  if (comments.length === 0) return 'No comments yet.';

  const { text } = await generateText({
    model: getModel(),
    prompt: `Summarize this comment thread on a legal request in one short paragraph, focused on decisions made and open questions:

${comments.map((c) => `${c.author}: ${c.content}`).join('\n')}`,
  });

  return text;
}
