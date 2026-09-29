# money-plan

Planning · Balance · Overview for Chin and family. Each Google login sees only their own numbers.
One Cloudflare Worker (free tier) serves the React SPA and the JSON API; data lives in D1.

## Dev

```bash
cp .dev.vars.example .dev.vars   # ALLOWED_EMAILS, optional DEV_USER_EMAIL
pnpm install
pnpm db:migrate:local
pnpm db:seed:demo                # optional: demo@money-plan.local with six closed months
pnpm dev                         # http://localhost:5173
```

`DEV_USER_EMAIL` makes localhost act as that user (never works on any other host). To try the real Google button locally,
add `http://localhost:5173` to the OAuth client's JavaScript origins and put its id in `wrangler.jsonc` → `vars.GOOGLE_CLIENT_ID`.

## Test

```bash
pnpm test        # vitest inside workerd with a local D1 (auth, planning, balance, overview, cross-user isolation)
pnpm typecheck
pnpm build
```

## Deploy

```bash
pnpm run deploy  # build → D1 migrations (remote) → wrangler deploy
```

## People

Who may log in is the `ALLOWED_EMAILS` secret (comma-separated, the whole list every time):

```bash
pnpm exec wrangler secret put ALLOWED_EMAILS
```

Removing an email locks that person out on their next request, even with a live session.

## How it fits

- `shared/` — pure logic used by both sides (plan totals, EF, transfers, overview aggregation, Sankey, categories). Unit-tested.
- `worker/` — Hono API. Login = Google ID token (checked with `jose`) → allowlist → a random session token in an HttpOnly cookie, only its SHA-256 stored in D1.
  Every query filters on the session's `user_id`; writes by id use `WHERE id = ? AND user_id = ?` and answer 404 otherwise. Writes must be JSON (CSRF).
  D1 has no interactive transactions: read first, then one `db.batch()`.
- `src/` — React SPA (UI kit copied from `apps/portfolio`). Desktop only.
- Design and plan: `docs/superpowers/specs/2026-09-29-money-plan-design.md`, `docs/superpowers/plans/2026-09-29-money-plan.md`.
