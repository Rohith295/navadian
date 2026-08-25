.PHONY: up db

PORT ?= 3000
NGROK_DOMAIN ?= pretypographical-intervertebrally-marisol.ngrok-free.dev

# Applies every migration in supabase/migrations/ to the linked Supabase
# project. Run `npx supabase link --project-ref <ref>` once first (per
# clone, not scriptable — it needs you to pick/auth into your own project).
db:
	npx -y supabase db push --yes

# Starts Next.js and exposes it through ngrok on the reserved static domain,
# so Slack's OAuth Redirect URL / Events Request URL never need updating
# between runs. Stop both processes with Ctrl-C.
#
# `next dev` spawns next-router-worker child processes that killing the
# parent (npm run dev) does NOT reliably kill — they're left as orphans
# holding stale file handles into the old .next build, and cause "Cannot
# find module" errors once .next gets rebuilt. Cleaned up on both ends:
# before starting (in case a previous run exited uncleanly) and on exit.
up:
	@command -v ngrok >/dev/null 2>&1 || { echo "ngrok is required. Install it with: brew install ngrok"; exit 1; }
	@pkill -9 -f next-router-worker 2>/dev/null; true
	@PORT=$(PORT) npm run dev & frontend_pid=$$!; trap 'kill $$frontend_pid 2>/dev/null; pkill -9 -f next-router-worker 2>/dev/null; true' EXIT INT TERM; ngrok http --url=$(NGROK_DOMAIN) $(PORT)
