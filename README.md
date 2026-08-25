# navadian

Contract Lifecycle Management for legal teams — track every NDA, contract, and MSA
from request to signature. Requests can come from the app itself, a Slack mention,
or a forwarded email; an AI layer classifies, drafts, and (with human confirmation)
proposes changes.

Built on Next.js (App Router), Supabase (Postgres + Auth + Storage), and the
[Vercel AI SDK](https://ai-sdk.dev) (provider-agnostic — Anthropic, OpenAI, or any
OpenAI-compatible endpoint).

> This is a fork of the open-source [Kanba](https://github.com/Kanba-co/kanba) project
> (MIT License, Copyright (c) 2025 Abbas Aga). See `LICENSE`.

## Shared project, per-person local setup

This repo talks to one shared Supabase project (not a separate database per developer)
and, if enabled, one shared Slack app / Postmark account. You can reuse the project
owner's `.env.local` values as-is for Supabase/AI/Slack/Postmark credentials — but
**webhooks (Slack, email) only reach whichever machine's tunnel URL is currently
configured** in Slack's/Postmark's dashboards, so only one person is "live" for those
at a time unless this is deployed somewhere permanent. Everyone can run their own
`ngrok` tunnel and swap the webhook URLs when it's their turn to test.

**Whoever set this up should never hand out `SUPABASE_SERVICE_ROLE_KEY` or the AI/Slack/
Postmark secrets casually** — they're full-access credentials (the service role key
bypasses row-level security entirely), not read-only tokens.

## Required setup

1. `npm install`
2. Create (or get invited to) a Supabase project. Log in, link it once, then push the schema:
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   make db
   ```
   Every migration lives in `supabase/migrations/` — that's the source of truth for
   the schema (the `prisma/` folder is reference-only, not what's actually applied).
   Run `make db` again any time new migrations are added.
3. Copy `.env.example` to `.env.local` and fill in at minimum:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_SITE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`
4. `npm run dev`

This alone gets projects, boards, and email/password auth working. Google sign-in
needs a Google OAuth client configured in Supabase Auth's provider settings
(shared per Supabase project, not per developer).

## Optional integrations

Each is independent — the app works without any of them, just with that feature
inactive.

### AI Planner / Assistant / Slack+email request classification
Set in `.env.local`:
```
AI_PROVIDER=anthropic        # or 'openai', or 'custom' for any OpenAI-compatible endpoint
AI_MODEL=claude-sonnet-5
ANTHROPIC_API_KEY=...        # or OPENAI_API_KEY, or AI_BASE_URL + AI_API_KEY for 'custom'
```
Powers: per-Request AI suggestions (`/dashboard/ai-planner`), the chat Assistant
(`/dashboard/assistant`), and cleaning up raw Slack/email text into a proper title
and description.

### Slack
1. Create a Slack app at api.slack.com under **your own** workspace (the workspace you
   create it in doesn't matter — it's not where it gets installed later). Do **not**
   enable Socket Mode or Enterprise Managed Auth.
2. Bot Token Scopes: `app_mentions:read`, `chat:write`, `users:read`, `files:read`,
   `channels:history`. Subscribe to bot events `app_mention` and `message.channels`.
3. Run a public tunnel: `make up` starts Next.js + ngrok together on the domain in
   the `Makefile`'s `NGROK_DOMAIN` — override it with your own reserved ngrok domain:
   `make up NGROK_DOMAIN=your-domain.ngrok-free.dev`.
4. In the Slack app: OAuth Redirect URL → `https://<your-domain>/api/slack/oauth/callback`;
   Events Request URL → `https://<your-domain>/api/slack/events`.
5. Set `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET` in `.env.local`.
6. Connect it from `/dashboard/integrations` (picks which project Slack-created
   Requests land in).

If you change scopes later, reinstall the app from the same page — Slack requires it.

### Email intake
Uses [Postmark](https://postmarkapp.com) Inbound Parse — no domain/DNS setup required
to start (every Postmark Server gets a working `<hash>@inbound.postmarkapp.com`
address immediately).
1. Create a Postmark account + Server, enable **Inbound**.
2. Set the inbound webhook URL to `https://<your-tunnel-domain>/api/email/inbound?token=<pick-a-secret>`.
3. Set `POSTMARK_SERVER_TOKEN` (the Server's API token), `EMAIL_INBOUND_SECRET`
   (the secret you picked), `EMAIL_INBOUND_ADDRESS` (the Postmark-given address) in
   `.env.local`.
4. Connect it from `/dashboard/integrations`.

### Billing (Stripe)
Env vars exist in `.env.example`, but pricing/plan-limit enforcement is currently
disabled in the code — Stripe isn't functional right now regardless of keys set.

## For AI coding agents picking this up

- `supabase/migrations/` is the real schema — read it before assuming a table shape.
- `lib/ai.ts` is the single place that talks to a model; every feature asks it for
  "the configured model" via `getModel()` rather than importing a provider directly.
- `lib/slack.ts` / `lib/access.ts` hold the auth-check patterns (`requireProjectAdmin`,
  `requireTaskAccess`) reused across the Slack, email, and AI API routes — follow the
  same pattern for new server routes rather than inventing another one.
- RLS is the real access-control boundary for anything running with the user's own
  session (the Assistant's tools, the dashboard pages); service-role routes (Slack/
  email webhooks) must scope every query manually since there's no logged-in user.
