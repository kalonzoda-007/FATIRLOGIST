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

## 2026-11-06 read-only staging checkpoint

- Real Telegram login using GitHub Pages, Cloudflare Worker, staged n8n bootstrap and Google Sheets was confirmed by the owner.
- Staging n8n Bootstrap, Status and Discussion Orders Read workflows are separate from production. Cloudflare verifies server signatures; D1 nonce receipts protect against replays.
- Worker upstream timeout is 65 seconds because Google Sheets calls sometimes exceed 27 seconds.
- Preview: https://kalonzoda-007.github.io/FATIRLOGIST/migration-preview/ (independent gh-pages folder).
- Staging frontend displays read-only warning and disables the Send Order action. Worker rejects POST /api/orders before any n8n submission.
- D1 has fatir_discussion_events, fatir_discussion_proposals, fatir_legacy_discussion_guard plus workflow_nonce. See worker/discussion-schema.sql.
- Two existing DISCUSSION orders are marked REQUIRES_SOURCE_EXPORT, never VERIFIED.
- Source Google Sheet tabs ORDER_DISCUSSIONS and ORDER_PROPOSALS contain headers only, while prior n8n audit executions include QA records. The source-of-truth AppDeploy transactional discussion DB has not yet been exported; do not substitute incomplete audit records.
- Discussion writes, decisions, approvals and applies remain prohibited until the legacy source is reconciled and ACID/idempotent state transitions are implemented.
- Current live production bot menu, production n8n and Google Sheets data are unchanged.

### Mandatory remaining release checks

1. Obtain authorized export of legacy AppDeploy discussion state; reconcile proposal IDs, statuses, audit and unknown-outcome writes.
2. Build and test D1 transactional proposal state machine, safe apply/retry policy and notifications.
3. Validate positive and negative Telegram login, roles, ownership isolation and replay protection.
4. Test new order creation only with an isolated test sheet or controlled test row, not live production data by default.
5. Verify full mobile Telegram UX and retain rollback before moving existing bot menu.
