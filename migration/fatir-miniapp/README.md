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

## A4 gate-pass printing (2026-11-10)

- UI implementation: src/PrintPassSheet.tsx and its print stylesheet in src/index.css.
- Layout: one A4 portrait page with THREE horizontal pass positions. Every occupied position contains TWO side-by-side copies (security + warehouse). Three registered orders fill six copies per sheet.
- Immediate print preparation is triggered only after the server returns a real ORD ID and an authorized /api/discussions/get read verifies that order and its items; NOT from an unconfirmed submission or local dry-run.
- Browser window.print() is invoked after rendering. Manual Print/PDF remains available for browsers and Telegram webviews that do not auto-open native print.
- In staging, 'Посмотреть образец пропуска A4 (2 копии)' creates a visibly watermarked sample without creating an order. In the orders inbox, select up to three existing authorized ORD IDs to print them together.
- Template includes client, destination, product summary, bag quantity, total mass, dispatch date and signature lines. Driver/plate appear as blank fields because the current source does not persist them. The print footer explicitly states that entry/loading requires staff authorization.
- The current staging backend still rejects production order creation. Therefore auto-print-after-submission is implemented but cannot be verified end-to-end until the real, safely migrated creation path is enabled. Do not enable staging orders just to test print.
- For manual QA: print sample as A4 portrait at 100% scale; verify all 3 rows and 6 halves fit without overlap; repeat on Android Telegram WebView because built-in printing can vary by OS.

## 2026-11-11 connectivity and reliability checkpoint

- Production bot menu `/app` still targets the original `kalonzoda-007/applicant` GitHub Pages site, whose `src/apiClient.ts` still calls AppDeploy. Do not silently change the menu or existing Pages root before production end-to-end signoff.
- The isolated staging page at `https://kalonzoda-007.github.io/FATIRLOGIST/migration-preview/` talks to Cloudflare Worker `fatir-miniapp-migration`; all secrets and D1 binding were present when checked.
- Cloudflare staging real submission flag `SUBMIT_ENABLED=true`; staging app has clearly separate Check (no save) and Submit (real ORD) buttons. Do not test Submit using fictional production orders.
- Staging bootstrap n8n completed successfully on Nov 11 2026 (execution 309), but client Sheet read intermittently took 27-64 seconds; Cloudflare bootstrap timeout raised to 110s and React client now retries a transient 502/503/504 once and offers manual retry. Writes and authentication failures are not retried.
- n8n production Telegram Orders latest runs on Nov 7 and Nov 8 crashed after Telegram Trigger; no confirmed new successful production order after Nov 5. The Nov 10 manual invalid-HMAC execution 306 correctly failed at Verify and never reached Google Sheets.
- Old n8n HMAC callback URLs in active bootstrap, read, audit and apply workflows were migrated to Cloudflare D1-based verification, preserving the original signed protocol. Legacy AppDeploy discussion editing endpoints have **not** been replaced pending transactional reconciliation.
- A Nov 10 private diagnostic Telegram send succeeded; this verifies outbound message transmission, but not inbound Telegram Trigger or actual full order workflow.
- Google Sheet ORDERS has additive driver_name, driver_phone, vehicle_plate, vehicle_brand, vehicle_body columns, with mappings in the signed n8n MiniApp path and read-only order detail; old rows left untouched.
- New product editor reveals next blank line after the previous product, plant, and positive quantity are all filled. Pickup fields only appear in self-pickup mode. Builds and security tests passed; test pages deployed to isolated preview.
- Gate-pass print button is configured to be sent in private chat after Check Item Count confirms complete write; its delivery is not yet verified by a real successful order.
- Release blockers: a legitimate ORD end-to-end write test with staff user, verifying order registry, item rows, idempotency, status poll and the private print button; verifying recovery from the Telegram Trigger crashes; transactional legacy discussion history migration; final owner signoff before changing `/app`.
