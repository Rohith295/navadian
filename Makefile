.PHONY: up

PORT ?= 3000
NGROK_DOMAIN ?= pretypographical-intervertebrally-marisol.ngrok-free.dev

# Starts Next.js and exposes it through ngrok on the reserved static domain,
# so Slack's OAuth Redirect URL / Events Request URL never need updating
# between runs. Stop both processes with Ctrl-C.
up:
	@command -v ngrok >/dev/null 2>&1 || { echo "ngrok is required. Install it with: brew install ngrok"; exit 1; }
	@PORT=$(PORT) npm run dev & frontend_pid=$$!; trap 'kill $$frontend_pid 2>/dev/null' EXIT INT TERM; ngrok http --url=$(NGROK_DOMAIN) $(PORT)
