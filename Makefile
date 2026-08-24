.PHONY: up

# Starts Next.js and exposes it through a temporary Cloudflare Quick Tunnel.
# Stop both processes with Ctrl-C. The public trycloudflare.com URL is printed
# by cloudflared once the tunnel is ready.
up:
	@command -v cloudflared >/dev/null 2>&1 || { echo "cloudflared is required. Install it with: brew install cloudflared"; exit 1; }
	@npm run dev & frontend_pid=$$!; trap 'kill $$frontend_pid 2>/dev/null' EXIT INT TERM; cloudflared tunnel --url http://localhost:3000
