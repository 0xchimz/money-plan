# money-plan — follow-ups after the v1 build (29 Sep 2026)

Built task by task from `docs/superpowers/plans/2026-09-29-money-plan.md`; every task reviewed, then a whole-branch review (opus) and one fix wave. 90 tests green on `567ee4c`.

## Still to do before v1 is live

1. ~~**GitHub**~~ — done 29 Sep: `0xchimz/money-plan` (private), ChinOS submodule + AGENT.md line.
2. ~~**First deploy**~~ — done 29 Sep: live at https://money-plan.c-soonue.workers.dev (D1 `money-plan` in APAC, Google OAuth client set, ALLOWED_EMAILS secret set, Chin logged in). CI/CD: GitHub Actions deploys on every push to `main` after typecheck/test/build (first CI deploy 09:37 UTC).
3. **Acceptance walkthrough in the browser** (subagents could only curl the API, so every visual check is here):
   - every page against the mockups (`docs/superpowers/specs/2026-09-29-money-plan-mockups/`), light + dark;
   - login with an allowlisted email; another email gets the red box;
   - `/api/overview` in a private window → 401;
   - two people each plan + close a month, and see only their own numbers;
   - logout, and the old tab's next action lands on the login card;
   - **remove an email from ALLOWED_EMAILS while that person has the app open → their next action shows the red box** (Review Focus 1);
   - **Planning with expenses above income → Sankey has no "ยังไม่จัดสรร" node and the red over-allocation line shows** (Review Focus 4);
   - **"ปิดเดือน" is disabled on an empty month**;
   - **start month 2 with a realistic sheet (about 60 rows) on prod** — the D1 Free limit of 50 queries per request can't be tested locally; start is now 2 statements, but verify;
   - Cloudflare dashboard: CPU per request well under 10 ms.

## Deferred findings (known, not blocking)

From the whole-branch review:
- Re-adding an item that already exists in the month overwrites its amount and ignores the tier chosen in the form (`worker/balance.ts` addItem upsert).
- "เริ่มปิดบัญชี <next>" is offered for a month that hasn't started yet; `startMonth` has no upper bound.
- Balance page has no stale-response guard on month navigation (`src/pages/balance.tsx`), and the error-path reload has no `.catch`.
- Balance history SUM reads every closed month and keeps 13 (`worker/balance.ts` getBalance) — bound it like Overview.
- Optional `public/_headers` with `X-Frame-Options: DENY` and `Referrer-Policy`.

From the per-task reviews:
- Test pool runs workerd compat date 2026-08-22 (pool-workers 0.22), prod uses 2026-09-01; re-check when the pool is upgraded. `pnpm-workspace.yaml` gained `minimumReleaseAgeExclude` from pnpm — watch it.
- Auth: Secure cookie flag follows the request scheme (always https on workers.dev); broad `isConstraint` catch in first-login race; dev bypass rewrites the dev user's name each request; identity keyed by email (not Google `sub`); re-login doesn't revoke the presented cookie; test-only `__resetGoogleKeysForTests` ships in the bundle; the public-path list is hand-maintained (forgetting a path fails closed); no mixed-case ALLOWED_EMAILS test.
- `addItem`/`classifyItem` take `Record<string, unknown>` rather than the shared types; `classifyItem` uses a single scoped UPDATE (safe, different style); `setEntry` answers 400 for a bad amount before 404 for an unknown item.
- `PUT /api/tier-targets` re-reads the whole Overview.
- Planning `Runway` recomputes months instead of using `efStatus()`; no "รายรับยังพอจ่าย" text when ตกงาน income covers expenses (spec §7.5 amended in 1be6039 no longer requires it).
- a11y: tier radiogroup and Segmented tabs lack roving tabindex / arrow keys.
- Overview `AssetMixCard` seeds its active series once per mount; MoneyFlowCard legend totals include thb ≤ 0 lines (the API rejects negatives).
- `layout.tsx` uses the `window.google` declaration from `src/lib/google.ts` without importing it.
