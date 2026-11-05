# FATIR MiniApp — GitHub Pages migration staging

Original React/Vite/TypeScript frontend extracted from existing AppDeploy deployment.
This code resides on a **separate branch**. Production Telegram entry, current n8n flows and Sheets were **not changed**.

## Build
Install Node 22: npm install && npm run build.
Set VITE_API_BASE_URL to a deployed HTTPS Cloudflare Worker endpoint at build time.
The original Vite base './' supports GitHub project Pages.

## Security / blockers
- Repository is PUBLIC. Never commit customer data, signed Telegram initData, secret values or n8n webhook URLs.
- The frontend is not an authorization boundary: the Worker validates signed Telegram initData and roles on every request.
- AppDeploy database stores current discussion events, proposal statuses and replay receipts. These MUST be exported, imported into D1 and validated before enabling mutation endpoints.
- The worker prototype returns 503 for discussion mutation operations; this is deliberate fail-closed behavior.
- Existing n8n workflows call AppDeploy's internal signature verifier. Switch them only after new Worker endpoint and replay protection are verified.
- Publish only after GitHub Pages, Worker, D1, signing and end-to-end smoke tests pass. Do not switch Telegram bot Mini App URL until then.
