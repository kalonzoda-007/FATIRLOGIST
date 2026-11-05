# FATIR Cloudflare Worker staging

## Required Cloudflare setup (owner action)
1. Create Cloudflare account/authorize Wrangler CLI. Create D1 database `fatir-miniapp`.
2. Copy wrangler.toml.example to wrangler.toml, set database id, `ALLOWED_ORIGIN` to the exact GitHub Pages origin (scheme + host, no path), `FRONTEND_URL` to desired Pages URL.
3. Apply schema.sql with `wrangler d1 execute fatir-miniapp --file=./schema.sql --remote`.
4. Set secret `TELEGRAM_BOT_TOKEN` using `wrangler secret put` (never chat, never GitHub).
5. Set `N8N_BOOTSTRAP_URL`, `N8N_SUBMIT_URL`, `N8N_STATUS_URL`, `N8N_DISCUSSION_URL` via `wrangler secret put`. These are the existing production n8n webhook URLs; do not expose them in repository source.
6. Deploy test Worker to distinct hostname; do not change the active bot URL or n8n verifier until test endpoint is confirmed.
7. In *staged copies* of n8n workflows, point Verify FATIR HMAC nodes to Worker /api/internal-workflow-verify. Apply/revision and notification flows must be evaluated separately because current AppDeploy database is required.
8. Build frontend with VITE_API_BASE_URL and check login via a temporary Telegram test bot/button; new URL alone in external browser cannot supply signed Telegram initData.

## Routes
/api/health (GET), /api/internal-workflow-verify, /api/bootstrap, /api/orders, /api/order-status, /api/discussions/list, /api/discussions/get.
All discussion mutations intentionally return HTTP 503 pending **transactional database migration**; DO NOT enable production use before full migration.
Worker rejects requests from origins other than ALLOWED_ORIGIN; backend verifies signed Telegram auth on every business request.
Do not treat CORS as authentication; requests from other clients are checked via Telegram signature and role.
Signed n8n verification uses D1 nonce unique-key inserts. Never delete or disable this safeguard.

## Hard blockers
- Existing AppDeploy DB must be exported and transactional discussion history imported with preserved proposal IDs/statuses.
- Need secret/configuration access and Cloudflare deployment authorization.
- n8n's backend verifier currently depends on AppDeploy. Cut over only with parallel staging and rollback ready.
- No successful live end-to-end Telegram or Worker tests have been performed yet.
