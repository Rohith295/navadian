import { generateObject, generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai, createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';

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

const threadReplyIntentSchema = z.object({
  is_actionable: z
    .boolean()
    .describe('true if this message requests a concrete change to the ticket (reassign, change priority/type); false if it is just a comment, question, or FYI'),
  suggested_assignee_id: z.string().nullable().describe('Team member id to reassign to, if requested'),
  suggested_priority: z.enum(['low', 'medium', 'high']).nullable().describe('New priority, if requested'),
  suggested_request_type: z.enum(['NDA', 'Contract', 'MSA', 'Other']).nullable().describe('New request type, if requested'),
  rationale: z.string().describe('One short sentence explaining what was requested'),
});

export type ThreadReplyIntent = z.infer<typeof threadReplyIntentSchema>;

export async function classifyThreadReply({
  text,
  teamMembers,
}: {
  text: string;
  teamMembers: { id: string; name: string }[];
}): Promise<ThreadReplyIntent> {
  const { object } = await generateObject({
    model: getModel(),
    schema: threadReplyIntentSchema,
    prompt: `This is a reply on an existing legal request ticket. Decide whether it's just a comment/FYI, or whether
it's actually asking for a concrete change to the ticket (reassigning it to someone, changing its priority, or
changing its type).

Message: "${text}"

Team members available to assign (pick the best fit by name, or null if none mentioned/fit):
${teamMembers.map((m) => `- ${m.id}: ${m.name}`).join('\n') || '(no team members)'}

Only set is_actionable=true if the message clearly requests one of those changes. A question, status update, or
general comment is NOT actionable.`,
  });

  return object;
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
