# money-plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `money-plan`, a multi-user web app on Cloudflare Workers + D1 (free tier) where each Google-logged-in family member keeps their own monthly plan (Planning), month-end balance sheet (Balance) and a chart summary (Overview).

**Architecture:** One Worker (Hono) serves the Vite React SPA as static assets and the JSON API under `/api/*`. Login is in-app: Google Identity Services gives an ID token, the Worker verifies it with `jose`, checks `ALLOWED_EMAILS` and keeps its own session in D1 behind an HttpOnly cookie. Every table carries `user_id`; every query filters on it. Pure business logic lives in `shared/` (used by both the Worker and the SPA) so it can be unit-tested without a database.

**Tech Stack:** TypeScript · Hono 4 · jose 6 · Cloudflare Workers + D1 · wrangler 4 · `@cloudflare/vite-plugin` · Vite 8 · React 19 · Tailwind 4 + shadcn (base-ui) · recharts · vitest 4.1 + `@cloudflare/vitest-pool-workers` 0.22 · pnpm 12

**Spec:** `docs/superpowers/specs/2026-09-29-money-plan-design.md` (mockups in `docs/superpowers/specs/2026-09-29-money-plan-mockups/`)

## Global Constraints

- Repo: `apps/money-plan` inside ChinOS, its own git repo (becomes submodule `0xchimz/money-plan` in Task 11). Never edit `apps/portfolio` — only copy files out of it.
- Commits in both repos: author `Chinnabhorn Soonue <c.soonue@gmail.com>` only, no `Co-Authored-By` line. Check `git config user.email` before every commit.
- **Sub-agents never commit.** A sub-agent stops at each "Commit" step and reports the exact files to stage; the main session runs the commit.
- Never commit secrets: `.dev.vars` is git-ignored; `ALLOWED_EMAILS` is a wrangler secret in prod. `GOOGLE_CLIENT_ID` is public and may live in `wrangler.jsonc`.
- Cloudflare free tier: no outbound calls except Google JWKS; keep request CPU small (no heavy loops over all history).
- D1 has no interactive transactions: read first, then write with one `db.batch([...])` (atomic). Never `BEGIN`/`COMMIT`.
- Every SQL statement on user data has `user_id = ?`; update/delete by id uses `WHERE id = ? AND user_id = ?` and answers 404 when nothing changed. `user_id` comes only from the session (`c.var.uid`), never from the request.
- Every write request (POST/PUT/PATCH/DELETE) must send `Content-Type: application/json` (server answers 415 otherwise); the SPA always sends a JSON body (`{}` when empty).
- API errors are JSON `{ error: string }` with Thai messages; statuses 400 / 401 / 403 / 404 / 409 / 415 / 500 / 503.
- UI: desktop only (≥ 1024px), Thai copy, warm `.finance` theme on every page, money shown with `thb()` / `money()` from `src/lib/format.ts` (full numbers, commas, never k/M in main cards).
- Months are `YYYY-MM`; "this month" is Bangkok time (UTC+7).
- Scenarios are exactly `main` (ปัจจุบัน) · `proj` (Projection) · `em` (ตกงาน). Emergency-fund target = 6 × total `Expense` of `em`.
- Tiers are exactly `Foundation` · `Core` · `Growth` · `High Risk`; default targets 0.10 / 0.40 / 0.35 / 0.15; an item is "in the portfolio" iff it is an asset with a non-null tier.
- Run everything with `pnpm` inside `apps/money-plan`. Tests: `pnpm test`. Types: `pnpm typecheck`. Build: `pnpm build`.

## Review Focus

1. **Session ends while a page is open** (expired cookie, logout in another tab, email removed from the allowlist) → the next API call returns 401/403 JSON and the SPA shows the login page instead of a loop of "บันทึกไม่ได้" toasts. Pinned by Task 2 (API statuses) + Task 8 Step 7 item 5 (manual check) + Task 12 Step 6 item 5.
2. **Month rollover near midnight in Thailand** (e.g. 2026-09-30 17:00 UTC is already October in Bangkok) → first-month options and "this month" follow Bangkok time. Pinned by Task 4 `shared-month.test.ts`.
3. **Re-adding an item that was removed** (same side / category / name) → the same item comes back, no UNIQUE-constraint 500 and no duplicate row. Pinned by Task 4 `balance.test.ts` "re-adds a removed item".
4. **Planning that allocates more than the income** → the Sankey has no "ยังไม่จัดสรร" node and no negative band; the card shows a warning. Pinned by Task 10 `shared-sankey.test.ts` "over-allocated".
5. **Non-numeric amounts reaching the API** (`"1,000"`, `null`, `"abc"`, booleans) → 400 with a Thai message; nothing non-finite is ever stored. Pinned by Task 3 (planning validation) and Task 4 (balance validation).

## File Map

```
apps/money-plan/
  package.json · pnpm-workspace.yaml · .gitignore · .dev.vars.example · .oxlintrc.json · components.json
  tsconfig.json · tsconfig.app.json (src + shared) · tsconfig.worker.json (worker + shared + test) · tsconfig.node.json (configs)
  vite.config.ts · vitest.config.ts · wrangler.jsonc · worker-configuration.d.ts (generated) · index.html · public/favicon.svg
  migrations/0001_init.sql            schema (spec §4)
  shared/                              pure TS, no DOM / Workers APIs — imported by worker/ (relative paths) and src/ (@shared/…)
    types.ts        API contract: every request/response type
    month.ts        isMonth, addMonth, bangkokMonth, firstMonthOptions, monthLabel
    planning.ts     partOf, totals, debtOf, efStatus
    transfers.ts    month-close transfer checklist from the plan's account column
    overview.ts     buildOverview (aggregates closed months)
    categories.ts   CATEGORY_TH, BALANCE_CATEGORIES + chips, PLANNING_CHIPS, TIER_INFO, INVEST_TYPES, COUNTRIES, unusedChips
    sankey.ts       moneyFlow (Sankey nodes/links for one scenario), FLOW_COLOR
  worker/
    env.ts          Bindings + AppEnv types
    http.ts         HttpError, bad/notFound/conflict, jsonOnly, body, monthParam, idParam
    db.ts           all/one/run/stmt/now/isConstraint
    users.ts        findOrCreateUser (defaults), getMe
    auth.ts         Google token check, sessions, allowlist, dev bypass, /api/auth routes, requireUser
    planning.ts     getPlanning, addLine, updateLine, deleteLine, copyScenario, latestEf
    balance.ts      getBalance, startMonth, closeMonth, discardDraft, setEntry, confirmRows, addItem, classifyItem, removeEntry, restoreEntry, setTransfer
    overview.ts     getOverview, setTierTargets
    index.ts        Hono app: middleware + every route
  test/             vitest in workerd (helpers.ts, apply-migrations.ts, *.test.ts)
  src/              React SPA
    main.tsx · App.tsx · index.css
    lib/            api.ts · google.ts · format.ts · expr.ts · utils.ts · categories.ts
    components/     layout.tsx · chips.tsx · chart-card.tsx · charts.tsx · sankey.tsx · money-input.tsx · stat.tsx · category-icon.tsx · ui/*
    pages/          login.tsx · planning.tsx · balance.tsx · overview.tsx
  scripts/seed-demo.sql
  README.md
```

---

### Task 1: Scaffold the repo, schema and test harness

**Files:**
- Create: `apps/money-plan/package.json`, `pnpm-workspace.yaml`, `.gitignore`, `.dev.vars.example`, `.oxlintrc.json`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.worker.json`, `tsconfig.node.json`, `vite.config.ts`, `vitest.config.ts`, `wrangler.jsonc`, `index.html`, `public/favicon.svg`, `src/main.tsx` (temporary, replaced in Task 7)
- Create: `migrations/0001_init.sql`, `shared/types.ts`, `worker/env.ts`, `worker/http.ts`, `worker/db.ts`, `worker/index.ts`
- Test: `test/apply-migrations.ts`, `test/helpers.ts`, `test/schema.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `shared/types.ts` — the full API contract used by every later task (see Step 5).
  - `worker/env.ts`: `interface Bindings { DB: D1Database; GOOGLE_CLIENT_ID: string; ALLOWED_EMAILS: string; DEV_USER_EMAIL?: string; GOOGLE_JWKS_JSON?: string }`, `type AppEnv = { Bindings: Bindings; Variables: { uid: number; email: string } }`.
  - `worker/http.ts`: `class HttpError(status, message, extra?)`, `bad(msg)`, `notFound(msg?)`, `conflict(msg)`, `jsonOnly` middleware, `body<T>(c)`, `monthParam(c)`, `idParam(c, key?)`.
  - `worker/db.ts`: `type Db = D1Database`, `all<T>(db, sql, ...p): Promise<T[]>`, `one<T>(db, sql, ...p): Promise<T | null>`, `run(db, sql, ...p): Promise<D1Result>`, `stmt(db, sql, ...p): D1PreparedStatement`, `now(): string`, `isConstraint(e): boolean`.
  - `worker/index.ts`: `export default app` (a `Hono<AppEnv>`); later tasks add routes above the `export`.
  - `test/helpers.ts`: `testEnv`, `ORIGIN`, `allow(...emails)`, `disallow(email)`, `uniqueEmail(prefix?)`, `googleToken(email, opts?)`, `call(path, init?)`, `login(email?)`, `ok<T>(res)`, `uidOf(email)`, `sql(query, ...p)`.

- [ ] **Step 1: Create the repo and its git identity**

```bash
mkdir -p /Users/chin_mini/Desktop/ChinOS/apps/money-plan && cd /Users/chin_mini/Desktop/ChinOS/apps/money-plan
git init -b main
git config user.name "Chinnabhorn Soonue"
git config user.email "c.soonue@gmail.com"
mkdir -p migrations shared worker test src/components src/lib src/pages public scripts
```

Note: until Task 11 turns it into a submodule, ChinOS shows `apps/money-plan/` as untracked. Never `git add` it from the ChinOS repo.

- [ ] **Step 2: Write the project files**

`package.json`:

```json
{
  "name": "money-plan",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "packageManager": "pnpm@12.4.2",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc -b",
    "lint": "oxlint",
    "cf-typegen": "wrangler types",
    "db:migrate:local": "wrangler d1 migrations apply money-plan --local",
    "db:seed:demo": "wrangler d1 execute money-plan --local --file scripts/seed-demo.sql",
    "deploy": "pnpm build && wrangler d1 migrations apply money-plan --remote && wrangler deploy"
  }
}
```

`pnpm-workspace.yaml`:

```yaml
allowBuilds:
  esbuild: true
  workerd: true
```

`.gitignore`:

```
node_modules
dist
.wrangler
.dev.vars
*.local
.DS_Store
*.log
```

`.dev.vars.example`:

```
# Copy to .dev.vars (git-ignored). Read by `pnpm dev` (vite + workerd).
# Emails allowed to log in, comma-separated
ALLOWED_EMAILS=c.soonue@gmail.com
# Optional: skip Google on localhost and act as this user (works only on localhost / 127.0.0.1)
DEV_USER_EMAIL=demo@money-plan.local
```

`.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

`wrangler.jsonc` (the all-zero `database_id` is replaced by the real one in Task 12; local dev and tests do not need it):

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "money-plan",
  "main": "./worker/index.ts",
  "compatibility_date": "2026-09-01",
  "assets": { "not_found_handling": "single-page-application", "run_worker_first": ["/api/*"] },
  "d1_databases": [
    { "binding": "DB", "database_name": "money-plan", "database_id": "00000000-0000-0000-0000-000000000000", "migrations_dir": "migrations" }
  ],
  "vars": { "GOOGLE_CLIENT_ID": "" },
  "observability": { "enabled": true }
}
```

`vite.config.ts`:

```ts
import path from 'node:path'
import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      '@shared': path.resolve(import.meta.dirname, './shared'),
    },
  },
})
```

`vitest.config.ts` — tests run inside workerd with a local D1; a throw-away RSA key stands in for Google:

```ts
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'
import { exportJWK, generateKeyPair } from 'jose'
import { defineConfig } from 'vitest/config'

export default defineConfig(async () => {
  const migrations = await readD1Migrations('./migrations')
  // Stand-in for Google's signing key: tests sign ID tokens with the private half, the Worker checks with the public half
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true })
  const pub = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' }
  const priv = { ...(await exportJWK(privateKey)), kid: 'test-key', alg: 'RS256' }
  return {
    plugins: [
      cloudflareTest({
        main: './worker/index.ts',
        miniflare: {
          compatibilityDate: '2026-09-01',
          d1Databases: { DB: 'money-plan-test' },
          bindings: {
            GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
            ALLOWED_EMAILS: '',
            GOOGLE_JWKS_JSON: JSON.stringify({ keys: [pub] }),
            TEST_PRIVATE_JWK: JSON.stringify(priv),
            TEST_MIGRATIONS: migrations,
          },
        },
      }),
    ],
    test: {
      include: ['test/**/*.test.ts'],
      setupFiles: ['./test/apply-migrations.ts'],
    },
  }
})
```

`tsconfig.json`:

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.worker.json" },
    { "path": "./tsconfig.node.json" }
  ],
  "compilerOptions": {
    "paths": { "@/*": ["./src/*"], "@shared/*": ["./shared/*"] }
  }
}
```

`tsconfig.app.json`:

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "esnext",
    "types": ["vite/client"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "paths": { "@/*": ["./src/*"], "@shared/*": ["./shared/*"] },
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src", "shared"]
}
```

`tsconfig.worker.json`:

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.worker.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "types": ["@cloudflare/vitest-pool-workers/types"],
    "skipLibCheck": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["worker", "shared", "test", "worker-configuration.d.ts"]
}
```

`tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023"],
    "types": ["node"],
    "skipLibCheck": true,
    "module": "nodenext",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true
  },
  "include": ["vite.config.ts", "vitest.config.ts"]
}
```

`index.html`:

```html
<!doctype html>
<html lang="th">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>money-plan</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`public/favicon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#2f2822"/><text x="16" y="22" text-anchor="middle" font-family="system-ui, sans-serif" font-size="18" font-weight="700" fill="#fbf7f0">฿</text></svg>
```

`src/main.tsx` (temporary — Task 7 replaces it):

```tsx
import { createRoot } from 'react-dom/client'

createRoot(document.getElementById('root')!).render(<p>money-plan</p>)
```

- [ ] **Step 3: Install dependencies and generate Worker types**

```bash
cd /Users/chin_mini/Desktop/ChinOS/apps/money-plan
pnpm add hono@^4.13 jose@^6.2 react@^19.2 react-dom@^19.2 react-router@^8.4 recharts@^3.8 @base-ui/react@^1.8 @fontsource-variable/geist@^5.3 @tailwindcss/vite@^4.3 tailwindcss@^4.3 tw-animate-css@^1.4 class-variance-authority@^0.7 clsx@^2.1 tailwind-merge@^3.7 lucide-react@^1.47 next-themes@^0.4 sonner@^2.0 shadcn@^4.21
pnpm add -D wrangler@^4.143 @cloudflare/vite-plugin@^1.62 @cloudflare/vitest-pool-workers@^0.22 vitest@^4.1.0 vite@^8.3 @vitejs/plugin-react@^6.1 typescript@~6.0.2 @types/react@^19.2 @types/react-dom@^19.2 @types/node@^26 oxlint@^1.81
pnpm cf-typegen
```

Expected: `worker-configuration.d.ts` is created and declares `interface Env` with `DB: D1Database` and `GOOGLE_CLIENT_ID: string`. If `pnpm add` warns that vitest 4.x does not satisfy a peer, keep `vitest@^4.1.0` (the pool requires `^4.1.0`, not 5).

- [ ] **Step 4: Write the schema migration**

`migrations/0001_init.sql`:

```sql
-- money-plan schema: every user-owned row carries user_id; composite foreign keys keep one user's rows
-- from ever pointing at another user's rows. D1 enforces foreign keys (test/schema.test.ts checks it).

CREATE TABLE users (
  id          INTEGER PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,     -- lower-case, from a verified Google ID token
  name        TEXT,
  picture     TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,         -- SHA-256 (hex) of the cookie token; the token itself is never stored
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE tier_targets (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier     TEXT NOT NULL,               -- Foundation | Core | Growth | High Risk
  target   REAL NOT NULL,               -- 0..1, the four add up to 1
  PRIMARY KEY (user_id, tier)
);

CREATE TABLE budget_scenarios (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id       TEXT NOT NULL,               -- main | proj | em
  name     TEXT NOT NULL,
  note     TEXT,
  sort     INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE budget_lines (
  id        INTEGER PRIMARY KEY,
  user_id   INTEGER NOT NULL,
  scenario  TEXT NOT NULL,
  type      TEXT NOT NULL,              -- Income | Saving | Expense
  category  TEXT NOT NULL,              -- Saving lines: Saving | Investment | Education
  item      TEXT NOT NULL,
  thb       REAL NOT NULL,              -- per month, >= 0
  expr      TEXT,                       -- what was typed when it was a sum, e.g. 3638+5000
  account   TEXT,                       -- "bank/sub-account: note", optional
  sort      INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id, scenario) REFERENCES budget_scenarios(user_id, id) ON DELETE CASCADE
);
CREATE INDEX budget_lines_user ON budget_lines(user_id, scenario);

CREATE TABLE balance_items (
  id        INTEGER PRIMARY KEY,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  side      TEXT NOT NULL,              -- asset | liability
  category  TEXT NOT NULL,
  item      TEXT NOT NULL,
  tier      TEXT,                       -- NULL = not in the investment portfolio
  type      TEXT,                       -- set only when tier is set
  country   TEXT,
  active    INTEGER NOT NULL DEFAULT 1, -- 0 = not carried into new months
  sort      REAL NOT NULL DEFAULT 0,
  UNIQUE (user_id, side, category, item),
  UNIQUE (user_id, id)
);

CREATE TABLE balance_months (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month       TEXT NOT NULL,            -- YYYY-MM
  status      TEXT NOT NULL,            -- draft | closed
  updated_at  TEXT NOT NULL,
  closed_at   TEXT,
  PRIMARY KEY (user_id, month)
);

CREATE TABLE balance_entries (
  user_id     INTEGER NOT NULL,
  month       TEXT NOT NULL,
  item_id     INTEGER NOT NULL,
  thb         REAL NOT NULL,
  expr        TEXT,
  updated_at  TEXT,                     -- NULL = carried over from last month, not confirmed yet
  PRIMARY KEY (user_id, month, item_id),
  FOREIGN KEY (user_id, month) REFERENCES balance_months(user_id, month) ON DELETE CASCADE,
  FOREIGN KEY (user_id, item_id) REFERENCES balance_items(user_id, id) ON DELETE CASCADE
);

CREATE TABLE balance_transfers (
  user_id  INTEGER NOT NULL,
  month    TEXT NOT NULL,
  bank     TEXT NOT NULL,
  done_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, month, bank),
  FOREIGN KEY (user_id, month) REFERENCES balance_months(user_id, month) ON DELETE CASCADE
);
```

- [ ] **Step 5: Write the API contract**

`shared/types.ts`:

```ts
// API contract shared by the Worker and the SPA: every request/response shape lives here

export type Tier = 'Foundation' | 'Core' | 'Growth' | 'High Risk'
export const TIERS: Tier[] = ['Foundation', 'Core', 'Growth', 'High Risk']
export type TierTargets = Record<Tier, number>

export interface Me { email: string; name: string | null; picture: string | null }
export interface AuthConfig { googleClientId: string; dev: boolean }

// ---- Planning (monthly plan, three fixed scenarios) ----
export type ScenarioId = 'main' | 'proj' | 'em'
export type BudgetType = 'Income' | 'Saving' | 'Expense'
export const BUDGET_TYPES: BudgetType[] = ['Income', 'Saving', 'Expense']
export interface BudgetLineRow {
  id: number
  scenario: ScenarioId
  type: BudgetType
  category: string
  item: string
  thb: number
  expr: string | null
  account: string | null
}
export type BudgetLineInput = Pick<BudgetLineRow, 'type' | 'category' | 'item' | 'thb' | 'expr' | 'account'>
export interface Scenario { id: ScenarioId; name: string; note: string | null; lines: BudgetLineRow[] }
export interface Planning {
  scenarios: Scenario[]
  /** Emergency Funds total on the latest balance month (draft included); null before any month exists */
  ef: { month: string; status: MonthStatus; thb: number } | null
}

// ---- Balance (month-end balance sheet) ----
export type BalanceSide = 'asset' | 'liability'
export type MonthStatus = 'draft' | 'closed'
export interface BalanceRow {
  id: number
  side: BalanceSide
  category: string
  item: string
  tier: Tier | null
  type: string | null
  country: string | null
  thb: number
  expr: string | null
  confirmed: boolean
  prev: number | null
}
export interface BalanceTransfers {
  banks: { bank: string; thb: number; doneAt: string | null; subs: { sub: string | null; thb: number; items: string[]; notes: string[] }[] }[]
  skipped: { item: string; thb: number }[]
  fromIncome: { source: string; item: string; thb: number; note: string | null }[]
}
export interface Balance {
  months: { month: string; status: MonthStatus }[]          // newest first
  next: string | null                                        // the month "start next" would create
  firstMonths: string[]                                      // allowed first months (Bangkok time), newest first; [] once any month exists
  month: string | null
  status: MonthStatus | null
  prevMonth: string | null
  rows: BalanceRow[]
  hidden: { id: number; side: BalanceSide; category: string; item: string; prev: number | null }[]
  history: { month: string; assets: number; liabilities: number; net: number; draft: boolean }[]  // newest first
  targets: Record<string, number>                            // { 'Emergency Funds': 6 × ตกงาน expenses } when that plan exists
  transfers: BalanceTransfers | null
  hasClosed: boolean
}
export interface NewBalanceItem {
  side: BalanceSide
  category: string
  item: string
  tier: Tier | null
  type: string | null
  country: string | null
  thb?: number
  expr?: string | null
}
export type Classification = Pick<NewBalanceItem, 'tier' | 'type' | 'country'>

// ---- Overview (closed months only) ----
export interface BalanceGroup { category: string; thb: number; items: { item: string; thb: number }[] }
export interface Overview {
  checklist: { planning: boolean; balanceStarted: boolean; closed: boolean }
  month: string | null                                       // latest closed month; null = show the checklist
  netWorth: number
  totalAssets: number
  totalLiabilities: number
  prev: { month: string; netWorth: number } | null
  netHistory: { month: string; label: string; assets: number; liabilities: number; net: number; live: boolean }[]  // newest first
  balance: { assets: BalanceGroup[]; liabilities: BalanceGroup[] }
  categoryHistory: { month: string; label: string; live: boolean; values: Record<string, number> }[]            // newest first, assets only
  contributions: { label: string; value: number }[]          // category → change in net worth vs prev month (debt down = +)
  investTotal: number
  tiers: { tier: Tier; thb: number; pct: number; target: number; gap: number }[]
  investments: { symbol: string; tier: Tier; type: string; country: string; thb: number }[]
  ef: number                                                 // Emergency Funds total in the latest closed month
}

// ---- Sankey (money flow of one scenario) ----
export interface SankeyNode { id: string; label: string; column: number; color: string; note?: string }
export interface SankeyLink { source: string; target: string; value: number }
```

- [ ] **Step 6: Write the Worker skeleton**

`worker/env.ts`:

```ts
export interface Bindings {
  DB: D1Database
  GOOGLE_CLIENT_ID: string
  ALLOWED_EMAILS: string
  DEV_USER_EMAIL?: string
  /** Tests only: a JWKS JSON used instead of Google's keys */
  GOOGLE_JWKS_JSON?: string
}

export type AppEnv = { Bindings: Bindings; Variables: { uid: number; email: string } }
```

`worker/http.ts`:

```ts
import type { Context, MiddlewareHandler } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { isMonth } from '../shared/month'

// no parameter properties: tsconfig has erasableSyntaxOnly
export class HttpError extends Error {
  status: ContentfulStatusCode
  extra?: Record<string, unknown>
  constructor(status: ContentfulStatusCode, message: string, extra?: Record<string, unknown>) {
    super(message)
    this.status = status
    this.extra = extra
  }
}
export const bad = (message: string) => new HttpError(400, message)
export const notFound = (message = 'ไม่พบข้อมูล') => new HttpError(404, message)
export const conflict = (message: string) => new HttpError(409, message)

/** Writes must be JSON: an HTML form on another site cannot send that without a CORS preflight (we never allow CORS) */
export const jsonOnly: MiddlewareHandler = async (c, next) => {
  const m = c.req.method
  if (m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS' && !(c.req.header('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return c.json({ error: 'ต้องส่งข้อมูลเป็น JSON' }, 415)
  }
  await next()
}

export async function body<T = Record<string, unknown>>(c: Context): Promise<T> {
  try {
    return await c.req.json<T>()
  } catch {
    throw bad('ข้อมูลที่ส่งมาไม่ใช่ JSON ที่ถูกต้อง')
  }
}

export function monthParam(c: Context): string {
  const m = c.req.param('month') ?? ''
  if (!isMonth(m)) throw bad('เดือนต้องอยู่ในรูปแบบ YYYY-MM')
  return m
}

export function idParam(c: Context, key = 'id'): number {
  const n = Number(c.req.param(key))
  if (!Number.isInteger(n) || n <= 0) throw notFound()
  return n
}
```

`worker/http.ts` imports `isMonth` from `shared/month.ts`, which Task 4 fills in; create it now with just that function so the import resolves — `shared/month.ts`:

```ts
export const isMonth = (s: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s)
```

`worker/db.ts`:

```ts
export type Db = D1Database

export async function all<T>(db: Db, sql: string, ...p: unknown[]): Promise<T[]> {
  return (await db.prepare(sql).bind(...p).all<T>()).results
}
export function one<T>(db: Db, sql: string, ...p: unknown[]): Promise<T | null> {
  return db.prepare(sql).bind(...p).first<T>()
}
export function run(db: Db, sql: string, ...p: unknown[]) {
  return db.prepare(sql).bind(...p).run()
}
/** A bound statement for db.batch([...]) */
export const stmt = (db: Db, sql: string, ...p: unknown[]) => db.prepare(sql).bind(...p)
export const now = () => new Date().toISOString()
export const isConstraint = (e: unknown) => e instanceof Error && /constraint/i.test(e.message)
```

`worker/index.ts`:

```ts
import { Hono } from 'hono'
import type { AppEnv } from './env'
import { HttpError, jsonOnly } from './http'

const app = new Hono<AppEnv>()

app.onError((e, c) => {
  if (e instanceof HttpError) return c.json({ error: e.message, ...e.extra }, e.status)
  console.error(e)
  return c.json({ error: 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง' }, 500)
})
app.notFound((c) => c.json({ error: 'ไม่พบ' }, 404))

app.use('/api/*', jsonOnly)
app.get('/api/health', (c) => c.json({ ok: true }))

// ---- routes added by later tasks go below this line ----

export default app
```

- [ ] **Step 7: Write the test harness**

`test/apply-migrations.ts`:

```ts
import { applyD1Migrations, env } from 'cloudflare:test'

type Migrations = Parameters<typeof applyD1Migrations>[1]
const e = env as unknown as { DB: D1Database; TEST_MIGRATIONS: Migrations }
await applyD1Migrations(e.DB, e.TEST_MIGRATIONS)
```

`test/helpers.ts`:

```ts
import { env } from 'cloudflare:test'
import { importJWK, SignJWT } from 'jose'
import type { Bindings } from '../worker/env'
import app from '../worker/index'

export type TestEnv = Bindings & { TEST_PRIVATE_JWK: string }
export const testEnv = env as unknown as TestEnv
export const ORIGIN = 'https://money-plan.test'

// Emails allowed to log in during this test file; ALLOWED_EMAILS is rebuilt from this set on every call()
const allowed = new Set<string>()
export const allow = (...emails: string[]) => { for (const e of emails) allowed.add(e.toLowerCase()) }
export const disallow = (email: string) => { allowed.delete(email.toLowerCase()) }

let n = 0
export const uniqueEmail = (prefix = 'user') => `${prefix}-${++n}-${crypto.randomUUID().slice(0, 8)}@test.dev`

/** A Google-style ID token signed with the test key (or another key to test bad signatures) */
export async function googleToken(email: string, opts: {
  aud?: string; iss?: string; expiresIn?: string | number; verified?: boolean; key?: CryptoKey
} = {}) {
  const key = opts.key ?? ((await importJWK(JSON.parse(testEnv.TEST_PRIVATE_JWK), 'RS256')) as CryptoKey)
  return new SignJWT({ email, email_verified: opts.verified ?? true, name: `Name ${email}`, picture: 'https://example.com/p.png' })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(opts.iss ?? 'https://accounts.google.com')
    .setAudience(opts.aud ?? testEnv.GOOGLE_CLIENT_ID)
    .setSubject(`sub-${email}`)
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? '1h')
    .sign(key)
}

export interface CallInit {
  method?: string
  json?: unknown                     // sets content-type: application/json and defaults the method to POST
  body?: string
  headers?: Record<string, string>
  cookie?: string
  env?: Partial<TestEnv>
  origin?: string
}
export async function call(path: string, init: CallInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  if (init.cookie) headers.set('cookie', init.cookie)
  let body = init.body
  if (init.json !== undefined) {
    headers.set('content-type', 'application/json')
    body = JSON.stringify(init.json)
  }
  const bindings = { ...testEnv, ALLOWED_EMAILS: [...allowed].join(','), ...init.env }
  const method = init.method ?? (init.json !== undefined ? 'POST' : 'GET')
  return app.request(`${init.origin ?? ORIGIN}${path}`, { method, headers, body }, bindings)
}

/** Allow the email, log in with a Google token, return the session cookie ("mp_session=…") */
export async function login(email = uniqueEmail()): Promise<{ email: string; cookie: string }> {
  allow(email)
  const res = await call('/api/auth/google', { json: { credential: await googleToken(email) } })
  if (res.status !== 200) throw new Error(`login failed ${res.status}: ${await res.text()}`)
  return { email, cookie: (res.headers.get('set-cookie') ?? '').split(';')[0] }
}

/** JSON body of a response that must be 2xx */
export async function ok<T = any>(res: Response | Promise<Response>): Promise<T> {
  const r = await res
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`)
  return r.json() as Promise<T>
}

export async function uidOf(email: string): Promise<number> {
  const row = await testEnv.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email.toLowerCase()).first<{ id: number }>()
  if (!row) throw new Error(`no user ${email}`)
  return row.id
}

/** Run SQL straight against the test D1 (setup + assertions) */
export const sql = (query: string, ...p: unknown[]) => testEnv.DB.prepare(query).bind(...p)
```

- [ ] **Step 8: Write the failing schema test**

`test/schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { call, sql } from './helpers'

describe('scaffold', () => {
  it('answers health', async () => {
    const r = await call('/api/health')
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true })
  })

  it('creates every table', async () => {
    const { results } = await sql("SELECT name FROM sqlite_master WHERE type = 'table'").all<{ name: string }>()
    expect(results.map((r) => r.name)).toEqual(expect.arrayContaining([
      'users', 'sessions', 'tier_targets', 'budget_scenarios', 'budget_lines',
      'balance_items', 'balance_months', 'balance_entries', 'balance_transfers',
    ]))
  })

  it('enforces foreign keys', async () => {
    await expect(sql("INSERT INTO balance_months (user_id, month, status, updated_at) VALUES (999999, '2026-01', 'draft', 'x')").run())
      .rejects.toThrow(/FOREIGN KEY/i)
  })
})
```

- [ ] **Step 9: Run the tests**

Run: `pnpm test`
Expected: 3 passed. If "enforces foreign keys" fails, stop and report to the main session: the runtime is not enforcing foreign keys, so the spec's DB-level guarantee (spec §6.3) needs a decision before going on. Do not work around it.

- [ ] **Step 10: Typecheck and build**

Run: `pnpm typecheck && pnpm build`
Expected: no type errors; `dist/` contains the client assets and the worker bundle.

- [ ] **Step 11: Commit**

```bash
git config user.email   # must print c.soonue@gmail.com
git add -A
git commit -m "Scaffold money-plan: Vite + Hono Worker on Cloudflare, D1 schema, workerd test harness"
```

---

### Task 2: Google login, sessions and the allowlist

**Files:**
- Create: `worker/users.ts`, `worker/auth.ts`
- Modify: `worker/index.ts` (auth routes, `requireUser`, `/api/me`)
- Test: `test/auth.test.ts`

**Interfaces:**
- Consumes: `Bindings`, `AppEnv` (`worker/env.ts`); `HttpError`, `body` (`worker/http.ts`); `all/one/run/stmt/now/isConstraint` (`worker/db.ts`); `TIERS`, `Me`, `AuthConfig`, `Tier` (`shared/types.ts`); test helpers.
- Produces:
  - `worker/users.ts`: `interface GoogleProfile { email: string; name: string | null; picture: string | null }`, `DEFAULT_SCENARIOS`, `DEFAULT_TARGETS: Record<Tier, number>`, `findOrCreateUser(db, profile): Promise<Me & { id: number }>`, `getMe(db, uid): Promise<Me>`.
  - `worker/auth.ts`: `COOKIE = 'mp_session'`, `allowed(env, email): boolean`, `verifyGoogleToken(env, credential): Promise<GoogleProfile>`, `hashToken(token): Promise<string>`, `authRoutes` (Hono sub-app: `GET /config`, `POST /google`, `POST /logout`), `requireUser` middleware (sets `c.var.uid`, `c.var.email`).
  - HTTP: `GET /api/auth/config` → `AuthConfig`; `POST /api/auth/google { credential }` → `Me` + cookie; `POST /api/auth/logout` → `{ ok: true }`; `GET /api/me` → `Me`.

- [ ] **Step 1: Write the failing tests**

`test/auth.test.ts`:

```ts
import { generateKeyPair } from 'jose'
import { describe, expect, it } from 'vitest'
import { allow, call, disallow, googleToken, login, ok, sql, testEnv, uidOf, uniqueEmail } from './helpers'

const count = async (query: string, ...p: unknown[]) => (await sql(query, ...p).first<{ n: number }>())!.n

describe('Google login', () => {
  it('creates the user with defaults and sets a session cookie', async () => {
    const email = uniqueEmail()
    allow(email)
    const res = await call('/api/auth/google', { json: { credential: await googleToken(email) } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ email, name: `Name ${email}`, picture: 'https://example.com/p.png' })
    const cookie = res.headers.get('set-cookie')!
    expect(cookie).toMatch(/^mp_session=[0-9a-f]{64};/)
    for (const flag of [/HttpOnly/, /Secure/, /SameSite=Lax/, /Path=\//, /Max-Age=2592000/]) expect(cookie).toMatch(flag)
    const uid = await uidOf(email)
    expect(await count('SELECT COUNT(*) AS n FROM budget_scenarios WHERE user_id = ?', uid)).toBe(3)
    expect(await count('SELECT COUNT(*) AS n FROM tier_targets WHERE user_id = ?', uid)).toBe(4)
    const names = (await sql('SELECT id, name FROM budget_scenarios WHERE user_id = ? ORDER BY sort', uid).all<{ id: string; name: string }>()).results
    expect(names).toEqual([{ id: 'main', name: 'ปัจจุบัน' }, { id: 'proj', name: 'Projection' }, { id: 'em', name: 'ตกงาน' }])
  })

  it('keeps one user row across logins', async () => {
    const { email } = await login()
    await login(email)
    expect(await count('SELECT COUNT(*) AS n FROM users WHERE email = ?', email)).toBe(1)
    expect(await count('SELECT COUNT(*) AS n FROM budget_scenarios WHERE user_id = ?', await uidOf(email))).toBe(3)
  })

  it('stores only a hash of the session token', async () => {
    const { email, cookie } = await login()
    const token = cookie.split('=')[1]
    const rows = (await sql('SELECT token_hash FROM sessions WHERE user_id = ?', await uidOf(email)).all<{ token_hash: string }>()).results
    expect(rows).toHaveLength(1)
    expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(rows[0].token_hash).not.toBe(token)
  })

  it.each([
    ['a wrong audience', { aud: 'someone-else.apps.googleusercontent.com' }],
    ['a wrong issuer', { iss: 'https://evil.example' }],
    ['an expired token', { expiresIn: Math.floor(Date.now() / 1000) - 60 }],
    ['an unverified email', { verified: false }],
  ])('rejects %s', async (_, opts) => {
    const email = uniqueEmail()
    allow(email)
    const res = await call('/api/auth/google', { json: { credential: await googleToken(email, opts) } })
    expect(res.status).toBe(401)
    expect(await count('SELECT COUNT(*) AS n FROM users WHERE email = ?', email)).toBe(0)
  })

  it('rejects a token signed by another key', async () => {
    const email = uniqueEmail()
    allow(email)
    const { privateKey } = await generateKeyPair('RS256')
    const res = await call('/api/auth/google', { json: { credential: await googleToken(email, { key: privateKey }) } })
    expect(res.status).toBe(401)
  })

  it('rejects garbage and a missing credential', async () => {
    expect((await call('/api/auth/google', { json: { credential: 'abc' } })).status).toBe(401)
    expect((await call('/api/auth/google', { json: {} })).status).toBe(400)
  })

  it('refuses emails outside the allowlist without creating a user', async () => {
    const email = uniqueEmail('stranger')
    const res = await call('/api/auth/google', { json: { credential: await googleToken(email) } })
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'not_allowed', email })
    expect(await count('SELECT COUNT(*) AS n FROM users WHERE email = ?', email)).toBe(0)
  })
})

describe('session', () => {
  it('needs a cookie', async () => {
    expect((await call('/api/me')).status).toBe(401)
  })

  it('returns the logged-in user', async () => {
    const { email, cookie } = await login()
    expect(await ok(call('/api/me', { cookie }))).toEqual({ email, name: `Name ${email}`, picture: 'https://example.com/p.png' })
  })

  it('expires', async () => {
    const { email, cookie } = await login()
    await sql("UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000Z' WHERE user_id = ?", await uidOf(email)).run()
    expect((await call('/api/me', { cookie })).status).toBe(401)
  })

  it('ends on logout', async () => {
    const { cookie } = await login()
    const res = await call('/api/auth/logout', { json: {}, cookie })
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toMatch(/mp_session=;.*Max-Age=0/)
    expect((await call('/api/me', { cookie })).status).toBe(401)
  })

  it('stops working when the email leaves the allowlist', async () => {
    const { email, cookie } = await login()
    disallow(email)
    const res = await call('/api/me', { cookie })
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'not_allowed', email })
  })

  it('answers unknown API paths with JSON 404 once logged in', async () => {
    const { cookie } = await login()
    const res = await call('/api/nope', { cookie })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'ไม่พบ' })
  })
})

describe('JSON-only writes', () => {
  it('rejects a form post', async () => {
    const res = await call('/api/auth/logout', { method: 'POST', body: 'x=1', headers: { 'content-type': 'application/x-www-form-urlencoded' } })
    expect(res.status).toBe(415)
  })
})

describe('dev bypass', () => {
  const dev = { DEV_USER_EMAIL: 'Dev@Example.com' }

  it('acts as DEV_USER_EMAIL on localhost', async () => {
    const me = await ok(call('/api/me', { origin: 'http://localhost:5173', env: dev }))
    expect(me.email).toBe('dev@example.com')
  })

  it('is ignored on any other host', async () => {
    expect((await call('/api/me', { env: dev })).status).toBe(401)
  })

  it('shows in the auth config', async () => {
    expect(await ok(call('/api/auth/config', { origin: 'http://localhost:5173', env: dev }))).toEqual({ googleClientId: testEnv.GOOGLE_CLIENT_ID, dev: true })
    expect(await ok(call('/api/auth/config'))).toEqual({ googleClientId: testEnv.GOOGLE_CLIENT_ID, dev: false })
  })
})
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `pnpm test test/auth.test.ts`
Expected: FAIL — `/api/auth/google` and `/api/me` answer 404.

- [ ] **Step 3: Write `worker/users.ts`**

```ts
import { TIERS, type Me, type Tier } from '../shared/types'
import { isConstraint, now, one, run, stmt, type Db } from './db'

export interface GoogleProfile { email: string; name: string | null; picture: string | null }

export const DEFAULT_SCENARIOS = [
  { id: 'main', name: 'ปัจจุบัน', note: null, sort: 0 },
  { id: 'proj', name: 'Projection', note: 'แผนอนาคต เช่น หลังขึ้นเงินเดือน แต่งงาน ย้ายบ้าน', sort: 1 },
  { id: 'em', name: 'ตกงาน', note: 'รายจ่ายที่ยังต้องจ่ายถ้าไม่มีรายได้ · ใช้คำนวณเป้าเงินสำรองฉุกเฉิน', sort: 2 },
] as const

export const DEFAULT_TARGETS: Record<Tier, number> = { Foundation: 0.1, Core: 0.4, Growth: 0.35, 'High Risk': 0.15 }

/** The user for a verified Google profile; a first login also creates the three scenarios and the tier targets in one batch */
export async function findOrCreateUser(db: Db, p: GoogleProfile): Promise<Me & { id: number }> {
  const email = p.email.toLowerCase()
  const hit = await one<{ id: number }>(db, 'SELECT id FROM users WHERE email = ?', email)
  if (hit) {
    await run(db, 'UPDATE users SET name = COALESCE(?, name), picture = COALESCE(?, picture) WHERE id = ?', p.name, p.picture, hit.id)
  } else {
    try {
      await db.batch([
        stmt(db, 'INSERT INTO users (email, name, picture, created_at) VALUES (?, ?, ?, ?)', email, p.name, p.picture, now()),
        ...DEFAULT_SCENARIOS.map((s) => stmt(db,
          'INSERT INTO budget_scenarios (user_id, id, name, note, sort) SELECT id, ?, ?, ?, ? FROM users WHERE email = ?',
          s.id, s.name, s.note, s.sort, email)),
        ...TIERS.map((t) => stmt(db,
          'INSERT INTO tier_targets (user_id, tier, target) SELECT id, ?, ? FROM users WHERE email = ?',
          t, DEFAULT_TARGETS[t], email)),
      ])
    } catch (e) {
      if (!isConstraint(e)) throw e // two first logins at once: the other request created the user
    }
  }
  return (await one<Me & { id: number }>(db, 'SELECT id, email, name, picture FROM users WHERE email = ?', email))!
}

export async function getMe(db: Db, uid: number): Promise<Me> {
  return (await one<Me>(db, 'SELECT email, name, picture FROM users WHERE id = ?', uid))!
}
```

- [ ] **Step 4: Write `worker/auth.ts`**

```ts
import { Hono, type Context, type MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { createLocalJWKSet, createRemoteJWKSet, errors, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose'
import type { AuthConfig } from '../shared/types'
import { now, one, run, stmt } from './db'
import type { AppEnv, Bindings } from './env'
import { bad, body, HttpError } from './http'
import { findOrCreateUser, getMe, type GoogleProfile } from './users'

export const COOKIE = 'mp_session'
const SESSION_DAYS = 30
const GOOGLE_JWKS = 'https://www.googleapis.com/oauth2/v3/certs'
const ISSUERS = ['accounts.google.com', 'https://accounts.google.com']

let remoteKeys: JWTVerifyGetKey | null = null
const googleKeys = (env: Bindings): JWTVerifyGetKey =>
  env.GOOGLE_JWKS_JSON ? createLocalJWKSet(JSON.parse(env.GOOGLE_JWKS_JSON)) : (remoteKeys ??= createRemoteJWKSet(new URL(GOOGLE_JWKS)))

export const allowed = (env: Bindings, email: string) =>
  env.ALLOWED_EMAILS.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase())

/** Check a Google ID token: signature (Google's keys), issuer, audience = our client id, expiry, verified email */
export async function verifyGoogleToken(env: Bindings, credential: string): Promise<GoogleProfile> {
  let payload: JWTPayload
  try {
    ({ payload } = await jwtVerify(credential, googleKeys(env), { issuer: ISSUERS, audience: env.GOOGLE_CLIENT_ID }))
  } catch (e) {
    if (e instanceof errors.JWKSTimeout || !(e instanceof errors.JOSEError)) throw new HttpError(503, 'ระบบ login ของ Google ไม่ตอบ ลองใหม่อีกครั้ง')
    throw new HttpError(401, 'token ของ Google ไม่ถูกต้องหรือหมดอายุ')
  }
  const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : ''
  if (!email || payload.email_verified !== true) throw new HttpError(401, 'บัญชี Google นี้ยังไม่ได้ยืนยันอีเมล')
  return {
    email,
    name: typeof payload.name === 'string' ? payload.name : null,
    picture: typeof payload.picture === 'string' ? payload.picture : null,
  }
}

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
export const hashToken = async (token: string) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))))

async function startSession(c: Context<AppEnv>, uid: number) {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const token = hex(bytes)
  const t = now()
  await c.env.DB.batch([
    stmt(c.env.DB, 'DELETE FROM sessions WHERE user_id = ? AND expires_at < ?', uid, t),
    stmt(c.env.DB, 'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
      await hashToken(token), uid, t, new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString()),
  ])
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_DAYS * 86_400,
  })
}

/** DEV_USER_EMAIL acts as the logged-in user, but only for requests to localhost */
function devEmail(c: Context<AppEnv>): string | null {
  const email = c.env.DEV_USER_EMAIL?.trim().toLowerCase()
  if (!email) return null
  const host = new URL(c.req.url).hostname
  return host === 'localhost' || host === '127.0.0.1' ? email : null
}

export const authRoutes = new Hono<AppEnv>()

authRoutes.get('/config', (c) => {
  const config: AuthConfig = { googleClientId: c.env.GOOGLE_CLIENT_ID, dev: devEmail(c) != null }
  return c.json(config)
})

authRoutes.post('/google', async (c) => {
  const { credential } = await body<{ credential?: unknown }>(c)
  if (typeof credential !== 'string' || !credential) throw bad('ไม่มี credential จาก Google')
  const profile = await verifyGoogleToken(c.env, credential)
  if (!allowed(c.env, profile.email)) throw new HttpError(403, 'not_allowed', { email: profile.email })
  const user = await findOrCreateUser(c.env.DB, profile)
  await startSession(c, user.id)
  return c.json(await getMe(c.env.DB, user.id))
})

authRoutes.post('/logout', async (c) => {
  const token = getCookie(c, COOKIE)
  if (token) await run(c.env.DB, 'DELETE FROM sessions WHERE token_hash = ?', await hashToken(token))
  deleteCookie(c, COOKIE, { path: '/' })
  return c.json({ ok: true })
})

const PUBLIC = ['/api/auth/', '/api/health']

/** Every other /api/* route needs a live session whose email is still on the allowlist */
export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (PUBLIC.some((p) => c.req.path.startsWith(p))) return next()
  const dev = devEmail(c)
  if (dev) {
    const user = await findOrCreateUser(c.env.DB, { email: dev, name: 'Dev', picture: null })
    c.set('uid', user.id)
    c.set('email', user.email)
    return next()
  }
  const token = getCookie(c, COOKIE)
  if (!token) return c.json({ error: 'กรุณาเข้าสู่ระบบ' }, 401)
  const row = await one<{ user_id: number; email: string }>(c.env.DB,
    'SELECT s.user_id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?',
    await hashToken(token), now())
  if (!row) return c.json({ error: 'session หมดอายุ กรุณาเข้าสู่ระบบใหม่' }, 401)
  if (!allowed(c.env, row.email)) return c.json({ error: 'not_allowed', email: row.email }, 403)
  c.set('uid', row.user_id)
  c.set('email', row.email)
  await next()
}
```

- [ ] **Step 5: Wire the routes**

In `worker/index.ts`, add the imports at the top:

```ts
import { authRoutes, requireUser } from './auth'
import { getMe } from './users'
```

and add below `// ---- routes added by later tasks go below this line ----`:

```ts
app.route('/api/auth', authRoutes)
app.use('/api/*', requireUser)
app.get('/api/me', async (c) => c.json(await getMe(c.env.DB, c.var.uid)))
```

- [ ] **Step 6: Run the tests**

Run: `pnpm test`
Expected: all tests in `schema.test.ts` and `auth.test.ts` pass.

- [ ] **Step 7: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git config user.email   # c.soonue@gmail.com
git add worker/users.ts worker/auth.ts worker/index.ts test/auth.test.ts
git commit -m "Auth: Google ID token login, D1 sessions behind an HttpOnly cookie, email allowlist, localhost dev bypass"
```

---

### Task 3: Planning API

**Files:**
- Create: `shared/planning.ts`, `worker/planning.ts`
- Modify: `worker/index.ts` (planning routes)
- Test: `test/shared-planning.test.ts`, `test/planning.test.ts`

**Interfaces:**
- Consumes: `Planning`, `BudgetLineRow`, `BudgetLineInput`, `BudgetType`, `BUDGET_TYPES`, `ScenarioId`, `MonthStatus` (`shared/types.ts`); db helpers; `bad/notFound/conflict/body/idParam` (`worker/http.ts`); test helpers.
- Produces:
  - `shared/planning.ts`: `type Part = 'expense' | 'saving' | 'invest'`, `partOf(line): Part | null`, `interface Totals { income; expense; saving; invest; left }`, `totals(lines): Totals`, `debtOf(lines): number`, `EF_MONTHS = 6`, `interface EfStatus { thb; target: number | null; months: number | null; netMonths: number | null }`, `efStatus(thb, em: Totals | null): EfStatus`.
  - `worker/planning.ts`: `isScenario(s)`, `getPlanning(db, uid): Promise<Planning>`, `latestEf(db, uid)`, `addLine(db, uid, scenario, input)`, `updateLine(db, uid, id, patch)`, `deleteLine(db, uid, id)`, `copyScenario(db, uid, to, from)`.
  - HTTP: `GET /api/planning`; `POST /api/planning/:scenario/lines`; `PATCH /api/planning/lines/:id`; `DELETE /api/planning/lines/:id`; `POST /api/planning/:scenario/copy { from: 'main' }` — every write answers the fresh `Planning`.

- [ ] **Step 1: Write the failing pure tests**

`test/shared-planning.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { debtOf, efStatus, partOf, totals } from '../shared/planning'
import type { BudgetType } from '../shared/types'

const L = (type: BudgetType, category: string, thb: number) => ({ type, category, thb })

describe('planning math', () => {
  it('splits saving from investing', () => {
    expect(partOf(L('Saving', 'Investment', 1))).toBe('invest')
    expect(partOf(L('Saving', 'Saving', 1))).toBe('saving')
    expect(partOf(L('Expense', 'Housing', 1))).toBe('expense')
    expect(partOf(L('Income', 'Salary', 1))).toBeNull()
  })

  it('totals a scenario', () => {
    const t = totals([L('Income', 'Salary', 60000), L('Income', 'Others', 5000), L('Saving', 'Saving', 8000), L('Saving', 'Investment', 10000), L('Expense', 'Housing', 41000)])
    expect(t).toEqual({ income: 65000, expense: 41000, saving: 8000, invest: 10000, left: 6000 })
  })

  it('lets left go negative when the plan spends more than the income', () => {
    expect(totals([L('Income', 'Salary', 10000), L('Expense', 'Housing', 12000)]).left).toBe(-2000)
  })

  it('counts only mortgage and instalments as debt', () => {
    expect(debtOf([L('Expense', 'Mortgage', 18000), L('Expense', 'Debt', 2000), L('Expense', 'Housing', 9000), L('Saving', 'Debt', 500)])).toBe(20000)
  })

  it('measures the emergency fund against the job-loss scenario', () => {
    expect(efStatus(90000, null)).toEqual({ thb: 90000, target: null, months: null, netMonths: null })
    expect(efStatus(90000, totals([L('Income', 'Rental', 0)]))).toEqual({ thb: 90000, target: null, months: null, netMonths: null })
    expect(efStatus(90000, totals([L('Expense', 'Housing', 30000)]))).toEqual({ thb: 90000, target: 180000, months: 3, netMonths: 3 })
    expect(efStatus(90000, totals([L('Expense', 'Housing', 30000), L('Income', 'Rental', 12000)]))).toEqual({ thb: 90000, target: 180000, months: 3, netMonths: 5 })
    expect(efStatus(90000, totals([L('Expense', 'Housing', 30000), L('Income', 'Rental', 30000)])).netMonths).toBeNull()
  })
})
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm test test/shared-planning.test.ts`
Expected: FAIL — cannot resolve `../shared/planning`.

- [ ] **Step 3: Write `shared/planning.ts`**

```ts
import type { BudgetLineRow } from './types'

export type Part = 'expense' | 'saving' | 'invest'
type LineLike = Pick<BudgetLineRow, 'type' | 'category' | 'thb'>

export const partOf = (l: Pick<BudgetLineRow, 'type' | 'category'>): Part | null =>
  l.type === 'Expense' ? 'expense' : l.type === 'Saving' ? (l.category === 'Investment' ? 'invest' : 'saving') : null

export interface Totals { income: number; expense: number; saving: number; invest: number; left: number }

export function totals(lines: LineLike[]): Totals {
  const t = { income: 0, expense: 0, saving: 0, invest: 0 }
  for (const l of lines) {
    if (l.type === 'Income') t.income += l.thb
    else {
      const p = partOf(l)
      if (p) t[p] += l.thb
    }
  }
  return { ...t, left: t.income - t.expense - t.saving - t.invest }
}

/** Mortgage + instalments per month: the numerator of the debt-service ratio */
export const debtOf = (lines: LineLike[]) =>
  lines.filter((l) => l.type === 'Expense' && (l.category === 'Mortgage' || l.category === 'Debt')).reduce((s, l) => s + l.thb, 0)

export const EF_MONTHS = 6
export interface EfStatus { thb: number; target: number | null; months: number | null; netMonths: number | null }

/**
 * Emergency fund against the job-loss scenario: target = 6 × its expenses, months = fund ÷ expenses,
 * netMonths = fund ÷ (expenses − income that keeps coming, e.g. rent); null when that income covers the expenses.
 */
export function efStatus(thb: number, em: Totals | null): EfStatus {
  if (!em || em.expense <= 0) return { thb, target: null, months: null, netMonths: null }
  return {
    thb,
    target: EF_MONTHS * em.expense,
    months: thb / em.expense,
    netMonths: em.expense > em.income ? thb / (em.expense - em.income) : null,
  }
}
```

- [ ] **Step 4: Run the pure tests**

Run: `pnpm test test/shared-planning.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing API tests**

`test/planning.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Planning } from '../shared/types'
import { call, login, ok, sql, uidOf } from './helpers'

const get = (cookie: string) => ok<Planning>(call('/api/planning', { cookie }))
const add = (cookie: string, scenario: string, line: Record<string, unknown>) => call(`/api/planning/${scenario}/lines`, { cookie, json: line })
const line = (over: Record<string, unknown> = {}) => ({ type: 'Expense', category: 'Housing', item: 'ค่าเช่าบ้าน', thb: 9000, expr: null, account: null, ...over })
const main = (p: Planning) => p.scenarios.find((s) => s.id === 'main')!

describe('planning', () => {
  it('starts with three empty scenarios and no emergency fund', async () => {
    const { cookie } = await login()
    const p = await get(cookie)
    expect(p.scenarios.map((s) => [s.id, s.name, s.lines.length])).toEqual([['main', 'ปัจจุบัน', 0], ['proj', 'Projection', 0], ['em', 'ตกงาน', 0]])
    expect(p.ef).toBeNull()
  })

  it('adds, edits and deletes lines', async () => {
    const { cookie } = await login()
    let p = await ok<Planning>(add(cookie, 'main', line({ type: 'Income', category: 'Salary', item: 'เงินเดือน', thb: 60000.456, account: 'SCB/เงินเดือน' })))
    const l = main(p).lines[0]
    expect(l).toMatchObject({ type: 'Income', category: 'Salary', item: 'เงินเดือน', thb: 60000.46, account: 'SCB/เงินเดือน', scenario: 'main' })
    p = await ok<Planning>(call(`/api/planning/lines/${l.id}`, { method: 'PATCH', cookie, json: { thb: 61000, item: '  เงินเดือนใหม่ ', account: '' } }))
    expect(main(p).lines[0]).toMatchObject({ thb: 61000, item: 'เงินเดือนใหม่', account: null })
    p = await ok<Planning>(call(`/api/planning/lines/${l.id}`, { method: 'DELETE', cookie, json: {} }))
    expect(main(p).lines).toEqual([])
    expect((await call(`/api/planning/lines/${l.id}`, { method: 'DELETE', cookie, json: {} })).status).toBe(404)
  })

  it.each([
    ['an unknown type', { type: 'Bonus' }],
    ['an empty item', { item: '   ' }],
    ['a negative amount', { thb: -1 }],
    ['an amount with a comma', { thb: '1,000' }],
    ['a null amount', { thb: null }],
    ['a boolean amount', { thb: true }],
  ])('rejects %s', async (_, over) => {
    const { cookie } = await login()
    const res = await add(cookie, 'main', line(over))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toEqual(expect.any(String))
  })

  it('404s an unknown scenario and an unknown line', async () => {
    const { cookie } = await login()
    expect((await add(cookie, 'other', line())).status).toBe(404)
    expect((await call('/api/planning/lines/999999', { method: 'PATCH', cookie, json: { thb: 1 } })).status).toBe(404)
  })

  it('copies only expenses into ตกงาน and everything into Projection', async () => {
    const { cookie } = await login()
    await add(cookie, 'main', line({ type: 'Income', category: 'Salary', item: 'เงินเดือน', thb: 60000 }))
    await add(cookie, 'main', line({ type: 'Saving', category: 'Investment', item: 'RMF', thb: 3000 }))
    await add(cookie, 'main', line({ item: 'ค่าเช่าบ้าน', thb: 9000, account: 'KBank' }))
    let p = await ok<Planning>(call('/api/planning/em/copy', { cookie, json: { from: 'main' } }))
    expect(p.scenarios.find((s) => s.id === 'em')!.lines.map((l) => [l.type, l.item, l.thb, l.account])).toEqual([['Expense', 'ค่าเช่าบ้าน', 9000, 'KBank']])
    p = await ok<Planning>(call('/api/planning/proj/copy', { cookie, json: { from: 'main' } }))
    expect(p.scenarios.find((s) => s.id === 'proj')!.lines.map((l) => l.item)).toEqual(['เงินเดือน', 'RMF', 'ค่าเช่าบ้าน'])
    expect((await call('/api/planning/em/copy', { cookie, json: { from: 'main' } })).status).toBe(409)
  })

  it('copies only from main and only into proj or em', async () => {
    const { cookie } = await login()
    expect((await call('/api/planning/main/copy', { cookie, json: { from: 'main' } })).status).toBe(400)
    expect((await call('/api/planning/em/copy', { cookie, json: { from: 'proj' } })).status).toBe(400)
  })

  it('reports the latest Emergency Funds balance, draft included', async () => {
    const { email, cookie } = await login()
    const uid = await uidOf(email)
    await sql("INSERT INTO balance_months (user_id, month, status, updated_at) VALUES (?, '2026-07', 'closed', 't'), (?, '2026-08', 'draft', 't')", uid, uid).run()
    const ef = await sql("INSERT INTO balance_items (user_id, side, category, item) VALUES (?, 'asset', 'Emergency Funds', 'EF') RETURNING id", uid).first<{ id: number }>()
    const cash = await sql("INSERT INTO balance_items (user_id, side, category, item) VALUES (?, 'asset', 'Cash', 'Cash') RETURNING id", uid).first<{ id: number }>()
    await sql("INSERT INTO balance_entries (user_id, month, item_id, thb) VALUES (?, '2026-07', ?, 40000), (?, '2026-08', ?, 50000), (?, '2026-08', ?, 10000)",
      uid, ef!.id, uid, ef!.id, uid, cash!.id).run()
    expect((await get(cookie)).ef).toEqual({ month: '2026-08', status: 'draft', thb: 50000 })
  })
})
```

- [ ] **Step 6: Run to see them fail**

Run: `pnpm test test/planning.test.ts`
Expected: FAIL — `/api/planning` answers 404.

- [ ] **Step 7: Write `worker/planning.ts`**

```ts
// Planning page: the monthly plan (income / saving & investing / expenses) in three fixed scenarios per user
import { BUDGET_TYPES, type BudgetLineInput, type BudgetLineRow, type BudgetType, type MonthStatus, type Planning, type ScenarioId } from '../shared/types'
import { all, one, run, type Db } from './db'
import { bad, conflict, notFound } from './http'

const SCENARIO_IDS: ScenarioId[] = ['main', 'proj', 'em']
export const isScenario = (s: string): s is ScenarioId => (SCENARIO_IDS as string[]).includes(s)

/** Emergency Funds total on the user's latest balance month (draft included) */
export function latestEf(db: Db, uid: number) {
  return one<{ month: string; status: MonthStatus; thb: number }>(db, `
    SELECT m.month, m.status, COALESCE(SUM(CASE WHEN i.category = 'Emergency Funds' THEN e.thb END), 0) AS thb
    FROM balance_months m
    LEFT JOIN balance_entries e ON e.user_id = m.user_id AND e.month = m.month
    LEFT JOIN balance_items i ON i.user_id = e.user_id AND i.id = e.item_id
    WHERE m.user_id = ?
    GROUP BY m.month, m.status
    ORDER BY m.month DESC LIMIT 1`, uid)
}

export async function getPlanning(db: Db, uid: number): Promise<Planning> {
  const [scenarios, lines, ef] = await Promise.all([
    all<{ id: ScenarioId; name: string; note: string | null }>(db, 'SELECT id, name, note FROM budget_scenarios WHERE user_id = ? ORDER BY sort, id', uid),
    all<BudgetLineRow>(db, `SELECT id, scenario, type, category, item, thb, expr, account FROM budget_lines WHERE user_id = ?
      ORDER BY CASE type WHEN 'Income' THEN 0 WHEN 'Saving' THEN 1 ELSE 2 END, sort, id`, uid),
    latestEf(db, uid),
  ])
  return { scenarios: scenarios.map((s) => ({ ...s, lines: lines.filter((l) => l.scenario === s.id) })), ef }
}

type RawLine = Partial<Record<keyof BudgetLineInput, unknown>>

/** Validated, normalised subset of a line; only known keys come back, so they are safe to put in SQL */
function clean(p: RawLine): Partial<BudgetLineInput> {
  const out: Partial<BudgetLineInput> = {}
  if (p.type !== undefined) {
    if (!BUDGET_TYPES.includes(p.type as BudgetType)) throw bad('ประเภทต้องเป็น Income, Saving หรือ Expense')
    out.type = p.type as BudgetType
  }
  for (const k of ['category', 'item'] as const) {
    if (p[k] === undefined) continue
    const v = String(p[k] ?? '').trim()
    if (!v) throw bad(k === 'item' ? 'ต้องมีชื่อรายการ' : 'ต้องมีหมวด')
    out[k] = v
  }
  if (p.thb !== undefined) {
    if (typeof p.thb !== 'number' || !Number.isFinite(p.thb) || p.thb < 0) throw bad('ยอดต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป')
    out.thb = Math.round(p.thb * 100) / 100
  }
  if (p.expr !== undefined) out.expr = p.expr ? String(p.expr) : null
  if (p.account !== undefined) out.account = typeof p.account === 'string' && p.account.trim() ? p.account.trim() : null
  return out
}

export async function addLine(db: Db, uid: number, scenario: string, p: RawLine) {
  if (!isScenario(scenario) || !(await one(db, 'SELECT 1 AS ok FROM budget_scenarios WHERE user_id = ? AND id = ?', uid, scenario))) {
    throw notFound('ไม่พบชุดงบนี้')
  }
  const v = clean(p)
  if (!v.type || !v.category || !v.item) throw bad('ต้องมีประเภท หมวด และชื่อรายการ')
  const sort = (await one<{ s: number | null }>(db, 'SELECT MAX(sort) AS s FROM budget_lines WHERE user_id = ? AND scenario = ?', uid, scenario))?.s ?? 0
  await run(db, 'INSERT INTO budget_lines (user_id, scenario, type, category, item, thb, expr, account, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    uid, scenario, v.type, v.category, v.item, v.thb ?? 0, v.expr ?? null, v.account ?? null, sort + 1)
}

export async function updateLine(db: Db, uid: number, id: number, p: RawLine) {
  const v = clean(p)
  const keys = Object.keys(v) as (keyof BudgetLineInput)[]
  if (!keys.length) throw bad('ไม่มีอะไรให้แก้')
  const r = await run(db, `UPDATE budget_lines SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ? AND user_id = ?`,
    ...keys.map((k) => v[k] ?? null), id, uid)
  if (!r.meta.changes) throw notFound('ไม่พบรายการนี้')
}

export async function deleteLine(db: Db, uid: number, id: number) {
  const r = await run(db, 'DELETE FROM budget_lines WHERE id = ? AND user_id = ?', id, uid)
  if (!r.meta.changes) throw notFound('ไม่พบรายการนี้')
}

/** Fill an empty Projection with every line of ปัจจุบัน, or an empty ตกงาน with its expenses only */
export async function copyScenario(db: Db, uid: number, to: string, from: unknown) {
  if (to !== 'proj' && to !== 'em') throw bad('คัดลอกได้เฉพาะไปที่ Projection หรือ ตกงาน')
  if (from !== 'main') throw bad('คัดลอกได้จากชุด ปัจจุบัน เท่านั้น')
  if (await one(db, 'SELECT 1 AS ok FROM budget_lines WHERE user_id = ? AND scenario = ? LIMIT 1', uid, to)) {
    throw conflict('ชุดนี้มีรายการแล้ว ลบให้ว่างก่อนถ้าจะคัดลอกใหม่')
  }
  const types = to === 'em' ? "('Expense')" : "('Income', 'Saving', 'Expense')"
  // NOT EXISTS keeps two simultaneous copies from both inserting
  await run(db, `INSERT INTO budget_lines (user_id, scenario, type, category, item, thb, expr, account, sort)
    SELECT user_id, ?, type, category, item, thb, expr, account, sort FROM budget_lines
    WHERE user_id = ? AND scenario = 'main' AND type IN ${types}
      AND NOT EXISTS (SELECT 1 FROM budget_lines WHERE user_id = ? AND scenario = ?)`, to, uid, uid, to)
}
```

- [ ] **Step 8: Wire the routes**

In `worker/index.ts` add the imports:

```ts
import { addLine, copyScenario, deleteLine, getPlanning, updateLine } from './planning'
import { body, idParam } from './http'
```

(merge `body, idParam` into the existing `./http` import line) and add below the `/api/me` route:

```ts
// ---- Planning ----
app.get('/api/planning', async (c) => c.json(await getPlanning(c.env.DB, c.var.uid)))
app.post('/api/planning/:scenario/lines', async (c) => {
  await addLine(c.env.DB, c.var.uid, c.req.param('scenario'), await body(c))
  return c.json(await getPlanning(c.env.DB, c.var.uid))
})
app.patch('/api/planning/lines/:id', async (c) => {
  await updateLine(c.env.DB, c.var.uid, idParam(c), await body(c))
  return c.json(await getPlanning(c.env.DB, c.var.uid))
})
app.delete('/api/planning/lines/:id', async (c) => {
  await deleteLine(c.env.DB, c.var.uid, idParam(c))
  return c.json(await getPlanning(c.env.DB, c.var.uid))
})
app.post('/api/planning/:scenario/copy', async (c) => {
  const { from } = await body<{ from?: unknown }>(c)
  await copyScenario(c.env.DB, c.var.uid, c.req.param('scenario'), from)
  return c.json(await getPlanning(c.env.DB, c.var.uid))
})
```

- [ ] **Step 9: Run all tests**

Run: `pnpm test`
Expected: all pass.

- [ ] **Step 10: Typecheck and commit**

```bash
pnpm typecheck
git config user.email   # c.soonue@gmail.com
git add shared/planning.ts worker/planning.ts worker/index.ts test/shared-planning.test.ts test/planning.test.ts
git commit -m "Planning API: per-user lines in ปัจจุบัน / Projection / ตกงาน, copy into empty scenarios, strict amount validation"
```

---

### Task 4: Balance API

**Files:**
- Modify: `shared/month.ts` (full month helpers)
- Create: `shared/transfers.ts`, `worker/balance.ts`
- Modify: `worker/index.ts` (balance routes)
- Test: `test/shared-month.test.ts`, `test/shared-transfers.test.ts`, `test/balance.test.ts`

**Interfaces:**
- Consumes: `Balance`, `BalanceRow`, `BalanceSide`, `BalanceTransfers`, `BudgetLineRow`, `MonthStatus`, `NewBalanceItem`, `Classification`, `Tier`, `TIERS` (`shared/types.ts`); `totals`, `efStatus` (`shared/planning.ts`); db + http helpers; test helpers.
- Produces:
  - `shared/month.ts`: `isMonth(s)`, `addMonth(ym, n)`, `bangkokMonth(at?)`, `firstMonthOptions(at?)`, `monthLabel(ym)` (e.g. `ก.ย. '26`).
  - `shared/transfers.ts`: `transfers(lines, done: Map<string, string>): BalanceTransfers | null`.
  - `worker/balance.ts`: `getBalance(db, uid, month?)`, `startMonth`, `closeMonth`, `discardDraft`, `setEntry(db, uid, month, id, thb, expr)`, `confirmRows(db, uid, month, ids)`, `addItem(db, uid, month, input)`, `classifyItem(db, uid, id, c)`, `removeEntry`, `restoreEntry`, `setTransfer(db, uid, month, bank, done)`.
  - HTTP: `GET /api/balance?month=`; `POST /api/balance/:month/start|close`; `DELETE /api/balance/:month`; `PUT|DELETE /api/balance/:month/entries/:id`; `POST /api/balance/:month/entries/:id/restore`; `POST /api/balance/:month/confirm { ids }`; `POST /api/balance/:month/items`; `PATCH /api/balance/:month/items/:id`; `POST /api/balance/:month/transfers/:bank { done }` — every write answers the fresh `Balance`.

- [ ] **Step 1: Write the failing pure tests**

`test/shared-month.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { addMonth, bangkokMonth, firstMonthOptions, isMonth, monthLabel } from '../shared/month'

describe('months', () => {
  it('validates YYYY-MM', () => {
    expect(isMonth('2026-09')).toBe(true)
    for (const bad of ['2026-9', '2026-13', '2026-00', '26-09', '2026-09-01', '']) expect(isMonth(bad)).toBe(false)
  })

  it('adds months across years', () => {
    expect(addMonth('2026-12', 1)).toBe('2027-01')
    expect(addMonth('2026-01', -1)).toBe('2025-12')
    expect(addMonth('2026-09', -11)).toBe('2025-10')
  })

  it('rolls over at midnight in Thailand, not UTC', () => {
    expect(bangkokMonth(new Date('2026-09-30T16:59:59Z'))).toBe('2026-09')
    expect(bangkokMonth(new Date('2026-09-30T17:00:00Z'))).toBe('2026-10')
  })

  it('offers this month and the 11 before it for a first sheet', () => {
    const opts = firstMonthOptions(new Date('2026-01-15T00:00:00Z'))
    expect(opts).toHaveLength(12)
    expect(opts[0]).toBe('2026-01')
    expect(opts[11]).toBe('2025-02')
  })

  it('labels months for chart axes', () => {
    expect(monthLabel('2026-09')).toBe("ก.ย. '26")
    expect(monthLabel('2027-01')).toBe("ม.ค. '27")
  })
})
```

`test/shared-transfers.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { transfers } from '../shared/transfers'
import type { BudgetType } from '../shared/types'

const L = (type: BudgetType, item: string, thb: number, account: string | null, category = 'Housing') => ({ type, category, item, thb, account })

describe('month-close transfers', () => {
  it('is null without any plan line', () => {
    expect(transfers([], new Map())).toBeNull()
    expect(transfers([L('Expense', 'x', 0, 'SCB')], new Map())).toBeNull()
  })

  it('groups by bank and sub-account, keeps notes, sorts banks by amount', () => {
    const t = transfers([
      L('Income', 'ค่าเช่า', 22000, null, 'Rental'),
      L('Saving', 'เงินออม', 3000, 'KBank/ออม: ทุกวันที่ 1', 'Saving'),
      L('Saving', 'EF', 2000, 'KBank/ออม', 'Saving'),
      L('Expense', 'ผ่อนบ้าน', 18000, 'SCB', 'Mortgage'),
      L('Expense', 'PVD', 4000, null),
      L('Expense', 'ส่วนกลาง', 1500, 'Rental: หักจากค่าเช่า'),
    ], new Map([['SCB', '2026-09-30T00:00:00.000Z']]))!
    expect(t.banks).toEqual([
      { bank: 'SCB', thb: 18000, doneAt: '2026-09-30T00:00:00.000Z', subs: [{ sub: null, thb: 18000, items: ['ผ่อนบ้าน'], notes: [] }] },
      { bank: 'KBank', thb: 5000, doneAt: null, subs: [{ sub: 'ออม', thb: 5000, items: ['เงินออม', 'EF'], notes: ['ทุกวันที่ 1'] }] },
    ])
    expect(t.skipped).toEqual([{ item: 'PVD', thb: 4000 }])
    expect(t.fromIncome).toEqual([{ source: 'Rental', item: 'ส่วนกลาง', thb: 1500, note: 'หักจากค่าเช่า' }])
  })
})
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm test test/shared-month.test.ts test/shared-transfers.test.ts`
Expected: FAIL — `addMonth` / `transfers` not exported.

- [ ] **Step 3: Write `shared/month.ts` (replace the one-line file from Task 1)**

```ts
export const isMonth = (s: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s)

export function addMonth(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7)
}

/** Calendar month in Thailand (UTC+7, no daylight saving) */
export const bangkokMonth = (at = new Date()) => new Date(at.getTime() + 7 * 3_600_000).toISOString().slice(0, 7)

/** Months a first balance sheet may start at: this month in Bangkok and the 11 before it, newest first */
export const firstMonthOptions = (at = new Date()) => Array.from({ length: 12 }, (_, i) => addMonth(bangkokMonth(at), -i))

const TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

/** 2026-09 → ก.ย. '26 (chart axis label) */
export function monthLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  return `${TH_MON[m - 1]} '${String(y).slice(2)}`
}
```

- [ ] **Step 4: Write `shared/transfers.ts`**

```ts
import type { BalanceTransfers, BudgetLineRow } from './types'

type Line = Pick<BudgetLineRow, 'type' | 'category' | 'item' | 'thb' | 'account'>
type Sub = BalanceTransfers['banks'][number]['subs'][number]

const round = (v: number) => Math.round(v * 100) / 100

/**
 * What to transfer to which bank when closing a month, from the ปัจจุบัน plan: Saving + Expense lines grouped by the
 * account column "bank/sub-account: note". Lines without an account are not transfers (PVD, social security);
 * an account named after an income line (Rental) is paid straight from that income.
 */
export function transfers(lines: Line[], done: Map<string, string>): BalanceTransfers | null {
  const live = lines.filter((l) => l.thb > 0)
  if (!live.length) return null
  const incomes = new Set(live.filter((l) => l.type === 'Income').flatMap((l) => [l.category, l.item]))
  const banks = new Map<string, { bank: string; thb: number; subs: Sub[] }>()
  const skipped: BalanceTransfers['skipped'] = []
  const fromIncome: BalanceTransfers['fromIncome'] = []
  for (const l of live.filter((x) => x.type !== 'Income')) {
    if (!l.account?.trim()) {
      skipped.push({ item: l.item, thb: l.thb })
      continue
    }
    const [path, ...rest] = l.account.split(':')
    const note = rest.join(':').trim() || null
    const [bank, ...subParts] = path.split('/').map((x) => x.trim())
    if (incomes.has(bank)) {
      fromIncome.push({ source: bank, item: l.item, thb: l.thb, note })
      continue
    }
    const sub = subParts.join('/') || null
    const b = banks.get(bank) ?? { bank, thb: 0, subs: [] }
    let s = b.subs.find((x) => x.sub === sub)
    if (!s) {
      s = { sub, thb: 0, items: [], notes: [] }
      b.subs.push(s)
    }
    b.thb += l.thb
    s.thb += l.thb
    s.items.push(l.item)
    if (note && !s.notes.includes(note)) s.notes.push(note)
    banks.set(bank, b)
  }
  return {
    banks: [...banks.values()].sort((a, b) => b.thb - a.thb).map((b) => ({
      bank: b.bank,
      thb: round(b.thb),
      doneAt: done.get(b.bank) ?? null,
      subs: b.subs.sort((x, y) => y.thb - x.thb).map((s) => ({ ...s, thb: round(s.thb) })),
    })),
    skipped,
    fromIncome,
  }
}
```

- [ ] **Step 5: Run the pure tests**

Run: `pnpm test test/shared-month.test.ts test/shared-transfers.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing API tests**

`test/balance.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { addMonth, bangkokMonth } from '../shared/month'
import type { Balance, BalanceRow } from '../shared/types'
import { call, login, ok, sql, uidOf } from './helpers'

const cur = bangkokMonth()
const get = (cookie: string, month?: string) => ok<Balance>(call(`/api/balance${month ? `?month=${month}` : ''}`, { cookie }))
const start = (cookie: string, month: string) => call(`/api/balance/${month}/start`, { cookie, json: {} })
const item = (over: Record<string, unknown> = {}) => ({ side: 'asset', category: 'Cash', item: 'บัญชีออมทรัพย์', tier: null, type: null, country: null, ...over })
const addItem = (cookie: string, month: string, over: Record<string, unknown> = {}) => call(`/api/balance/${month}/items`, { cookie, json: item(over) })
const row = (b: Balance, name: string) => b.rows.find((r) => r.item === name) as BalanceRow

describe('balance', () => {
  it('offers the last 12 months (Bangkok time) before any sheet exists', async () => {
    const { cookie } = await login()
    const b = await get(cookie)
    expect(b.month).toBeNull()
    expect(b.months).toEqual([])
    expect(b.firstMonths).toHaveLength(12)
    expect(b.firstMonths[0]).toBe(cur)
    expect(b.firstMonths[11]).toBe(addMonth(cur, -11))
    expect(b.hasClosed).toBe(false)
  })

  it('starts the first month only inside that window, and only once', async () => {
    const { cookie } = await login()
    expect((await start(cookie, addMonth(cur, 1))).status).toBe(400)
    expect((await start(cookie, addMonth(cur, -12))).status).toBe(400)
    expect((await start(cookie, 'bad')).status).toBe(400)
    const b = await ok<Balance>(start(cookie, cur))
    expect(b).toMatchObject({ month: cur, status: 'draft', rows: [], firstMonths: [] })
    expect((await start(cookie, cur)).status).toBe(409)
    expect((await start(cookie, addMonth(cur, 1))).status).toBe(409)
  })

  it('adds items with and without an amount', async () => {
    const { cookie } = await login()
    await start(cookie, cur)
    let b = await ok<Balance>(addItem(cookie, cur, { thb: 85000, expr: '80000+5000' }))
    expect(row(b, 'บัญชีออมทรัพย์')).toMatchObject({ thb: 85000, expr: '80000+5000', confirmed: true, tier: null })
    b = await ok<Balance>(addItem(cookie, cur, { category: 'Equity', item: 'RMF', tier: 'Core', type: 'Fund', country: 'Global' }))
    expect(row(b, 'RMF')).toMatchObject({ thb: 0, confirmed: false, tier: 'Core', type: 'Fund', country: 'Global' })
  })

  it('drops the investment classification of liabilities', async () => {
    const { cookie } = await login()
    await start(cookie, cur)
    const b = await ok<Balance>(addItem(cookie, cur, { side: 'liability', category: 'Mortgage', item: 'สินเชื่อบ้าน', tier: 'Core', type: 'x', country: 'y', thb: 1000 }))
    expect(row(b, 'สินเชื่อบ้าน')).toMatchObject({ tier: null, type: null, country: null })
  })

  it.each([
    ['a bad side', { side: 'both' }],
    ['an empty name', { item: ' ' }],
    ['an unknown tier', { tier: 'Big' }],
    ['an amount with a comma', { thb: '1,000' }],
  ])('rejects an item with %s', async (_, over) => {
    const { cookie } = await login()
    await start(cookie, cur)
    expect((await addItem(cookie, cur, over)).status).toBe(400)
  })

  it('re-adds a removed item instead of duplicating it', async () => {
    const { email, cookie } = await login()
    await start(cookie, cur)
    const id = row(await ok<Balance>(addItem(cookie, cur, { thb: 100 })), 'บัญชีออมทรัพย์').id
    let b = await ok<Balance>(call(`/api/balance/${cur}/entries/${id}`, { method: 'DELETE', cookie, json: {} }))
    expect(b.rows).toEqual([])
    b = await ok<Balance>(addItem(cookie, cur, { thb: 200 }))
    expect(b.rows.map((r) => [r.id, r.thb])).toEqual([[id, 200]])
    expect(b.hidden).toEqual([])
    const n = await sql("SELECT COUNT(*) AS n FROM balance_items WHERE user_id = ? AND item = 'บัญชีออมทรัพย์'", await uidOf(email)).first<{ n: number }>()
    expect(n!.n).toBe(1)
  })

  it('edits, confirms, hides and restores rows', async () => {
    const { cookie } = await login()
    await start(cookie, cur)
    const id = row(await ok<Balance>(addItem(cookie, cur)), 'บัญชีออมทรัพย์').id
    let b = await ok<Balance>(call(`/api/balance/${cur}/entries/${id}`, { method: 'PUT', cookie, json: { thb: 1000.555, expr: null } }))
    expect(row(b, 'บัญชีออมทรัพย์')).toMatchObject({ thb: 1000.56, confirmed: true })
    await call(`/api/balance/${cur}/close`, { cookie, json: {} })
    // hidden rows are the ones last month had: that needs a second month
    const next = addMonth(cur, 1)
    b = await ok<Balance>(start(cookie, next))
    expect(row(b, 'บัญชีออมทรัพย์').confirmed).toBe(false)
    b = await ok<Balance>(call(`/api/balance/${next}/confirm`, { cookie, json: { ids: [id] } }))
    expect(row(b, 'บัญชีออมทรัพย์').confirmed).toBe(true)
    b = await ok<Balance>(call(`/api/balance/${next}/entries/${id}`, { method: 'DELETE', cookie, json: {} }))
    expect(b.rows).toEqual([])
    expect(b.hidden).toEqual([{ id, side: 'asset', category: 'Cash', item: 'บัญชีออมทรัพย์', prev: 1000.56 }])
    b = await ok<Balance>(call(`/api/balance/${next}/entries/${id}/restore`, { cookie, json: {} }))
    expect(row(b, 'บัญชีออมทรัพย์')).toMatchObject({ thb: 1000.56, confirmed: false })
  })

  it('rejects non-numeric amounts and unknown rows or months', async () => {
    const { cookie } = await login()
    await start(cookie, cur)
    const id = row(await ok<Balance>(addItem(cookie, cur)), 'บัญชีออมทรัพย์').id
    for (const thb of ['abc', '1,000', null, true]) {
      expect((await call(`/api/balance/${cur}/entries/${id}`, { method: 'PUT', cookie, json: { thb, expr: null } })).status).toBe(400)
    }
    expect((await call(`/api/balance/${cur}/entries/999999`, { method: 'PUT', cookie, json: { thb: 1, expr: null } })).status).toBe(404)
    expect((await call(`/api/balance/2020-01/entries/${id}`, { method: 'PUT', cookie, json: { thb: 1, expr: null } })).status).toBe(404)
    expect((await call(`/api/balance/${cur}/confirm`, { cookie, json: { ids: 'all' } })).status).toBe(400)
  })

  it('lists transfers from the current plan and ticks banks', async () => {
    const { cookie } = await login()
    const addLine = (json: Record<string, unknown>) => call('/api/planning/main/lines', { cookie, json: { expr: null, account: null, ...json } })
    await addLine({ type: 'Saving', category: 'Saving', item: 'เงินออม', thb: 3000, account: 'KBank/ออม: ทุกวันที่ 1' })
    await addLine({ type: 'Expense', category: 'Mortgage', item: 'ผ่อนบ้าน', thb: 18000, account: 'SCB' })
    await addLine({ type: 'Expense', category: 'Debt', item: 'PVD', thb: 4000 })
    await start(cookie, cur)
    let b = await get(cookie)
    expect(b.transfers!.banks.map((x) => [x.bank, x.thb, x.doneAt])).toEqual([['SCB', 18000, null], ['KBank', 3000, null]])
    expect(b.transfers!.skipped).toEqual([{ item: 'PVD', thb: 4000 }])
    b = await ok<Balance>(call(`/api/balance/${cur}/transfers/SCB`, { cookie, json: { done: true } }))
    expect(b.transfers!.banks[0].doneAt).toEqual(expect.any(String))
    b = await ok<Balance>(call(`/api/balance/${cur}/transfers/SCB`, { cookie, json: { done: false } }))
    expect(b.transfers!.banks[0].doneAt).toBeNull()
  })

  it('uses 6 × ตกงาน expenses as the emergency fund target', async () => {
    const { cookie } = await login()
    await call('/api/planning/em/lines', { cookie, json: { type: 'Expense', category: 'Housing', item: 'ค่าเช่า', thb: 30000, expr: null, account: null } })
    await start(cookie, cur)
    expect((await get(cookie)).targets).toEqual({ 'Emergency Funds': 180000 })
  })

  it('closes a month and carries it into the next', async () => {
    const { cookie } = await login()
    await start(cookie, cur)
    await addItem(cookie, cur, { thb: 100 })
    await addItem(cookie, cur, { item: 'เงินสด' })
    let b = await ok<Balance>(call(`/api/balance/${cur}/close`, { cookie, json: {} }))
    expect(b.status).toBe('closed')
    expect(b.rows.every((r) => r.confirmed)).toBe(true)
    expect(b.next).toBe(addMonth(cur, 1))
    expect(b.hasClosed).toBe(true)
    const next = addMonth(cur, 1)
    b = await ok<Balance>(start(cookie, next))
    expect(b).toMatchObject({ month: next, status: 'draft', prevMonth: cur })
    expect(b.rows.map((r) => [r.item, r.thb, r.confirmed, r.prev])).toEqual([['บัญชีออมทรัพย์', 100, false, 100], ['เงินสด', 0, false, 0]])
    expect(b.history.map((h) => [h.month, h.net, h.draft])).toEqual([[next, 100, true], [cur, 100, false]])
  })

  it('discards a draft but never a closed month', async () => {
    const { cookie } = await login()
    await start(cookie, cur)
    await call(`/api/balance/${cur}/close`, { cookie, json: {} })
    await start(cookie, addMonth(cur, 1))
    const b = await ok<Balance>(call(`/api/balance/${addMonth(cur, 1)}`, { method: 'DELETE', cookie, json: {} }))
    expect(b.months).toEqual([{ month: cur, status: 'closed' }])
    expect((await call(`/api/balance/${cur}`, { method: 'DELETE', cookie, json: {} })).status).toBe(409)
    expect((await call(`/api/balance/${cur}/close`, { cookie, json: {} })).status).toBe(409)
  })
})
```

- [ ] **Step 7: Run to see them fail**

Run: `pnpm test test/balance.test.ts`
Expected: FAIL — `/api/balance` answers 404.

- [ ] **Step 8: Write `worker/balance.ts`**

```ts
// Balance page: the month-end balance sheet. A new month starts as a draft copied from the previous month; each row
// is confirmed or updated; closing the month makes it count in Overview. D1 has no interactive transactions, so each
// write reads what it needs first and then applies every statement in one atomic batch.
import { addMonth, firstMonthOptions } from '../shared/month'
import { efStatus, totals } from '../shared/planning'
import { transfers } from '../shared/transfers'
import { TIERS, type Balance, type BalanceRow, type BalanceSide, type BudgetLineRow, type MonthStatus, type Tier } from '../shared/types'
import { all, isConstraint, now, one, run, stmt, type Db } from './db'
import { bad, conflict, notFound } from './http'

interface Item { id: number; side: BalanceSide; category: string; item: string; tier: Tier | null; type: string | null; country: string | null; active: number; sort: number }
interface Cell { thb: number; expr: string | null; confirmed: boolean }
type Month = { month: string; status: MonthStatus }

const items = (db: Db, uid: number) =>
  all<Item>(db, 'SELECT id, side, category, item, tier, type, country, active, sort FROM balance_items WHERE user_id = ? ORDER BY sort, id', uid)
const monthList = (db: Db, uid: number) =>
  all<Month>(db, 'SELECT month, status FROM balance_months WHERE user_id = ? ORDER BY month DESC', uid)

async function requireMonth(db: Db, uid: number, month: string): Promise<MonthStatus> {
  const m = await one<Month>(db, 'SELECT month, status FROM balance_months WHERE user_id = ? AND month = ?', uid, month)
  if (!m) throw notFound(`ยังไม่มีงบดุลเดือน ${month}`)
  return m.status
}
async function requireItem(db: Db, uid: number, id: number) {
  if (!(await one(db, 'SELECT 1 AS ok FROM balance_items WHERE user_id = ? AND id = ?', uid, id))) throw notFound('ไม่พบรายการนี้')
}

async function monthCells(db: Db, uid: number, m: Month): Promise<Map<number, Cell>> {
  const rows = await all<{ item_id: number; thb: number; expr: string | null; updated_at: string | null }>(db,
    'SELECT item_id, thb, expr, updated_at FROM balance_entries WHERE user_id = ? AND month = ?', uid, m.month)
  return new Map(rows.map((r) => [r.item_id, { thb: r.thb, expr: r.expr, confirmed: m.status === 'closed' || r.updated_at != null }]))
}

const touch = (db: Db, uid: number, month: string) => stmt(db, 'UPDATE balance_months SET updated_at = ? WHERE user_id = ? AND month = ?', now(), uid, month)
const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
function tierOf(v: unknown): Tier | null {
  if (v == null || v === '') return null
  if (!TIERS.includes(v as Tier)) throw bad('กลุ่มพอร์ตไม่ถูกต้อง')
  return v as Tier
}
function amount(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw bad('ยอดต้องเป็นตัวเลข')
  return Math.round(v * 100) / 100
}

export async function getBalance(db: Db, uid: number, requested?: string | null): Promise<Balance> {
  const [months, em, planLines] = await Promise.all([
    monthList(db, uid),
    all<Pick<BudgetLineRow, 'type' | 'category' | 'thb'>>(db, "SELECT type, category, thb FROM budget_lines WHERE user_id = ? AND scenario = 'em'", uid),
    all<Pick<BudgetLineRow, 'type' | 'category' | 'item' | 'thb' | 'account'>>(db,
      "SELECT type, category, item, thb, account FROM budget_lines WHERE user_id = ? AND scenario = 'main' ORDER BY sort, id", uid),
  ])
  const target = efStatus(0, totals(em)).target
  const targets: Record<string, number> = target != null ? { 'Emergency Funds': target } : {}
  const next = months[0] && months[0].status !== 'draft' ? addMonth(months[0].month, 1) : null
  const hasClosed = months.some((m) => m.status === 'closed')
  const current = months.find((m) => m.month === requested) ?? months.find((m) => m.status === 'draft') ?? months[0]
  if (!current) {
    return { months, next, firstMonths: firstMonthOptions(), month: null, status: null, prevMonth: null, rows: [], hidden: [], history: [], targets, transfers: null, hasClosed }
  }
  const prevM = months.find((m) => m.month < current.month) ?? null
  const [list, cells, prev, sums, done] = await Promise.all([
    items(db, uid),
    monthCells(db, uid, current),
    prevM ? monthCells(db, uid, prevM) : Promise.resolve(new Map<number, Cell>()),
    all<{ month: string; side: BalanceSide; thb: number }>(db, `
      SELECT e.month, i.side, SUM(e.thb) AS thb FROM balance_entries e
      JOIN balance_items i ON i.user_id = e.user_id AND i.id = e.item_id
      JOIN balance_months m ON m.user_id = e.user_id AND m.month = e.month
      WHERE e.user_id = ? AND (m.status = 'closed' OR e.month = ?)
      GROUP BY e.month, i.side`, uid, current.month),
    all<{ bank: string; done_at: string }>(db, 'SELECT bank, done_at FROM balance_transfers WHERE user_id = ? AND month = ?', uid, current.month),
  ])

  const rows: BalanceRow[] = list.filter((i) => cells.has(i.id)).map((i) => {
    const c = cells.get(i.id)!
    return { id: i.id, side: i.side, category: i.category, item: i.item, tier: i.tier, type: i.type, country: i.country,
      thb: c.thb, expr: c.expr, confirmed: c.confirmed, prev: prev.get(i.id)?.thb ?? null }
  })
  // rows that could come back: last month had them, or they are still active but missing here
  const hidden = list.filter((i) => !cells.has(i.id) && (i.active || prev.has(i.id)))
    .map((i) => ({ id: i.id, side: i.side, category: i.category, item: i.item, prev: prev.get(i.id)?.thb ?? null }))

  // net worth per closed month + the month on screen (maybe a draft), newest first
  const byMonth = new Map<string, { assets: number; liabilities: number }>()
  for (const s of sums) {
    const m = byMonth.get(s.month) ?? { assets: 0, liabilities: 0 }
    m[s.side === 'asset' ? 'assets' : 'liabilities'] = s.thb
    byMonth.set(s.month, m)
  }
  byMonth.set(current.month, {
    assets: rows.filter((r) => r.side === 'asset').reduce((s, r) => s + r.thb, 0),
    liabilities: rows.filter((r) => r.side === 'liability').reduce((s, r) => s + r.thb, 0),
  })
  const history = [...byMonth.entries()].filter(([m]) => m <= current.month).sort(([a], [b]) => b.localeCompare(a)).slice(0, 13)
    .map(([m, v]) => ({ month: m, assets: v.assets, liabilities: v.liabilities, net: v.assets - v.liabilities, draft: m === current.month && current.status === 'draft' }))

  return {
    months, next, firstMonths: [], month: current.month, status: current.status, prevMonth: prevM?.month ?? null,
    rows, hidden, history, targets, transfers: transfers(planLines, new Map(done.map((d) => [d.bank, d.done_at]))), hasClosed,
  }
}

/** First month: any of the last 12 months. Later: exactly the month after the latest, which must be closed. Rows carry over unconfirmed. */
export async function startMonth(db: Db, uid: number, month: string) {
  const months = await monthList(db, uid)
  if (!months.length) {
    if (!firstMonthOptions().includes(month)) throw bad('เดือนแรกต้องอยู่ในช่วง 12 เดือนล่าสุดถึงเดือนนี้')
  } else {
    if (months[0].status === 'draft') throw conflict(`ยังมีร่าง ${months[0].month} ค้างอยู่ ปิดหรือลบก่อน`)
    const next = addMonth(months[0].month, 1)
    if (month !== next) throw conflict(`เดือนถัดไปที่เริ่มได้คือ ${next}`)
  }
  const [prev, list] = await Promise.all([months[0] ? monthCells(db, uid, months[0]) : Promise.resolve(new Map<number, Cell>()), items(db, uid)])
  try {
    await db.batch([
      stmt(db, 'INSERT INTO balance_months (user_id, month, status, updated_at) VALUES (?, ?, ?, ?)', uid, month, 'draft', now()),
      ...list.filter((i) => i.active || prev.has(i.id)).map((i) => {
        const c = prev.get(i.id)
        return stmt(db, 'INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at) VALUES (?, ?, ?, ?, ?, NULL)',
          uid, month, i.id, c?.thb ?? 0, c?.expr ?? null)
      }),
    ])
  } catch (e) {
    if (isConstraint(e)) throw conflict('เดือนนี้เริ่มไปแล้ว')
    throw e
  }
}

export async function setEntry(db: Db, uid: number, month: string, id: number, thb: unknown, expr: unknown) {
  await requireMonth(db, uid, month)
  const v = amount(thb)
  await requireItem(db, uid, id)
  await db.batch([
    stmt(db, `INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (user_id, month, item_id) DO UPDATE SET thb = excluded.thb, expr = excluded.expr, updated_at = excluded.updated_at`,
      uid, month, id, v, text(expr), now()),
    touch(db, uid, month),
  ])
}

/** Mark rows as checked without changing them (the value really did not move) */
export async function confirmRows(db: Db, uid: number, month: string, ids: unknown) {
  await requireMonth(db, uid, month)
  if (!Array.isArray(ids) || !ids.every((x) => Number.isInteger(x))) throw bad('ids ต้องเป็นรายการตัวเลข')
  const t = now()
  await db.batch([
    ...ids.map((id) => stmt(db, 'UPDATE balance_entries SET updated_at = ? WHERE user_id = ? AND month = ? AND item_id = ? AND updated_at IS NULL', t, uid, month, id)),
    touch(db, uid, month),
  ])
}

/** New row (or an existing one brought back), optionally with its amount; the item and its entry are written in one batch */
export async function addItem(db: Db, uid: number, month: string, p: Record<string, unknown>) {
  await requireMonth(db, uid, month)
  const side = p.side, category = text(p.category), name = text(p.item)
  if ((side !== 'asset' && side !== 'liability') || !category || !name) throw bad('ต้องมีฝั่ง หมวด และชื่อรายการ')
  const tier = side === 'asset' ? tierOf(p.tier) : null
  const type = tier ? text(p.type) : null
  const country = tier ? text(p.country) : null
  const thb = p.thb === undefined ? null : amount(p.thb)
  // new rows go last in their category (or last overall for a new category)
  const sort = ((await one<{ s: number | null }>(db, 'SELECT MAX(sort) AS s FROM balance_items WHERE user_id = ? AND side = ? AND category = ?', uid, side, category))?.s
    ?? (await one<{ s: number | null }>(db, 'SELECT MAX(sort) AS s FROM balance_items WHERE user_id = ?', uid))?.s ?? 0) + 0.01
  const pick = 'FROM balance_items WHERE user_id = ? AND side = ? AND category = ? AND item = ?'
  await db.batch([
    stmt(db, `INSERT INTO balance_items (user_id, side, category, item, tier, type, country, active, sort) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
      ON CONFLICT (user_id, side, category, item) DO UPDATE SET active = 1`, uid, side, category, name, tier, type, country, sort),
    thb != null
      ? stmt(db, `INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at) SELECT ?, ?, id, ?, ?, ? ${pick}
          ON CONFLICT (user_id, month, item_id) DO UPDATE SET thb = excluded.thb, expr = excluded.expr, updated_at = excluded.updated_at`,
          uid, month, thb, text(p.expr), now(), uid, side, category, name)
      : stmt(db, `INSERT OR IGNORE INTO balance_entries (user_id, month, item_id, thb, expr, updated_at) SELECT ?, ?, id, 0, NULL, NULL ${pick}`,
          uid, month, uid, side, category, name),
    touch(db, uid, month),
  ])
}

/** Investment classification of an asset row (tier null = not in the portfolio) */
export async function classifyItem(db: Db, uid: number, id: number, c: Record<string, unknown>) {
  const tier = tierOf(c.tier)
  const r = await run(db, "UPDATE balance_items SET tier = ?, type = ?, country = ? WHERE id = ? AND user_id = ? AND side = 'asset'",
    tier, tier ? text(c.type) : null, tier ? text(c.country) : null, id, uid)
  if (!r.meta.changes) throw notFound('ไม่พบรายการนี้')
}

/** Take a row out of a month; it is not carried into new months any more */
export async function removeEntry(db: Db, uid: number, month: string, id: number) {
  await requireMonth(db, uid, month)
  await requireItem(db, uid, id)
  await db.batch([
    stmt(db, 'DELETE FROM balance_entries WHERE user_id = ? AND month = ? AND item_id = ?', uid, month, id),
    stmt(db, 'UPDATE balance_items SET active = 0 WHERE user_id = ? AND id = ?', uid, id),
    touch(db, uid, month),
  ])
}

/** Put a hidden row back with last month's value, unconfirmed */
export async function restoreEntry(db: Db, uid: number, month: string, id: number) {
  await requireMonth(db, uid, month)
  await requireItem(db, uid, id)
  const prev = await one<Month>(db, 'SELECT month, status FROM balance_months WHERE user_id = ? AND month < ? ORDER BY month DESC LIMIT 1', uid, month)
  const c = prev ? (await monthCells(db, uid, prev)).get(id) : undefined
  await db.batch([
    stmt(db, 'INSERT OR IGNORE INTO balance_entries (user_id, month, item_id, thb, expr, updated_at) VALUES (?, ?, ?, ?, ?, NULL)', uid, month, id, c?.thb ?? 0, c?.expr ?? null),
    stmt(db, 'UPDATE balance_items SET active = 1 WHERE user_id = ? AND id = ?', uid, id),
    touch(db, uid, month),
  ])
}

export async function closeMonth(db: Db, uid: number, month: string) {
  if ((await requireMonth(db, uid, month)) !== 'draft') throw conflict(`${month} ไม่ได้เป็นร่าง`)
  const t = now()
  await db.batch([
    stmt(db, "UPDATE balance_months SET status = 'closed', closed_at = ?, updated_at = ? WHERE user_id = ? AND month = ?", t, t, uid, month),
    stmt(db, 'UPDATE balance_entries SET updated_at = ? WHERE user_id = ? AND month = ? AND updated_at IS NULL', t, uid, month),
  ])
}

export async function discardDraft(db: Db, uid: number, month: string) {
  if ((await requireMonth(db, uid, month)) !== 'draft') throw conflict(`${month} ปิดไปแล้ว ลบไม่ได้`)
  await db.batch([
    stmt(db, 'DELETE FROM balance_entries WHERE user_id = ? AND month = ?', uid, month),
    stmt(db, 'DELETE FROM balance_transfers WHERE user_id = ? AND month = ?', uid, month),
    stmt(db, 'DELETE FROM balance_months WHERE user_id = ? AND month = ?', uid, month),
  ])
}

export async function setTransfer(db: Db, uid: number, month: string, bank: string, done: unknown) {
  await requireMonth(db, uid, month)
  const b = bank.trim()
  if (!b) throw bad('ต้องระบุธนาคาร')
  if (done === true) await run(db, 'INSERT OR IGNORE INTO balance_transfers (user_id, month, bank, done_at) VALUES (?, ?, ?, ?)', uid, month, b, now())
  else await run(db, 'DELETE FROM balance_transfers WHERE user_id = ? AND month = ? AND bank = ?', uid, month, b)
}
```

- [ ] **Step 9: Wire the routes**

In `worker/index.ts` add:

```ts
import { addItem, classifyItem, closeMonth, confirmRows, discardDraft, getBalance, removeEntry, restoreEntry, setEntry, setTransfer, startMonth } from './balance'
```

(and add `monthParam` to the `./http` import), then below the planning routes:

```ts
// ---- Balance ----
const balanceOf = (c: { env: AppEnv['Bindings']; var: AppEnv['Variables'] }, month: string | null) => getBalance(c.env.DB, c.var.uid, month)
app.get('/api/balance', async (c) => c.json(await balanceOf(c, c.req.query('month') || null)))
app.post('/api/balance/:month/start', async (c) => {
  const m = monthParam(c)
  await startMonth(c.env.DB, c.var.uid, m)
  return c.json(await balanceOf(c, m))
})
app.post('/api/balance/:month/close', async (c) => {
  const m = monthParam(c)
  await closeMonth(c.env.DB, c.var.uid, m)
  return c.json(await balanceOf(c, m))
})
app.delete('/api/balance/:month', async (c) => {
  await discardDraft(c.env.DB, c.var.uid, monthParam(c))
  return c.json(await balanceOf(c, null))
})
app.put('/api/balance/:month/entries/:id', async (c) => {
  const m = monthParam(c)
  const { thb, expr } = await body<{ thb?: unknown; expr?: unknown }>(c)
  await setEntry(c.env.DB, c.var.uid, m, idParam(c), thb, expr)
  return c.json(await balanceOf(c, m))
})
app.delete('/api/balance/:month/entries/:id', async (c) => {
  const m = monthParam(c)
  await removeEntry(c.env.DB, c.var.uid, m, idParam(c))
  return c.json(await balanceOf(c, m))
})
app.post('/api/balance/:month/entries/:id/restore', async (c) => {
  const m = monthParam(c)
  await restoreEntry(c.env.DB, c.var.uid, m, idParam(c))
  return c.json(await balanceOf(c, m))
})
app.post('/api/balance/:month/confirm', async (c) => {
  const m = monthParam(c)
  const { ids } = await body<{ ids?: unknown }>(c)
  await confirmRows(c.env.DB, c.var.uid, m, ids)
  return c.json(await balanceOf(c, m))
})
app.post('/api/balance/:month/items', async (c) => {
  const m = monthParam(c)
  await addItem(c.env.DB, c.var.uid, m, await body(c))
  return c.json(await balanceOf(c, m))
})
app.patch('/api/balance/:month/items/:id', async (c) => {
  const m = monthParam(c)
  await classifyItem(c.env.DB, c.var.uid, idParam(c), await body(c))
  return c.json(await balanceOf(c, m))
})
app.post('/api/balance/:month/transfers/:bank', async (c) => {
  const m = monthParam(c)
  const { done } = await body<{ done?: unknown }>(c)
  await setTransfer(c.env.DB, c.var.uid, m, c.req.param('bank'), done)
  return c.json(await balanceOf(c, m))
})
```

Add `import type { AppEnv } from './env'` if it is not already imported.

- [ ] **Step 10: Run all tests**

Run: `pnpm test`
Expected: all pass.

- [ ] **Step 11: Typecheck and commit**

```bash
pnpm typecheck
git config user.email   # c.soonue@gmail.com
git add shared/month.ts shared/transfers.ts worker/balance.ts worker/index.ts test/shared-month.test.ts test/shared-transfers.test.ts test/balance.test.ts
git commit -m "Balance API: first month in the last 12 (Bangkok time), carry-over drafts, items with amounts, transfers from the plan, batch writes"
```

---

### Task 5: Overview API and tier targets

**Files:**
- Create: `shared/overview.ts`, `worker/overview.ts`
- Modify: `worker/index.ts` (overview + tier-target routes)
- Test: `test/shared-overview.test.ts`, `test/overview.test.ts`

**Interfaces:**
- Consumes: `Overview`, `BalanceGroup`, `BalanceSide`, `Tier`, `TIERS` (`shared/types.ts`); `monthLabel` (`shared/month.ts`); db + http helpers; test helpers.
- Produces:
  - `shared/overview.ts`: `interface OverviewEntry { month; side; category; item; tier; type; country; thb }`, `interface OverviewInput { closedMonths: string[]; entries: OverviewEntry[]; targets: Partial<Record<Tier, number>>; checklist: { planning: boolean; balanceStarted: boolean } }`, `buildOverview(input): Overview`.
  - `worker/overview.ts`: `getOverview(db, uid): Promise<Overview>`, `setTierTargets(db, uid, input)`.
  - HTTP: `GET /api/overview` → `Overview`; `PUT /api/tier-targets { Foundation, Core, Growth, 'High Risk' }` (fractions 0..1, sum 1 ± 0.001) → fresh `Overview`.

- [ ] **Step 1: Write the failing pure tests**

`test/shared-overview.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildOverview, type OverviewEntry } from '../shared/overview'

const E = (month: string, side: 'asset' | 'liability', category: string, item: string, thb: number, tier: OverviewEntry['tier'] = null): OverviewEntry =>
  ({ month, side, category, item, thb, tier, type: tier ? 'Fund' : null, country: tier ? 'Global' : null })
const checklist = { planning: true, balanceStarted: true }
const targets = { Foundation: 0.1, Core: 0.4, Growth: 0.35, 'High Risk': 0.15 }

describe('buildOverview', () => {
  it('shows the checklist before any closed month', () => {
    const o = buildOverview({ closedMonths: [], entries: [], targets, checklist: { planning: false, balanceStarted: true } })
    expect(o.month).toBeNull()
    expect(o.checklist).toEqual({ planning: false, balanceStarted: true, closed: false })
  })

  it('has no comparison with a single month', () => {
    const o = buildOverview({ closedMonths: ['2026-09'], entries: [E('2026-09', 'asset', 'Cash', 'SCB', 1000)], targets, checklist })
    expect(o).toMatchObject({ month: '2026-09', netWorth: 1000, prev: null, contributions: [] })
    expect(o.netHistory).toHaveLength(1)
  })

  it('aggregates the latest month and compares it with the one before', () => {
    const o = buildOverview({
      closedMonths: ['2026-08', '2026-09'],
      entries: [
        E('2026-08', 'asset', 'Cash', 'SCB', 100000), E('2026-08', 'asset', 'PVD', 'PVD', 300000, 'Foundation'),
        E('2026-08', 'liability', 'Mortgage', 'บ้าน', 1_000_000), E('2026-08', 'asset', 'Real Estate', 'บ้าน', 2_000_000),
        E('2026-09', 'asset', 'Cash', 'SCB', 90000), E('2026-09', 'asset', 'PVD', 'PVD', 310000, 'Foundation'),
        E('2026-09', 'asset', 'Equity', 'RMF', 100000, 'Core'), E('2026-09', 'asset', 'Equity', 'RMF-zero', 0, 'Growth'),
        E('2026-09', 'asset', 'Emergency Funds', 'EF', 50000),
        E('2026-09', 'liability', 'Mortgage', 'บ้าน', 990_000), E('2026-09', 'asset', 'Real Estate', 'บ้าน', 2_000_000),
      ],
      targets,
      checklist,
    })
    expect(o.month).toBe('2026-09')
    expect(o.totalAssets).toBe(2_550_000)
    expect(o.totalLiabilities).toBe(990_000)
    expect(o.netWorth).toBe(1_560_000)
    expect(o.prev).toEqual({ month: '2026-08', netWorth: 1_400_000 })
    expect(o.netHistory.map((h) => [h.month, h.label, h.net])).toEqual([['2026-09', "ก.ย. '26", 1_560_000], ['2026-08', "ส.ค. '26", 1_400_000]])
    // biggest change first; equal sizes keep the order categories appear in the latest month
    expect(o.contributions).toEqual([
      { label: 'Equity', value: 100000 }, { label: 'Emergency Funds', value: 50000 },
      { label: 'Cash', value: -10000 }, { label: 'PVD', value: 10000 }, { label: 'Mortgage', value: 10000 },
    ])
    expect(o.investments.map((i) => [i.symbol, i.tier, i.thb])).toEqual([['PVD', 'Foundation', 310000], ['RMF', 'Core', 100000]])
    expect(o.investTotal).toBe(410000)
    const core = o.tiers.find((t) => t.tier === 'Core')!
    expect(core.pct).toBeCloseTo(100000 / 410000)
    expect(core.gap).toBeCloseTo(0.4 * 410000 - 100000)
    expect(o.ef).toBe(50000)
    expect(o.balance.assets[0]).toEqual({ category: 'Real Estate', thb: 2_000_000, items: [{ item: 'บ้าน', thb: 2_000_000 }] })
    expect(o.categoryHistory[0].values).toEqual({ Cash: 90000, PVD: 310000, Equity: 100000, 'Emergency Funds': 50000, 'Real Estate': 2_000_000 })
  })
})
```

- [ ] **Step 2: Run to see it fail**

Run: `pnpm test test/shared-overview.test.ts`
Expected: FAIL — cannot resolve `../shared/overview`.

- [ ] **Step 3: Write `shared/overview.ts`**

```ts
import { monthLabel } from './month'
import { TIERS, type BalanceGroup, type BalanceSide, type Overview, type Tier } from './types'

export interface OverviewEntry {
  month: string
  side: BalanceSide
  category: string
  item: string
  tier: Tier | null
  type: string | null
  country: string | null
  thb: number
}
export interface OverviewInput {
  closedMonths: string[]
  entries: OverviewEntry[]                       // rows of closed months only
  targets: Partial<Record<Tier, number>>
  checklist: { planning: boolean; balanceStarted: boolean }
}

const HISTORY = 24
const sum = (xs: { thb: number }[]) => xs.reduce((s, x) => s + x.thb, 0)

function groups(rows: OverviewEntry[], side: BalanceSide): BalanceGroup[] {
  const cats = new Map<string, BalanceGroup>()
  for (const r of rows.filter((x) => x.side === side && x.thb !== 0)) {
    const g = cats.get(r.category) ?? { category: r.category, thb: 0, items: [] }
    g.thb += r.thb
    g.items.push({ item: r.item, thb: r.thb })
    cats.set(r.category, g)
  }
  return [...cats.values()].map((g) => ({ ...g, items: g.items.sort((a, b) => b.thb - a.thb) })).sort((a, b) => b.thb - a.thb)
}

/** What moved net worth since the previous closed month, per category; a debt going down counts as a gain */
function contributionsOf(latest: OverviewEntry[], before: OverviewEntry[]) {
  const d = new Map<string, { label: string; value: number }>()
  const add = (r: OverviewEntry, sign: number) => {
    const k = `${r.side}|${r.category}`
    const c = d.get(k) ?? { label: r.category, value: 0 }
    c.value += sign * (r.side === 'asset' ? r.thb : -r.thb)
    d.set(k, c)
  }
  for (const r of latest) add(r, 1)
  for (const r of before) add(r, -1)
  return [...d.values()].filter((c) => Math.abs(c.value) >= 1).sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
}

export function buildOverview(input: OverviewInput): Overview {
  const months = [...new Set(input.closedMonths)].sort((a, b) => b.localeCompare(a)).slice(0, HISTORY) // newest first
  const checklist = { ...input.checklist, closed: months.length > 0 }
  if (!months.length) {
    return { checklist, month: null, netWorth: 0, totalAssets: 0, totalLiabilities: 0, prev: null, netHistory: [], balance: { assets: [], liabilities: [] },
      categoryHistory: [], contributions: [], investTotal: 0, tiers: [], investments: [], ef: 0 }
  }
  const byMonth = new Map(months.map((m) => [m, input.entries.filter((e) => e.month === m)]))
  const latest = months[0]
  const rows = byMonth.get(latest)!
  const assets = groups(rows, 'asset')
  const liabilities = groups(rows, 'liability')
  const totalAssets = sum(assets)
  const totalLiabilities = sum(liabilities)

  const netHistory = months.map((m) => {
    const r = byMonth.get(m)!
    const a = sum(r.filter((x) => x.side === 'asset'))
    const l = sum(r.filter((x) => x.side === 'liability'))
    return { month: m, label: monthLabel(m), assets: a, liabilities: l, net: a - l, live: false }
  })
  const categoryHistory = months.map((m) => {
    const values: Record<string, number> = {}
    for (const r of byMonth.get(m)!.filter((x) => x.side === 'asset')) values[r.category] = (values[r.category] ?? 0) + r.thb
    return { month: m, label: monthLabel(m), live: false, values }
  })
  const prevMonth = months[1] ?? null

  const investments = rows.filter((r) => r.side === 'asset' && r.tier && r.thb > 0)
    .map((r) => ({ symbol: r.item, tier: r.tier!, type: r.type ?? 'Cash', country: r.country ?? 'Thailand', thb: r.thb }))
    .sort((a, b) => b.thb - a.thb)
  const investTotal = sum(investments)
  const tiers = TIERS.map((tier) => {
    const thb = sum(investments.filter((x) => x.tier === tier))
    const target = input.targets[tier] ?? 0
    return { tier, thb, pct: investTotal ? thb / investTotal : 0, target, gap: target * investTotal - thb }
  })

  return {
    checklist,
    month: latest,
    netWorth: totalAssets - totalLiabilities,
    totalAssets,
    totalLiabilities,
    prev: prevMonth ? { month: prevMonth, netWorth: netHistory[1].net } : null,
    netHistory,
    balance: { assets, liabilities },
    categoryHistory,
    contributions: prevMonth ? contributionsOf(rows, byMonth.get(prevMonth)!) : [],
    investTotal,
    tiers,
    investments,
    ef: sum(rows.filter((r) => r.side === 'asset' && r.category === 'Emergency Funds')),
  }
}
```

- [ ] **Step 4: Run the pure tests**

Run: `pnpm test test/shared-overview.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing API tests**

`test/overview.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { bangkokMonth } from '../shared/month'
import type { Overview } from '../shared/types'
import { call, login, ok } from './helpers'

const cur = bangkokMonth()
const get = (cookie: string) => ok<Overview>(call('/api/overview', { cookie }))

describe('overview', () => {
  it('ticks the checklist as the user goes and ignores drafts', async () => {
    const { cookie } = await login()
    expect((await get(cookie)).checklist).toEqual({ planning: false, balanceStarted: false, closed: false })
    await call('/api/planning/main/lines', { cookie, json: { type: 'Income', category: 'Salary', item: 'เงินเดือน', thb: 50000, expr: null, account: null } })
    expect((await get(cookie)).checklist.planning).toBe(true)
    await call(`/api/balance/${cur}/start`, { cookie, json: {} })
    await call(`/api/balance/${cur}/items`, { cookie, json: { side: 'asset', category: 'Cash', item: 'SCB', tier: null, type: null, country: null, thb: 5000 } })
    let o = await get(cookie)
    expect(o.checklist.balanceStarted).toBe(true)
    expect(o.month).toBeNull()
    await call(`/api/balance/${cur}/close`, { cookie, json: {} })
    o = await get(cookie)
    expect(o).toMatchObject({ month: cur, netWorth: 5000, checklist: { planning: true, balanceStarted: true, closed: true } })
  })

  it('saves tier targets that add up to 100%', async () => {
    const { cookie } = await login()
    const put = (json: unknown) => call('/api/tier-targets', { method: 'PUT', cookie, json })
    await ok(put({ Foundation: 0.2, Core: 0.5, Growth: 0.2, 'High Risk': 0.1 }))
    await call(`/api/balance/${cur}/start`, { cookie, json: {} })
    await call(`/api/balance/${cur}/items`, { cookie, json: { side: 'asset', category: 'Equity', item: 'RMF', tier: 'Core', type: 'Fund', country: 'Global', thb: 1000 } })
    await call(`/api/balance/${cur}/close`, { cookie, json: {} })
    expect((await get(cookie)).tiers.map((t) => [t.tier, t.target])).toEqual([['Foundation', 0.2], ['Core', 0.5], ['Growth', 0.2], ['High Risk', 0.1]])
    expect((await put({ Foundation: 0.2, Core: 0.5, Growth: 0.2, 'High Risk': 0.2 })).status).toBe(400)
    expect((await put({ Foundation: 1.2, Core: -0.2, Growth: 0, 'High Risk': 0 })).status).toBe(400)
    expect((await put({ Foundation: 0.5, Core: 0.5, Growth: 0 })).status).toBe(400)
  })
})
```

- [ ] **Step 6: Run to see them fail**

Run: `pnpm test test/overview.test.ts`
Expected: FAIL — `/api/overview` answers 404.

- [ ] **Step 7: Write `worker/overview.ts`**

```ts
import { buildOverview, type OverviewEntry } from '../shared/overview'
import { TIERS, type Overview, type Tier } from '../shared/types'
import { all, one, stmt, type Db } from './db'
import { bad } from './http'

export async function getOverview(db: Db, uid: number): Promise<Overview> {
  const [closed, entries, targets, planned, started] = await Promise.all([
    all<{ month: string }>(db, "SELECT month FROM balance_months WHERE user_id = ? AND status = 'closed'", uid),
    all<OverviewEntry>(db, `
      SELECT e.month, i.side, i.category, i.item, i.tier, i.type, i.country, e.thb FROM balance_entries e
      JOIN balance_items i ON i.user_id = e.user_id AND i.id = e.item_id
      JOIN balance_months m ON m.user_id = e.user_id AND m.month = e.month
      WHERE e.user_id = ? AND m.status = 'closed'`, uid),
    all<{ tier: Tier; target: number }>(db, 'SELECT tier, target FROM tier_targets WHERE user_id = ?', uid),
    one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM budget_lines WHERE user_id = ? AND scenario = 'main'", uid),
    one<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM balance_months WHERE user_id = ?', uid),
  ])
  return buildOverview({
    closedMonths: closed.map((m) => m.month),
    entries,
    targets: Object.fromEntries(targets.map((t) => [t.tier, t.target])),
    checklist: { planning: (planned?.n ?? 0) > 0, balanceStarted: (started?.n ?? 0) > 0 },
  })
}

/** Portfolio targets per tier as fractions; all four, each 0..1, together 1 (± 0.001) */
export async function setTierTargets(db: Db, uid: number, input: unknown) {
  const v = (input ?? {}) as Record<string, unknown>
  const vals = TIERS.map((t) => v[t])
  if (vals.some((x) => typeof x !== 'number' || !Number.isFinite(x) || x < 0 || x > 1)) throw bad('เป้าแต่ละกลุ่มต้องอยู่ระหว่าง 0–100%')
  if (Math.abs((vals as number[]).reduce((s, x) => s + x, 0) - 1) > 0.001) throw bad('เป้ารวมกันต้องได้ 100%')
  await db.batch(TIERS.map((t, i) => stmt(db,
    'INSERT INTO tier_targets (user_id, tier, target) VALUES (?, ?, ?) ON CONFLICT (user_id, tier) DO UPDATE SET target = excluded.target',
    uid, t, vals[i])))
}
```

- [ ] **Step 8: Wire the routes**

In `worker/index.ts` add `import { getOverview, setTierTargets } from './overview'` and, below the balance routes:

```ts
// ---- Overview ----
app.get('/api/overview', async (c) => c.json(await getOverview(c.env.DB, c.var.uid)))
app.put('/api/tier-targets', async (c) => {
  await setTierTargets(c.env.DB, c.var.uid, await body(c))
  return c.json(await getOverview(c.env.DB, c.var.uid))
})
```

- [ ] **Step 9: Run all tests, typecheck, commit**

```bash
pnpm test
pnpm typecheck
git config user.email   # c.soonue@gmail.com
git add shared/overview.ts worker/overview.ts worker/index.ts test/shared-overview.test.ts test/overview.test.ts
git commit -m "Overview API: closed months only, net worth history, contributions, portfolio vs tier targets; PUT tier targets"
```

---

### Task 6: Cross-user isolation suite

**Files:**
- Test: `test/isolation.test.ts`

**Interfaces:**
- Consumes: every HTTP endpoint from Tasks 2–5; test helpers.
- Produces: nothing new — a suite that fails if any endpoint lets user B read or change user A's data.

- [ ] **Step 1: Write the suite**

`test/isolation.test.ts`:

```ts
import { beforeAll, describe, expect, it } from 'vitest'
import { addMonth, bangkokMonth } from '../shared/month'
import type { Balance, Planning } from '../shared/types'
import { call, login, ok, sql, uidOf } from './helpers'

const cur = bangkokMonth()
const next = addMonth(cur, 1)
let A: { email: string; cookie: string }
let B: { email: string; cookie: string }
let lineId: number
let itemId: number

/** Everything A can see, to prove it did not change */
const snapshot = async () => JSON.stringify(await Promise.all([
  ok(call('/api/planning', { cookie: A.cookie })),
  ok(call(`/api/balance?month=${cur}`, { cookie: A.cookie })),
  ok(call(`/api/balance?month=${next}`, { cookie: A.cookie })),
  ok(call('/api/overview', { cookie: A.cookie })),
]))

beforeAll(async () => {
  A = await login()
  B = await login()
  // A: a plan line, a closed month and an open draft with one item
  const p = await ok<Planning>(call('/api/planning/main/lines', { cookie: A.cookie, json: { type: 'Expense', category: 'Housing', item: 'A-rent', thb: 9000, expr: null, account: 'A-bank' } }))
  lineId = p.scenarios[0].lines[0].id
  await call(`/api/balance/${cur}/start`, { cookie: A.cookie, json: {} })
  const b = await ok<Balance>(call(`/api/balance/${cur}/items`, { cookie: A.cookie, json: { side: 'asset', category: 'Cash', item: 'A-cash', tier: null, type: null, country: null, thb: 1234 } }))
  itemId = b.rows[0].id
  await call(`/api/balance/${cur}/close`, { cookie: A.cookie, json: {} })
  await call(`/api/balance/${next}/start`, { cookie: A.cookie, json: {} })
  // B has its own draft for the same month so month checks pass and only ownership stops B
  await call(`/api/balance/${cur}/start`, { cookie: B.cookie, json: {} })
})

describe("user B cannot touch user A's data", () => {
  it('sees none of it', async () => {
    const p = await ok<Planning>(call('/api/planning', { cookie: B.cookie }))
    expect(p.scenarios.flatMap((s) => s.lines)).toEqual([])
    const b = await ok<Balance>(call(`/api/balance?month=${cur}`, { cookie: B.cookie }))
    expect(b.rows).toEqual([])
    expect(b.hidden).toEqual([])
    expect(b.transfers).toBeNull()
    expect((await ok(call('/api/overview', { cookie: B.cookie }))).month).toBeNull()
  })

  it('gets 404 for every write aimed at A', async () => {
    const before = await snapshot()
    const c = B.cookie
    const attempts: [string, Parameters<typeof call>[1]][] = [
      [`/api/planning/lines/${lineId}`, { method: 'PATCH', cookie: c, json: { thb: 1 } }],
      [`/api/planning/lines/${lineId}`, { method: 'DELETE', cookie: c, json: {} }],
      [`/api/balance/${cur}/entries/${itemId}`, { method: 'PUT', cookie: c, json: { thb: 1, expr: null } }],
      [`/api/balance/${cur}/entries/${itemId}`, { method: 'DELETE', cookie: c, json: {} }],
      [`/api/balance/${cur}/entries/${itemId}/restore`, { cookie: c, json: {} }],
      [`/api/balance/${cur}/items/${itemId}`, { method: 'PATCH', cookie: c, json: { tier: 'Core', type: 'x', country: 'y' } }],
      [`/api/balance/${next}/close`, { cookie: c, json: {} }],
      [`/api/balance/${next}`, { method: 'DELETE', cookie: c, json: {} }],
      [`/api/balance/${next}/transfers/A-bank`, { cookie: c, json: { done: true } }],
      [`/api/balance/${next}/items`, { cookie: c, json: { side: 'asset', category: 'Cash', item: 'x', tier: null, type: null, country: null } }],
    ]
    for (const [path, init] of attempts) {
      const res = await call(path, init)
      expect([path, res.status]).toEqual([path, 404])
    }
    // a confirm on B's own month naming A's item changes nothing anywhere
    expect((await call(`/api/balance/${cur}/confirm`, { cookie: c, json: { ids: [itemId] } })).status).toBe(200)
    expect(await snapshot()).toBe(before)
  })

  it('cannot link its rows to A rows even with raw SQL', async () => {
    const b = await uidOf(B.email)
    await expect(sql('INSERT INTO balance_entries (user_id, month, item_id, thb) VALUES (?, ?, ?, 1)', b, cur, itemId).run()).rejects.toThrow(/FOREIGN KEY/i)
  })
})
```

- [ ] **Step 2: Run the suite**

Run: `pnpm test test/isolation.test.ts`
Expected: PASS (the ownership checks from Tasks 3–5 already hold). Any 200 in the attempts loop is a real bug: fix the owning function in `worker/*.ts` (add `AND user_id = ?` / `requireItem`), not the test.

- [ ] **Step 3: Run everything, commit**

```bash
pnpm test && pnpm typecheck
git config user.email   # c.soonue@gmail.com
git add test/isolation.test.ts
git commit -m "Tests: cross-user isolation — every write aimed at another user's rows answers 404, reads show nothing, FK blocks raw links"
```

---

### Task 7: SPA foundation — UI kit, API client, login page, layout

**Files:**
- Copy from `../portfolio` (unchanged): `src/index.css`, `src/components/ui/*`, `src/components/chart-card.tsx`, `src/components/sankey.tsx`, `src/components/money-input.tsx`, `src/components/stat.tsx`, `src/lib/format.ts`, `src/lib/expr.ts`, `src/lib/utils.ts`, `components.json`
- Copy then modify: `src/components/charts.tsx`, `src/components/category-icon.tsx`
- Create: `shared/categories.ts`, `src/lib/categories.ts`, `src/lib/api.ts`, `src/lib/google.ts`, `src/components/chips.tsx`, `src/components/layout.tsx`, `src/pages/login.tsx`, `src/App.tsx`, `src/pages/overview.tsx` · `planning.tsx` · `balance.tsx` (one-line stand-ins, replaced in Tasks 8–10)
- Replace: `src/main.tsx`
- Test: `test/shared-categories.test.ts`

**Interfaces:**
- Consumes: every type in `shared/types.ts`; HTTP API from Tasks 2–5.
- Produces:
  - `shared/categories.ts`: `CATEGORY_TH: Record<string, string>`, `interface CategoryDef { side; category; chips: string[] }`, `BALANCE_CATEGORIES: CategoryDef[]`, `interface PlanningChip { label; category }`, `PLANNING_CHIPS: Record<BudgetType, PlanningChip[]>`, `unusedChips<T extends string | { label: string }>(chips: T[], used: string[]): T[]`, `TIER_INFO: Record<Tier, string>`, `INVEST_TYPES`, `COUNTRIES`.
  - `src/lib/api.ts`: re-exports everything in `shared/types.ts`; `SERIES`, `OTHER_COLOR`, `TIER_COLOR`; `class ApiError { status; body }`; `setUnauthorizedHandler(fn)`; `api` = `{ authConfig, loginGoogle, logout, me, overview, setTierTargets, planning, addLine, updateLine, deleteLine, copyScenario, balance, startMonth, closeMonth, discardDraft, setEntry, removeEntry, restoreEntry, confirmRows, setTransfer, addBalanceItem, classifyItem }`.
  - `src/lib/google.ts`: `loadGoogle(): Promise<GoogleId>`; `window.google` typing.
  - `src/components/chips.tsx`: `Chips({ chips: string[]; onPick(label: string): void; className? })` — last chip "+ เพิ่มเอง" calls `onPick('')`.
  - `src/components/layout.tsx`: `Layout({ me, onLogout })`, `PageState({ error? })`.
  - `src/pages/login.tsx`: `LoginPage({ onLogin(me): void; denied?: string | null })`.

- [ ] **Step 1: Write the failing categories test**

`test/shared-categories.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { BALANCE_CATEGORIES, CATEGORY_TH, PLANNING_CHIPS, TIER_INFO, unusedChips } from '../shared/categories'
import { TIERS } from '../shared/types'

describe('categories and chips', () => {
  it('has a Thai name for every balance category and planning chip category', () => {
    for (const d of BALANCE_CATEGORIES) expect([d.category, CATEGORY_TH[d.category]]).toEqual([d.category, expect.any(String)])
    for (const chips of Object.values(PLANNING_CHIPS)) for (const c of chips) expect([c.category, CATEGORY_TH[c.category]]).toEqual([c.category, expect.any(String)])
  })

  it('lists assets before liabilities, with the new debt categories', () => {
    const sides = BALANCE_CATEGORIES.map((d) => d.side)
    expect(sides.indexOf('liability')).toBeGreaterThan(sides.lastIndexOf('asset'))
    expect(BALANCE_CATEGORIES.filter((d) => d.side === 'liability').map((d) => d.category)).toEqual(['Mortgage', 'Car Loan', 'Credit Card', 'Other Debts'])
  })

  it('hides chips whose item already exists (case and spaces ignored)', () => {
    expect(unusedChips(['PVD', 'RMF', 'SSF'], [' rmf ', 'Other'])).toEqual(['PVD', 'SSF'])
    expect(unusedChips(PLANNING_CHIPS.Income, ['เงินเดือน']).map((c) => c.label)).toEqual(['รายได้เสริม', 'ค่าเช่า', 'ดอกเบี้ย / ปันผล'])
  })

  it('explains every tier', () => {
    for (const t of TIERS) expect(TIER_INFO[t]).toEqual(expect.any(String))
  })
})
```

Run: `pnpm test test/shared-categories.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 2: Write `shared/categories.ts`**

```ts
import type { BalanceSide, BudgetType, Tier } from './types'

/** Thai name under the (English) category key */
export const CATEGORY_TH: Record<string, string> = {
  Cash: 'เงินสด / บัญชีออมทรัพย์',
  'Emergency Funds': 'เงินสำรองฉุกเฉิน',
  PVD: 'กองทุนสำรองเลี้ยงชีพ',
  'Insurance & Social Security': 'ประกัน & ประกันสังคม',
  Bond: 'ตราสารหนี้',
  Gold: 'ทองคำ',
  Equity: 'หุ้น & กองทุนหุ้น',
  Crypto: 'คริปโต',
  'Real Estate': 'อสังหาริมทรัพย์',
  Mortgage: 'สินเชื่อบ้าน',
  'Car Loan': 'สินเชื่อรถ',
  'Credit Card': 'บัตรเครดิต',
  'Other Debts': 'หนี้อื่นๆ',
  Others: 'อื่นๆ',
  Salary: 'เงินเดือน',
  Rental: 'ค่าเช่า',
  Family: 'ครอบครัว',
  Friends: 'เพื่อน',
  'Interest Money': 'ดอกเบี้ย / ปันผล',
  Saving: 'เงินออม',
  Investment: 'เงินลงทุน',
  Education: 'การศึกษา',
  Housing: 'ที่อยู่อาศัย',
  'Bills & Utilities': 'ค่าน้ำไฟ / โทรศัพท์',
  'Daily Living': 'ค่าใช้จ่ายประจำวัน',
  Tax: 'ภาษี',
  Donation: 'บริจาค',
  Insurance: 'ประกัน',
  Debt: 'ผ่อนสินค้า',
  Travel: 'ท่องเที่ยว',
  Activity: 'กิจกรรม',
  'Subscription Bill': 'สมาชิกรายเดือน',
  Entertainment: 'บันเทิง',
}

export interface CategoryDef { side: BalanceSide; category: string; chips: string[] }

/** Balance sheet categories in page order, with quick-add chips of items most people have */
export const BALANCE_CATEGORIES: CategoryDef[] = [
  { side: 'asset', category: 'Cash', chips: ['บัญชีออมทรัพย์', 'เงินสด'] },
  { side: 'asset', category: 'Emergency Funds', chips: ['บัญชีดอกเบี้ยสูง', 'กองทุนตลาดเงิน'] },
  { side: 'asset', category: 'PVD', chips: ['PVD'] },
  { side: 'asset', category: 'Insurance & Social Security', chips: ['ประกันสังคม', 'ประกันชีวิต'] },
  { side: 'asset', category: 'Bond', chips: ['กองทุนตราสารหนี้', 'หุ้นกู้'] },
  { side: 'asset', category: 'Equity', chips: ['RMF', 'SSF', 'ThaiESG', 'หุ้นไทย', 'หุ้นต่างประเทศ'] },
  { side: 'asset', category: 'Gold', chips: ['ทองคำแท่ง'] },
  { side: 'asset', category: 'Crypto', chips: ['BTC'] },
  { side: 'asset', category: 'Real Estate', chips: ['บ้าน / คอนโด'] },
  { side: 'asset', category: 'Others', chips: [] },
  { side: 'liability', category: 'Mortgage', chips: ['สินเชื่อบ้าน'] },
  { side: 'liability', category: 'Car Loan', chips: ['สินเชื่อรถ'] },
  { side: 'liability', category: 'Credit Card', chips: ['บัตรเครดิต'] },
  { side: 'liability', category: 'Other Debts', chips: [] },
]

export interface PlanningChip { label: string; category: string }

/** Planning quick-add chips per section; the chip's label becomes the line's item */
export const PLANNING_CHIPS: Record<BudgetType, PlanningChip[]> = {
  Income: [
    { label: 'เงินเดือน', category: 'Salary' },
    { label: 'รายได้เสริม', category: 'Others' },
    { label: 'ค่าเช่า', category: 'Rental' },
    { label: 'ดอกเบี้ย / ปันผล', category: 'Interest Money' },
  ],
  Saving: [
    { label: 'เงินสำรองฉุกเฉิน', category: 'Saving' },
    { label: 'เงินออม', category: 'Saving' },
    { label: 'PVD', category: 'Investment' },
    { label: 'RMF', category: 'Investment' },
    { label: 'ThaiESG', category: 'Investment' },
    { label: 'กองทุนหุ้น', category: 'Investment' },
  ],
  Expense: [
    { label: 'ค่าเช่าบ้าน', category: 'Housing' },
    { label: 'ผ่อนบ้าน', category: 'Mortgage' },
    { label: 'อาหาร', category: 'Daily Living' },
    { label: 'เดินทาง', category: 'Daily Living' },
    { label: 'ค่าน้ำไฟ / โทรศัพท์', category: 'Bills & Utilities' },
    { label: 'ประกัน', category: 'Insurance' },
    { label: 'ผ่อนของ / บัตรเครดิต', category: 'Debt' },
    { label: 'ช้อปปิ้ง', category: 'Daily Living' },
    { label: 'ท่องเที่ยว', category: 'Travel' },
  ],
}

/** Chips whose name is not used yet among the given item names (case and surrounding spaces ignored) */
export function unusedChips<T extends string | { label: string }>(chips: T[], used: string[]): T[] {
  const taken = new Set(used.map((u) => u.trim().toLowerCase()))
  return chips.filter((c) => !taken.has((typeof c === 'string' ? c : c.label).trim().toLowerCase()))
}

export const TIER_INFO: Record<Tier, string> = {
  Foundation: 'เงินต้นปลอดภัย',
  Core: 'ลงทุนหลักระยะยาว',
  Growth: 'เน้นโต ผันผวนขึ้น',
  'High Risk': 'เสี่ยงสูง',
}

export const INVEST_TYPES = ['Cash', 'Bonds', 'Equity', 'ETF', 'Commodities', 'Crypto']
export const COUNTRIES = ['Thailand', 'Global', 'United States', 'China', 'Vietnam', 'Netherlands', 'Crypto']
```

Run: `pnpm test test/shared-categories.test.ts` — Expected: PASS.

- [ ] **Step 3: Copy the UI kit from portfolio**

```bash
cd /Users/chin_mini/Desktop/ChinOS/apps/money-plan
P=../portfolio
mkdir -p src/components/ui
cp $P/src/index.css src/index.css
cp $P/src/components/ui/*.tsx src/components/ui/
cp $P/src/components/chart-card.tsx $P/src/components/sankey.tsx $P/src/components/money-input.tsx $P/src/components/stat.tsx \
   $P/src/components/charts.tsx $P/src/components/category-icon.tsx src/components/
cp $P/src/lib/format.ts $P/src/lib/expr.ts $P/src/lib/utils.ts src/lib/
cp $P/components.json components.json
```

- [ ] **Step 4: Adapt `charts.tsx` and `category-icon.tsx`**

In `src/components/charts.tsx`:
1. Change the api import line to `import { OTHER_COLOR, TIER_COLOR, type Overview } from '@/lib/api'`.
2. Delete the whole `TierColumns` function (the 4-line block starting `/** Stacked columns per month, newest on the left`) and the whole `TierShareMultiples` function (from `/** One small line chart per tier:` to its closing `}`) — their data (`tierHistory`) does not exist in money-plan.
3. Replace `netConfig` with Thai labels:

```ts
const netConfig = {
  assets: { label: 'สินทรัพย์', color: 'var(--chart-1)' },
  liabilities: { label: 'หนี้สิน', color: 'var(--chart-2)' },
  net: { label: 'สุทธิ', color: 'var(--chart-3)' },
} satisfies ChartConfig
```

4. In `AllocationBullets`, replace the aria-label, the title and the gap text with Thai:

```tsx
            <div className="relative h-6" role="img" aria-label={`${t.tier} ${pct(t.pct)} ของพอร์ต เป้า ${pct(t.target, 0)}`}>
              <div className="absolute inset-y-2 left-0 right-0 rounded-full bg-muted" />
              <div className="absolute inset-y-2 left-0 rounded-r-[4px]" style={{ width: `${(t.pct / max) * 100}%`, background: TIER_COLOR[t.tier] }} />
              <div className="absolute inset-y-0 w-0.5 rounded-full bg-foreground" style={{ left: `calc(${(t.target / max) * 100}% - 1px)` }} title={`เป้า ${pct(t.target, 0)}`} />
            </div>
```

and

```tsx
              <span className={cn('block text-xs', over ? 'text-muted-foreground' : 'text-foreground')}>
                {over ? `เกินเป้า ${thbCompact(-t.gap)}` : `อีก ${thbCompact(t.gap)} ถึงเป้า`}
              </span>
```

In `src/components/category-icon.tsx`: add `Car` to the lucide import list, and add to `ICONS` after `Mortgage: House,`:

```ts
  'Car Loan': Car,
  'Credit Card': CreditCard,
  'Other Debts': Receipt,
```

- [ ] **Step 5: Write the client libraries**

`src/lib/categories.ts`:

```ts
export { CATEGORY_TH } from '@shared/categories'
```

`src/lib/api.ts`:

```ts
import type { AuthConfig, Balance, BudgetLineInput, Classification, Me, NewBalanceItem, Overview, Planning, ScenarioId, Tier, TierTargets } from '@shared/types'

export * from '@shared/types'

/** Categorical slots in validated order (dataviz reference palette); a 9th series folds into Other */
export const SERIES = Array.from({ length: 8 }, (_, i) => `var(--chart-${i + 1})`)
export const OTHER_COLOR = 'var(--baseline)'
// Fixed categorical slots — colour follows the entity, never its rank
export const TIER_COLOR: Record<Tier, string> = {
  Foundation: 'var(--chart-1)',
  Core: 'var(--chart-2)',
  Growth: 'var(--chart-3)',
  'High Risk': 'var(--chart-4)',
}

export class ApiError extends Error {
  status: number
  body: Record<string, unknown>
  constructor(status: number, message: string, body: Record<string, unknown>) {
    super(message)
    this.status = status
    this.body = body
  }
}

// App sets this so any 401 (session gone mid-use) sends the user back to the login page
let onUnauthorized: () => void = () => {}
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn }

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin' }
  // every write is JSON (the server refuses anything else), even when there is nothing to send
  if (method !== 'GET') {
    init.headers = { 'content-type': 'application/json' }
    init.body = JSON.stringify(body ?? {})
  }
  const r = await fetch(url, init)
  if (r.ok) return (await r.json()) as T
  let data: Record<string, unknown> = {}
  try { data = await r.json() } catch { /* not JSON */ }
  if (r.status === 401) onUnauthorized()
  throw new ApiError(r.status, typeof data.error === 'string' ? data.error : `HTTP ${r.status}`, data)
}
const get = <T>(url: string) => request<T>('GET', url)

export const api = {
  authConfig: () => get<AuthConfig>('/api/auth/config'),
  loginGoogle: (credential: string) => request<Me>('POST', '/api/auth/google', { credential }),
  logout: () => request<{ ok: true }>('POST', '/api/auth/logout'),
  me: () => get<Me>('/api/me'),

  overview: () => get<Overview>('/api/overview'),
  setTierTargets: (t: TierTargets) => request<Overview>('PUT', '/api/tier-targets', t),

  planning: () => get<Planning>('/api/planning'),
  addLine: (scenario: ScenarioId, line: BudgetLineInput) => request<Planning>('POST', `/api/planning/${scenario}/lines`, line),
  updateLine: (id: number, patch: Partial<BudgetLineInput>) => request<Planning>('PATCH', `/api/planning/lines/${id}`, patch),
  deleteLine: (id: number) => request<Planning>('DELETE', `/api/planning/lines/${id}`),
  copyScenario: (to: ScenarioId) => request<Planning>('POST', `/api/planning/${to}/copy`, { from: 'main' }),

  balance: (month?: string | null) => get<Balance>(`/api/balance${month ? `?month=${month}` : ''}`),
  startMonth: (month: string) => request<Balance>('POST', `/api/balance/${month}/start`),
  closeMonth: (month: string) => request<Balance>('POST', `/api/balance/${month}/close`),
  discardDraft: (month: string) => request<Balance>('DELETE', `/api/balance/${month}`),
  setEntry: (month: string, id: number, thb: number, expr: string | null) => request<Balance>('PUT', `/api/balance/${month}/entries/${id}`, { thb, expr }),
  removeEntry: (month: string, id: number) => request<Balance>('DELETE', `/api/balance/${month}/entries/${id}`),
  restoreEntry: (month: string, id: number) => request<Balance>('POST', `/api/balance/${month}/entries/${id}/restore`),
  confirmRows: (month: string, ids: number[]) => request<Balance>('POST', `/api/balance/${month}/confirm`, { ids }),
  setTransfer: (month: string, bank: string, done: boolean) => request<Balance>('POST', `/api/balance/${month}/transfers/${encodeURIComponent(bank)}`, { done }),
  addBalanceItem: (month: string, item: NewBalanceItem) => request<Balance>('POST', `/api/balance/${month}/items`, item),
  classifyItem: (month: string, id: number, c: Classification) => request<Balance>('PATCH', `/api/balance/${month}/items/${id}`, c),
}
```

`src/lib/google.ts`:

```ts
export interface GoogleId {
  initialize(options: { client_id: string; callback: (response: { credential: string }) => void; ux_mode?: 'popup' | 'redirect'; auto_select?: boolean }): void
  renderButton(parent: HTMLElement, options: Record<string, unknown>): void
  disableAutoSelect(): void
}

declare global {
  interface Window { google?: { accounts: { id: GoogleId } } }
}

const SRC = 'https://accounts.google.com/gsi/client'
let loading: Promise<GoogleId> | null = null

/** Google Identity Services, loaded once (only the login page needs it) */
export function loadGoogle(): Promise<GoogleId> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id)
  return (loading ??= new Promise<GoogleId>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SRC
    s.async = true
    s.onload = () => (window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new Error('โหลดปุ่ม Google ไม่ได้')))
    s.onerror = () => {
      loading = null
      reject(new Error('โหลดปุ่ม Google ไม่ได้'))
    }
    document.head.appendChild(s)
  }))
}
```

- [ ] **Step 6: Write the shared components**

`src/components/chips.tsx`:

```tsx
import { cn } from '@/lib/utils'

const CHIP = 'rounded-full border border-dashed border-input px-3 py-1 text-sm text-muted-foreground transition-colors hover:border-ring hover:text-foreground'

/** Quick-add buttons for common items; the last one ("เพิ่มเอง") opens an empty form */
export function Chips({ chips, onPick, className }: { chips: string[]; onPick: (label: string) => void; className?: string }) {
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {chips.map((c) => <button key={c} type="button" className={CHIP} onClick={() => onPick(c)}>+ {c}</button>)}
      <button type="button" className={CHIP} onClick={() => onPick('')}>+ เพิ่มเอง</button>
    </div>
  )
}
```

`src/components/layout.tsx`:

```tsx
import { LogOut } from 'lucide-react'
import { NavLink, Outlet } from 'react-router'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { api, type Me } from '@/lib/api'
import { cn } from '@/lib/utils'

const links = [
  { to: '/', label: 'Overview' },
  { to: '/planning', label: 'Planning' },
  { to: '/balance', label: 'Balance' },
]

export function Layout({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const logout = async () => {
    try { await api.logout() } catch { /* the page forgets the session either way */ }
    window.google?.accounts.id.disableAutoSelect()
    onLogout()
  }
  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/85 backdrop-blur">
        <div className="flex h-14 items-center gap-6 px-8">
          <span className="font-semibold tracking-tight">money-plan</span>
          <nav className="flex gap-1 text-sm">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end
                className={({ isActive }) => cn('rounded-md px-3 py-1.5 transition-colors', isActive ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground')}>
                {l.label}
              </NavLink>
            ))}
          </nav>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" className="ml-auto h-9 gap-2 px-2 text-sm text-muted-foreground" aria-label="เมนูบัญชี" />}>
              <span>{me.email}</span>
              <Avatar me={me} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="truncate text-sm text-foreground">
                  {me.name ?? me.email}
                  <span className="block text-xs font-normal text-muted-foreground">{me.email}</span>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout}><LogOut /> ออกจากระบบ</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-8 py-8">
        <Outlet />
      </main>
    </div>
  )
}

function Avatar({ me }: { me: Me }) {
  return me.picture
    ? <img src={me.picture} alt="" referrerPolicy="no-referrer" className="size-7 rounded-full" />
    : <span className="flex size-7 items-center justify-center rounded-full bg-chart-1 text-xs font-semibold text-white">{me.email[0]?.toUpperCase()}</span>
}

export function PageState({ error }: { error?: unknown }) {
  return (
    <div className="py-24 text-center text-sm text-muted-foreground">
      {error ? `โหลดข้อมูลไม่ได้: ${error instanceof Error ? error.message : String(error)}` : 'กำลังโหลด…'}
    </div>
  )
}
```

`src/pages/login.tsx` (mockup `5-login.html`):

```tsx
import { useEffect, useRef, useState } from 'react'
import { CircleAlert } from 'lucide-react'
import { api, ApiError, type AuthConfig, type Me } from '@/lib/api'
import { loadGoogle } from '@/lib/google'

type Problem = { title: string; detail?: string }
const notAllowed = (email: string): Problem => ({ title: `${email} ยังไม่ได้รับสิทธิ์`, detail: 'ขอให้ Chin เพิ่มอีเมลนี้ก่อน แล้วลองใหม่อีกครั้ง' })
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function LoginPage({ onLogin, denied }: { onLogin: (me: Me) => void; denied?: string | null }) {
  const button = useRef<HTMLDivElement>(null)
  const [config, setConfig] = useState<AuthConfig | null>(null)
  const [problem, setProblem] = useState<Problem | null>(denied ? notAllowed(denied) : null)

  useEffect(() => {
    api.authConfig().then(setConfig, (e) => setProblem({ title: 'ติดต่อเซิร์ฟเวอร์ไม่ได้', detail: message(e) }))
  }, [])

  useEffect(() => {
    if (!config?.googleClientId) return
    let alive = true
    loadGoogle().then((g) => {
      if (!alive || !button.current) return
      g.initialize({
        client_id: config.googleClientId,
        ux_mode: 'popup',
        callback: ({ credential }) => {
          setProblem(null)
          api.loginGoogle(credential).then(onLogin, (e: unknown) =>
            setProblem(e instanceof ApiError && e.body.error === 'not_allowed' ? notAllowed(String(e.body.email)) : { title: 'เข้าสู่ระบบไม่สำเร็จ', detail: message(e) }))
        },
      })
      g.renderButton(button.current, { theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with', locale: 'th', width: 260 })
    }, (e) => setProblem({ title: 'โหลดปุ่ม Google ไม่ได้', detail: message(e) }))
    return () => { alive = false }
  }, [config, onLogin])

  return (
    <div className="grid min-h-svh place-items-center bg-[radial-gradient(ellipse_at_top,var(--hero-from),var(--background)_60%)] px-6">
      <div className="w-[380px] rounded-2xl border bg-card p-7 text-center shadow-[var(--card-shadow)]">
        <div className="mx-auto mb-3 grid size-11 place-items-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">฿</div>
        <h1 className="text-xl font-semibold tracking-tight">money-plan</h1>
        <p className="mt-1 text-sm text-muted-foreground">วางแผนเงินรายเดือน · งบดุลส่วนตัว · สรุปการเงินของคุณ</p>
        <div ref={button} className="mt-5 flex min-h-11 justify-center" />
        {config && !config.googleClientId && <p className="mt-2 text-sm text-warning">ยังไม่ได้ตั้ง GOOGLE_CLIENT_ID (ดู README)</p>}
        <p className="mt-3 text-xs text-muted-foreground">เฉพาะอีเมลที่ได้รับเชิญ · ข้อมูลของแต่ละคนแยกกัน คนอื่นมองไม่เห็น</p>
        {problem && (
          <div role="alert" className="mt-4 flex gap-2 rounded-xl bg-critical/10 p-3 text-left text-sm text-critical">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span><span className="font-medium">{problem.title}</span>{problem.detail && <span className="block">{problem.detail}</span>}</span>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Write the app shell**

`src/App.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react'
import { Route, Routes } from 'react-router'
import { Layout, PageState } from '@/components/layout'
import { api, ApiError, setUnauthorizedHandler, type Me } from '@/lib/api'
import { BalancePage } from '@/pages/balance'
import { LoginPage } from '@/pages/login'
import { OverviewPage } from '@/pages/overview'
import { PlanningPage } from '@/pages/planning'

/** Who is logged in decides between the login page and the app */
export function App() {
  const [me, setMe] = useState<Me | 'anon' | null>(null)
  const [denied, setDenied] = useState<string | null>(null)
  const [error, setError] = useState<unknown>()

  useEffect(() => {
    setUnauthorizedHandler(() => setMe('anon'))
    api.me().then(setMe, (e: unknown) => {
      if (e instanceof ApiError && e.status === 403) {
        setDenied(String(e.body.email ?? ''))
        setMe('anon')
      } else if (e instanceof ApiError && e.status === 401) setMe('anon')
      else setError(e)
    })
  }, [])
  const onLogin = useCallback((m: Me) => {
    setDenied(null)
    setMe(m)
  }, [])

  if (me === null) return <PageState error={error} />
  if (me === 'anon') return <LoginPage onLogin={onLogin} denied={denied} />
  return (
    <Routes>
      <Route element={<Layout me={me} onLogout={() => setMe('anon')} />}>
        <Route index element={<OverviewPage />} />
        <Route path="planning" element={<PlanningPage />} />
        <Route path="balance" element={<BalancePage />} />
      </Route>
    </Routes>
  )
}
```

`src/main.tsx` (replace the Task 1 stand-in):

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { App } from '@/App'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import './index.css'

// Warm "personal finance" tone on every page; dark follows the OS (dark values are their own validated steps)
document.documentElement.classList.add('finance')
const media = window.matchMedia('(prefers-color-scheme: dark)')
const applyTheme = () => document.documentElement.classList.toggle('dark', media.matches)
applyTheme()
media.addEventListener('change', applyTheme)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TooltipProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
      <Toaster position="bottom-right" />
    </TooltipProvider>
  </StrictMode>,
)
```

Stand-in pages so the shell builds (Tasks 8–10 overwrite each file completely):

`src/pages/overview.tsx`:

```tsx
import { PageState } from '@/components/layout'

export function OverviewPage() {
  return <PageState />
}
```

`src/pages/planning.tsx`:

```tsx
import { PageState } from '@/components/layout'

export function PlanningPage() {
  return <PageState />
}
```

`src/pages/balance.tsx`:

```tsx
import { PageState } from '@/components/layout'

export function BalancePage() {
  return <PageState />
}
```

- [ ] **Step 8: Typecheck, build, run**

```bash
pnpm typecheck && pnpm build && pnpm test
cp .dev.vars.example .dev.vars
pnpm db:migrate:local
pnpm dev
```

Expected: no type errors, build succeeds, tests pass. Open http://localhost:5173:
- with `DEV_USER_EMAIL=demo@money-plan.local` in `.dev.vars`: header shows `money-plan`, the three tabs, `demo@money-plan.local` + an initial avatar; the menu has "ออกจากระบบ".
- remove `DEV_USER_EMAIL` from `.dev.vars`, restart `pnpm dev`: the login card shows, with "ยังไม่ได้ตั้ง GOOGLE_CLIENT_ID (ดู README)" because `vars.GOOGLE_CLIENT_ID` is empty.
Put `DEV_USER_EMAIL` back afterwards.

- [ ] **Step 9: Commit**

```bash
git config user.email   # c.soonue@gmail.com
git add -A
git commit -m "SPA shell: UI kit from portfolio, typed API client (JSON writes, 401 → login), Google login page, layout with user menu"
```

---

### Task 8: Planning page

**Files:**
- Replace: `src/pages/planning.tsx` (starts as a copy of `../portfolio/src/pages/budget.tsx`)

**Interfaces:**
- Consumes: `api.planning / addLine / updateLine / deleteLine / copyScenario`; `Planning`, `Scenario`, `ScenarioId`, `BudgetLineRow`, `BudgetLineInput`, `BudgetType` (`@/lib/api`); `totals`, `partOf`, `debtOf` (`@shared/planning`); `PLANNING_CHIPS`, `unusedChips` (`@shared/categories`); `Chips` (`@/components/chips`).
- Produces: `PlanningPage` (route `/planning`).

- [ ] **Step 1: Copy the Budget page**

```bash
cp ../portfolio/src/pages/budget.tsx src/pages/planning.tsx
```

- [ ] **Step 2: Replace the imports and the local math**

Replace everything from line 1 through the end of the local `totals` function (the block that ends just before `export function BudgetPage() {`) with:

```tsx
import { useEffect, useRef, useState } from 'react'
import { Banknote, CircleAlert, CircleCheck, Copy, Ellipsis, FolderInput, PiggyBank, Receipt, Trash, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { CategoryIcon } from '@/components/category-icon'
import { RankedBars } from '@/components/charts'
import { Chips } from '@/components/chips'
import { PageState } from '@/components/layout'
import { MoneyInput } from '@/components/money-input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api, type BudgetLineInput, type BudgetLineRow, type BudgetType, type Planning, type Scenario, type ScenarioId } from '@/lib/api'
import { CATEGORY_TH } from '@/lib/categories'
import { money, pct, thb, thMonth } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PLANNING_CHIPS, unusedChips } from '@shared/categories'
import { debtOf, partOf, totals } from '@shared/planning'

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

// Where the income goes — fixed categorical slots (validated order: orange · blue · green), unallocated in neutral
type Part = 'expense' | 'saving' | 'invest' | 'left'
const PART: Record<Part, { label: string; color: string }> = {
  expense: { label: 'รายจ่าย', color: 'var(--chart-2)' },
  saving: { label: 'เงินออม', color: 'var(--chart-1)' },
  invest: { label: 'ลงทุน', color: 'var(--chart-3)' },
  left: { label: 'ยังไม่จัดสรร', color: 'var(--baseline)' },
}

const SECTIONS: { type: BudgetType; title: string; sub: string; icon: LucideIcon; tint: string | null }[] = [
  { type: 'Income', title: 'รายรับ', sub: 'Income', icon: Banknote, tint: null },
  { type: 'Saving', title: 'ออมและลงทุน', sub: 'Saving & Investment', icon: PiggyBank, tint: 'var(--chart-1)' },
  { type: 'Expense', title: 'รายจ่าย', sub: 'Expense', icon: Receipt, tint: 'var(--chart-2)' },
]

const defaultCategory = (t: BudgetType) => (t === 'Income' ? 'Salary' : t === 'Saving' ? 'Saving' : 'Daily Living')
```

- [ ] **Step 3: Replace the page component**

Replace the whole `export function BudgetPage() { … }` with:

```tsx
export function PlanningPage() {
  const [data, setData] = useState<Planning | null>(null)
  const [error, setError] = useState<unknown>()
  const [scenario, setScenario] = useState<ScenarioId>('main')
  const [blank, setBlank] = useState<ScenarioId[]>([]) // empty scenarios the user chose to fill by hand
  const seq = useRef(0)

  useEffect(() => {
    api.planning().then(setData, setError)
  }, [])

  async function mutate(call: Promise<Planning>, done?: string) {
    const n = ++seq.current
    try {
      const next = await call
      if (n === seq.current) setData(next)
      if (done) toast.success(done)
    } catch (e) {
      toast.error('บันทึกไม่ได้', { description: errMsg(e) })
      api.planning().then((d) => n === seq.current && setData(d), () => {})
    }
  }

  if (!data) return <PageState error={error} />
  const sc = data.scenarios.find((s) => s.id === scenario) ?? data.scenarios[0]

  const header = (
    <section className="flex items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">Planning · แผนการเงินรายเดือน</span>
        <h1 className="text-3xl font-semibold tracking-tight">แผนการใช้เงินต่อเดือน</h1>
        {sc.note && <p className="text-sm text-muted-foreground">{sc.note}</p>}
      </div>
      <div className="inline-flex rounded-2xl bg-muted p-1 text-sm" role="tablist" aria-label="ชุดงบ">
        {data.scenarios.map((s) => (
          <button key={s.id} type="button" role="tab" aria-selected={s.id === sc.id} onClick={() => setScenario(s.id)}
            className={cn('rounded-xl px-4 py-1.5 transition-colors', s.id === sc.id ? 'bg-card font-medium shadow-[var(--card-shadow)]' : 'text-muted-foreground hover:text-foreground')}>
            {s.name}
          </button>
        ))}
      </div>
    </section>
  )

  if (sc.id !== 'main' && !sc.lines.length && !blank.includes(sc.id)) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <EmptyScenario scenario={sc}
          onCopy={() => mutate(api.copyScenario(sc.id), sc.id === 'em' ? 'คัดลอกรายจ่ายจาก ปัจจุบัน แล้ว' : 'คัดลอกแผนจาก ปัจจุบัน แล้ว')}
          onBlank={() => setBlank((b) => [...b, sc.id])} />
      </div>
    )
  }

  const t = totals(sc.lines)
  const em = data.scenarios.find((s) => s.id === 'em')
  const emT = em ? totals(em.lines) : null
  const debt = debtOf(sc.lines)
  // the page leads with money put to work: investing first, then savings, biggest first
  const saved = t.saving + t.invest
  const savedRows = sc.lines.filter((l) => l.type === 'Saving' && l.thb > 0)
    .sort((a, b) => Number(partOf(a) !== 'invest') - Number(partOf(b) !== 'invest') || b.thb - a.thb)
    .map((l) => ({ label: l.item, value: l.thb, sub: l.account ?? undefined, color: PART[partOf(l)!].color }))
  const byCat = new Map<string, number>()
  for (const l of sc.lines.filter((x) => x.type === 'Expense')) byCat.set(l.category, (byCat.get(l.category) ?? 0) + l.thb)
  const expenseRows = [...byCat].map(([label, value]) => ({ label, value, sub: CATEGORY_TH[label], color: PART.expense.color })).filter((r) => r.value > 0).sort((a, b) => b.value - a.value)

  const patch = (l: BudgetLineRow, p: Partial<BudgetLineInput>) => {
    setData((d) => d && { ...d, scenarios: d.scenarios.map((s) => ({ ...s, lines: s.lines.map((x) => (x.id === l.id ? { ...x, ...p } : x)) })) })
    return mutate(api.updateLine(l.id, p))
  }
  const remove = (l: BudgetLineRow) => {
    mutate(api.deleteLine(l.id))
    toast(`ลบ ${l.item} แล้ว`, {
      action: { label: 'เลิกทำ', onClick: () => mutate(api.addLine(l.scenario, { type: l.type, category: l.category, item: l.item, thb: l.thb, expr: l.expr, account: l.account })) },
    })
  }

  return (
    <div className="flex flex-col gap-6">
      {header}

      <Card className="finance-hero">
        <CardContent className="grid gap-8 py-2 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">ออมและลงทุนต่อเดือน</span>
              <span className="text-6xl font-semibold tracking-tight">{thb(saved)}</span>
              <span className="text-sm text-muted-foreground">{t.income ? `${pct(saved / t.income)} ของรายรับ ${thb(t.income)}` : 'ยังไม่มีรายรับในงบนี้'}</span>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              {(['invest', 'saving'] as const).map((k) => (
                <div key={k} className="flex flex-col">
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <span className="size-2.5 rounded-[3px]" style={{ background: PART[k].color }} aria-hidden />{PART[k].label}
                  </span>
                  <span className="tabular text-xl font-semibold tracking-tight">{thb(t[k])}</span>
                </div>
              ))}
            </div>
            <LeftoverNote left={t.left} />
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <span className="text-sm font-medium">เงินออมไปที่ไหน</span>
            {savedRows.length
              ? <RankedBars rows={savedRows} format={thb} total={saved} />
              : <span className="text-sm text-muted-foreground">ยังไม่มีรายการออมหรือลงทุนในงบนี้</span>}
          </div>
        </CardContent>
      </Card>

      <section className="grid grid-cols-4 gap-4">
        <Card size="sm" className="col-span-2">
          <CardContent><Allocation t={t} /></CardContent>
        </Card>
        <Metric label="ภาระผ่อนต่อรายได้ · DSR" value={t.income ? pct(debt / t.income) : '—'}
          sub={`ผ่อนบ้าน + ผ่อนของ ${thb(debt)} · เส้น = 40% ที่ธนาคารมักให้`} share={t.income ? debt / t.income : 0} mark={0.4} markLabel="40%" />
        {data.ef && emT && emT.expense > 0 && (
          <Runway ef={data.ef} expense={emT.expense} income={emT.income} />
        )}
      </section>

      <div className="grid grid-cols-12 items-start gap-6">
        <div className="col-span-8 flex min-w-0 flex-col gap-6">
          {SECTIONS.map((s) => (
            <SectionCard key={s.type} section={s} lines={sc.lines.filter((l) => l.type === s.type)} income={t.income}
              onPatch={patch} onRemove={remove}
              onAdd={(line) => mutate(api.addLine(sc.id, line), `เพิ่ม ${line.item} แล้ว`)} />
          ))}
        </div>
        <aside className="sticky top-20 col-span-4 flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>รายจ่ายตามหมวด</CardTitle>
              <CardDescription>{thb(t.expense)} / เดือน · ตัวเลขข้างแท่ง = % ของรายจ่าย</CardDescription>
            </CardHeader>
            <CardContent>
              {expenseRows.length ? <RankedBars rows={expenseRows} format={thb} total={t.expense} /> : <p className="text-sm text-muted-foreground">ยังไม่มีรายจ่าย</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>เทียบทุกชุดงบ</CardTitle>
              <CardDescription>บาทต่อเดือน</CardDescription>
            </CardHeader>
            <CardContent>
              <ScenarioTable scenarios={data.scenarios} active={sc.id} />
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Update the helpers that name the old types**

In `Runway`, change the signature to `function Runway({ ef, expense, income }: { ef: NonNullable<Planning['ef']>; expense: number; income: number })` and replace its last `<span className="text-xs text-muted-foreground">…</span>` with:

```tsx
        <span className="text-xs text-muted-foreground">
          EF {thb(ef.thb)} ({thMonth(ef.month)}{ef.status === 'draft' ? ' ร่าง' : ''}) ÷ รายจ่ายชุดตกงาน {thb(expense)}
          {withRent ? ` · หักรายรับที่ยังได้ อยู่ได้ ${withRent.toFixed(1)} เดือน` : ''}
        </span>
```

Change the comment above `Runway` to `/** Emergency fund in months of the job-loss plan — the 6-month rule behind the target */`.

In `ScenarioTable`, change `scenarios: Budget['scenarios']` to `scenarios: Planning['scenarios']`.

- [ ] **Step 5: Replace `SectionCard` and `AddLineForm`, add `EmptyScenario`**

Replace the whole `SectionCard` function with:

```tsx
function SectionCard({ section, lines, income, onPatch, onRemove, onAdd }: {
  section: (typeof SECTIONS)[number]
  lines: BudgetLineRow[]
  income: number
  onPatch: (l: BudgetLineRow, p: Partial<BudgetLineInput>) => void
  onRemove: (l: BudgetLineRow) => void
  onAdd: (line: BudgetLineInput) => void
}) {
  const [preset, setPreset] = useState<{ category: string; item: string } | null>(null)
  const total = lines.reduce((s, l) => s + l.thb, 0)
  const cats: string[] = []
  for (const l of lines) if (!cats.includes(l.category)) cats.push(l.category)
  const chips = unusedChips(PLANNING_CHIPS[section.type], lines.map((l) => l.item))
  const { icon: Icon } = section
  return (
    <Card className="gap-0 py-0">
      <div className="flex items-center gap-3 border-b border-border/70 px-4 py-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-muted"
          style={section.tint ? { background: `color-mix(in oklch, ${section.tint} 16%, var(--card))` } : undefined} aria-hidden>
          <Icon className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-lg font-semibold tracking-tight">{section.title}</span>
          <span className="text-xs text-muted-foreground">{section.sub} · {lines.length} รายการ</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="tabular text-lg font-semibold">{money(total)}</span>
          {section.type !== 'Income' && income > 0 && <span className="text-xs text-muted-foreground">{pct(total / income)} ของรายรับ</span>}
        </div>
      </div>
      <div className="flex flex-col py-2">
        {cats.map((c) => {
          const cl = lines.filter((l) => l.category === c)
          const sum = cl.reduce((s, l) => s + l.thb, 0)
          return (
            <div key={c} className="flex flex-col px-2 pb-2">
              <div className="flex items-center gap-2 px-2 pt-2 pb-1 text-xs text-muted-foreground">
                <CategoryIcon category={c} className="size-3.5" />
                <span className="font-medium text-foreground">{c}</span>
                {CATEGORY_TH[c] && <span>{CATEGORY_TH[c]}</span>}
                <span className="tabular ml-auto">{money(sum)}</span>
              </div>
              <ul className="flex flex-col">
                {cl.map((l) => <LineRow key={l.id} line={l} income={income} categories={cats} onPatch={onPatch} onRemove={onRemove} />)}
              </ul>
            </div>
          )
        })}
        {!lines.length && <p className="px-4 py-3 text-sm text-muted-foreground">ยังไม่มีรายการ — เลือกจากรายการยอดนิยมด้านล่าง หรือเพิ่มเอง</p>}
      </div>
      <div className="border-t border-border/70 px-3 py-2">
        {preset
          ? <AddLineForm type={section.type} categories={cats} initial={preset} onCancel={() => setPreset(null)} onAdd={(l) => { onAdd(l); setPreset(null) }} />
          : <Chips chips={chips.map((c) => c.label)} onPick={(label) => {
              const chip = chips.find((c) => c.label === label)
              setPreset({ category: chip?.category ?? cats[0] ?? defaultCategory(section.type), item: label })
            }} />}
      </div>
    </Card>
  )
}
```

Replace the whole `AddLineForm` function with:

```tsx
function AddLineForm({ type, categories, initial, onAdd, onCancel }: {
  type: BudgetType
  categories: string[]
  initial: { category: string; item: string }
  onAdd: (l: BudgetLineInput) => void
  onCancel: () => void
}) {
  const [v, setV] = useState({ category: initial.category, item: initial.item, account: '', thb: 0, expr: null as string | null })
  const ok = v.item.trim() && v.category.trim()
  const known = [...new Set([...categories, ...PLANNING_CHIPS[type].map((c) => c.category)])]
  return (
    <form className="flex flex-wrap items-end gap-3 p-1"
      onSubmit={(e) => { e.preventDefault(); if (ok) onAdd({ type, category: v.category.trim(), item: v.item.trim(), account: v.account.trim() || null, thb: v.thb, expr: v.expr }) }}>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        หมวด
        <Input list={`new-cats-${type}`} value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })} className="w-40" />
        <datalist id={`new-cats-${type}`}>{known.map((c) => <option key={c} value={c}>{CATEGORY_TH[c]}</option>)}</datalist>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        รายการ
        <Input autoFocus={!initial.item} value={v.item} onChange={(e) => setV({ ...v, item: e.target.value })} placeholder="เช่น Spotify" className="w-44" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        บัญชี (ไม่บังคับ)
        <Input value={v.account} onChange={(e) => setV({ ...v, account: e.target.value })} placeholder="เช่น SCB/ออมทรัพย์" className="w-40" />
      </label>
      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        บาท / เดือน
        <MoneyInput value={v.thb} expr={v.expr} min={0} label="ยอดต่อเดือน" className="w-36 rounded-lg border border-input" onCommit={(thb, expr) => setV((x) => ({ ...x, thb, expr }))} />
      </div>
      <div className="ml-auto flex gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>ยกเลิก</Button>
        <Button type="submit" size="sm" disabled={!ok}>เพิ่ม</Button>
      </div>
    </form>
  )
}

/** ตกงาน / Projection with no lines yet: start from ปัจจุบัน instead of retyping (mockup 4-planning.html) */
function EmptyScenario({ scenario, onCopy, onBlank }: { scenario: Scenario; onCopy: () => void; onBlank: () => void }) {
  const em = scenario.id === 'em'
  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{em ? 'ถ้าไม่มีรายได้ ต้องจ่ายเดือนละเท่าไหร่?' : 'แผนอนาคตยังว่าง'}</CardTitle>
        <CardDescription>
          {em ? 'ใช้คำนวณเป้าเงินสำรองฉุกเฉิน (6 เดือน × รายจ่ายชุดนี้) และดูว่าเงินสำรองที่มีอยู่ได้กี่เดือน' : 'เอาไว้วางแผน เช่น หลังขึ้นเงินเดือน แต่งงาน ย้ายบ้าน'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3">
        <div className="flex gap-2">
          <Button onClick={onCopy}><Copy /> {em ? 'คัดลอกรายจ่ายจาก ปัจจุบัน' : 'คัดลอกทั้งหมดจาก ปัจจุบัน'}</Button>
          <Button variant="outline" onClick={onBlank}>เริ่มจากว่าง</Button>
        </div>
        {em && <p className="text-center text-xs text-muted-foreground">คัดลอกเฉพาะรายจ่าย แล้วลบหรือลดรายการที่ไม่จำเป็นตอนตกงาน · รายรับที่ยังได้อยู่ เช่น ค่าเช่า เพิ่มเองได้</p>}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 6: Typecheck and build**

Run: `pnpm typecheck && pnpm build`
Expected: no errors. If `noUnusedLocals` flags an import, remove that import only.

- [ ] **Step 7: Check it in the browser**

With `DEV_USER_EMAIL` in `.dev.vars`, run `pnpm dev`, open http://localhost:5173/planning and check:
1. ปัจจุบัน shows three sections; each has chips; clicking `+ เงินเดือน` opens the form with category `Salary` and item `เงินเดือน`; entering `50000` and เพิ่ม adds the line and removes that chip.
2. Add an expense `+ ผ่อนบ้าน` 15000 → DSR shows 30.0%.
3. Tab ตกงาน shows the empty card; "คัดลอกรายจ่ายจาก ปัจจุบัน" copies only the expense; the Runway card appears on ปัจจุบัน only after a balance month exists (Task 9).
4. Tab Projection → "คัดลอกทั้งหมดจาก ปัจจุบัน" copies every line; "เริ่มจากว่าง" on an empty scenario shows the normal sections.
5. **Review Focus 1:** stop `pnpm dev`, remove `DEV_USER_EMAIL` from `.dev.vars`, start `pnpm dev` again **without reloading the tab**, then edit an amount on the page → the tab switches to the login card (no repeated error toasts). Put `DEV_USER_EMAIL` back.

- [ ] **Step 8: Commit**

```bash
git config user.email   # c.soonue@gmail.com
git add src/pages/planning.tsx
git commit -m "Planning page: Budget page ported per user, quick-add chips, copy into empty ตกงาน (expenses) / Projection (all)"
```

---

### Task 9: Balance page

**Files:**
- Replace: `src/pages/balance.tsx` (starts as a copy of `../portfolio/src/pages/balance.tsx`)

**Interfaces:**
- Consumes: `api.balance / startMonth / closeMonth / discardDraft / setEntry / removeEntry / restoreEntry / confirmRows / setTransfer / addBalanceItem / classifyItem`; `Balance`, `BalanceRow`, `BalanceSide`, `BalanceTransfers`, `MonthStatus`, `NewBalanceItem`, `Tier`, `TIERS` (`@/lib/api`); `BALANCE_CATEGORIES`, `unusedChips`, `TIER_INFO`, `INVEST_TYPES`, `COUNTRIES` (`@shared/categories`); `Chips`.
- Produces: `BalancePage` (route `/balance`).

- [ ] **Step 1: Copy the Balance page**

```bash
cp ../portfolio/src/pages/balance.tsx src/pages/balance.tsx
```

- [ ] **Step 2: Replace the imports and constants**

Replace lines 1–25 (everything up to and including `const COUNTRIES = …`) with:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Circle, CircleCheck, Ellipsis, EyeOff, Lock, Plus, Tags, Trash, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { CategoryIcon } from '@/components/category-icon'
import { DivergingList, NetWorthChart } from '@/components/charts'
import { Legend } from '@/components/chart-card'
import { Chips } from '@/components/chips'
import { PageState } from '@/components/layout'
import { MoneyInput } from '@/components/money-input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { api, TIERS, type Balance, type BalanceRow, type BalanceSide, type BalanceTransfers, type MonthStatus, type NewBalanceItem, type Tier } from '@/lib/api'
import { CATEGORY_TH } from '@/lib/categories'
import { money, pct, thb, thbCompact, thMonth } from '@/lib/format'
import { cn } from '@/lib/utils'
import { BALANCE_CATEGORIES, COUNTRIES, INVEST_TYPES, TIER_INFO, unusedChips } from '@shared/categories'

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))
const SIDE_TH: Record<BalanceSide, string> = { asset: 'สินทรัพย์', liability: 'หนี้สิน' }
```

- [ ] **Step 3: Edit `BalancePage`**

1. Replace

```tsx
  if (!month) {
    return <StartCard next={data.next} busy={!!busy} onStart={(m) => step('start', () => mutate(api.startMonth(m)).then((ok) => ok && go(m)))} />
  }
```

with

```tsx
  if (!month) {
    return <StartCard months={data.firstMonths} busy={!!busy} onStart={(m) => step('start', () => mutate(api.startMonth(m), `เริ่มงบดุล ${thMonth(m)} แล้ว`).then((ok) => ok && go(m)))} />
  }
```

2. Delete the line `  const suggested = data.rows.filter((r) => r.suggestion)`.

3. Replace the whole `<DraftBar … />` element with:

```tsx
        <DraftBar
          month={month}
          total={data.rows.length}
          unconfirmed={unconfirmed.length}
          transfers={data.transfers ? { done: data.transfers.banks.filter((b) => b.doneAt).length, total: data.transfers.banks.length } : null}
          busy={busy}
          onClose={() => step('close', () => mutate(api.closeMonth(month), `ปิดเดือน ${thMonth(month)} แล้ว — Overview ใช้ตัวเลขเดือนนี้`))}
          onDiscard={() => step('discard', () => mutate(api.discardDraft(month), `ลบร่าง ${thMonth(month)} แล้ว`).then((ok) => ok && go('')))}
        />
```

4. Replace `          {efTarget != null && <EmergencyMeter value={ef} target={efTarget} />}` with `          {efTarget != null ? <EmergencyMeter value={ef} target={efTarget} /> : <EfHint />}`.

5. Replace the whole `{(['asset', 'liability'] as const).map((side) => { … })}` block (inside the `xl:col-span-8` column) with:

```tsx
          {(['asset', 'liability'] as const).map((side) => {
            const gs = groups.filter((g) => g.side === side)
            const defs = BALANCE_CATEGORIES.filter((d) => d.side === side)
            // the usual categories in their fixed order, then any category the user made up
            const order = [...defs.map((d) => d.category), ...gs.map((g) => g.category).filter((c) => !defs.some((d) => d.category === c))]
            const total = side === 'asset' ? assets : liabilities
            const add = (item: NewBalanceItem) => mutate(api.addBalanceItem(month, item), `เพิ่ม ${item.item} แล้ว`)
            return (
              <section key={side} className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between px-1">
                  <h2 className="text-xl font-semibold tracking-tight">{SIDE_TH[side]}</h2>
                  <span className="tabular font-medium">{thb(total)}</span>
                </div>
                {order.map((cat) => {
                  const g = gs.find((x) => x.category === cat)
                  const chips = unusedChips(defs.find((d) => d.category === cat)?.chips ?? [], g?.rows.map((r) => r.item) ?? [])
                  return g
                    ? (
                      <CategoryCard key={cat} group={g} chips={chips} draft={draft} prevMonth={data.prevMonth} target={data.targets[cat] ?? null}
                        onSet={setEntry} onConfirm={confirm}
                        onRemove={(r) => mutate(api.removeEntry(month, r.id), `ซ่อน ${r.item} แล้ว`)}
                        onClassify={(r, c) => mutate(api.classifyItem(month, r.id, c), `จัดกลุ่ม ${r.item} แล้ว`)}
                        onAdd={add} />
                    )
                    : <EmptyCategory key={cat} side={side} category={cat} chips={chips} expanded={!data.hasClosed} rows={data.rows} onAdd={add} />
                })}
                <AddItem side={side} categories={order} rows={data.rows} onAdd={add} />
              </section>
            )
          })}
```

- [ ] **Step 4: Replace `StatusBadge`, `StartCard`, `DraftBar`; add `EfHint`**

```tsx
function StatusBadge({ status }: { status: MonthStatus }) {
  if (status === 'draft') return <Badge variant="outline" className="gap-1.5"><span className="size-1.5 rounded-full bg-warning" aria-hidden />ร่าง</Badge>
  return <Badge variant="outline" className="gap-1"><Lock className="text-good" />ปิดเดือนแล้ว</Badge>
}

/** A new user picks the month of their first balance sheet (this month or up to 11 before, Bangkok time) */
function StartCard({ months, busy, onStart }: { months: string[]; busy: boolean; onStart: (m: string) => void }) {
  const [month, setMonth] = useState(months[0] ?? '')
  return (
    <Card className="mx-auto mt-12 max-w-lg">
      <CardHeader>
        <CardTitle>ยังไม่มีงบดุล</CardTitle>
        <CardDescription>เลือกเดือนที่จะเริ่ม แล้วกรอกยอด ณ สิ้นเดือนนั้น</CardDescription>
      </CardHeader>
      <CardContent className="flex gap-2">
        <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="เดือนแรก"
          className="h-9 flex-1 rounded-lg border border-input bg-background px-2 text-sm text-foreground">
          {months.map((m) => <option key={m} value={m}>{thMonth(m, true)}</option>)}
        </select>
        <Button disabled={busy || !month} onClick={() => onStart(month)}><Plus /> เริ่มกรอกเดือนแรก</Button>
      </CardContent>
    </Card>
  )
}

/** Sticky checklist bar while a month is a draft: progress, close */
function DraftBar({ month, total, unconfirmed, transfers, busy, onClose, onDiscard }: {
  month: string
  total: number
  unconfirmed: number
  transfers: { done: number; total: number } | null
  busy: string | null
  onClose: () => void
  onDiscard: () => void
}) {
  const [asking, setAsking] = useState(false)
  const done = total - unconfirmed
  const untransferred = transfers ? transfers.total - transfers.done : 0
  const ready = unconfirmed === 0 && untransferred === 0
  const pending = [
    unconfirmed && `${unconfirmed} รายการที่ยังใช้ยอดเดือนก่อน`,
    untransferred && `ยังไม่ได้ติ๊กโอนเงิน ${untransferred} บัญชี`,
  ].filter(Boolean)
  return (
    <div className="sticky top-16 z-[5] rounded-2xl border bg-card/90 p-4 shadow-[var(--card-shadow)] backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
            <span className="font-medium">ร่าง {thMonth(month)} · เช็กยอด {done} / {total}{transfers ? ` · โอนเงิน ${transfers.done} / ${transfers.total}` : ''}</span>
            <span className="text-muted-foreground">Overview ยังใช้เดือนก่อนจนกว่าจะปิดเดือน</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={done} aria-valuemax={total} aria-label="ความคืบหน้าการปิดเดือน">
            <div className="h-full rounded-full bg-good transition-[width]" style={{ width: `${(done / Math.max(total, 1)) * 100}%` }} />
          </div>
          <span className="text-xs text-muted-foreground">Enter = บันทึกแล้วไปช่องถัดไป · พิมพ์สูตรได้ เช่น 120000+5000</span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => (ready ? onClose() : setAsking(true))} disabled={!!busy}>
            <Lock /> ปิดเดือน
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="ตัวเลือกร่าง" />}><Ellipsis /></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem variant="destructive" onClick={onDiscard}><Trash /> ลบร่างเดือนนี้</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {asking && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-muted/60 p-3 text-sm">
          <span>ยังมี {pending.join(' · ')} — ปิดเดือนเลยไหม?</span>
          <span className="flex shrink-0 gap-2">
            <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>กลับไปเช็ก</Button>
            <Button size="sm" onClick={() => { setAsking(false); onClose() }}>ปิดเดือนเลย</Button>
          </span>
        </div>
      )}
    </div>
  )
}

/** No emergency-fund target until the ตกงาน plan has expenses */
function EfHint() {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">เงินสำรองฉุกเฉิน · Emergency fund</span>
        <span className="text-sm">ตั้งชุด "ตกงาน" ใน <Link to="/planning" className="underline underline-offset-2">Planning</Link> แล้วจะเห็นเป้า (6 เดือน × รายจ่าย)</span>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 5: Replace `CategoryCard`; add `EmptyCategory`; drop suggestions from `RowItem`**

Replace the whole `CategoryCard` function with:

```tsx
function CategoryCard({ group, chips, draft, prevMonth, target, onSet, onConfirm, onRemove, onClassify, onAdd }: {
  group: Group
  chips: string[]
  draft: boolean
  prevMonth: string | null
  target: number | null
  onSet: (r: BalanceRow, v: number, expr: string | null) => void
  onConfirm: (ids: number[]) => void
  onRemove: (r: BalanceRow) => void
  onClassify: (r: BalanceRow, c: Pick<NewBalanceItem, 'tier' | 'type' | 'country'>) => void
  onAdd: (item: NewBalanceItem) => void
}) {
  const [preset, setPreset] = useState<string | null>(null)
  const total = group.rows.reduce((s, r) => s + r.thb, 0)
  const prev = group.rows.reduce((s, r) => s + (r.prev ?? 0), 0)
  const open = group.rows.filter((r) => !r.confirmed)
  const invested = group.rows.some((r) => r.tier)
  const change = (group.side === 'asset' ? 1 : -1) * (total - prev)
  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-wrap items-center gap-3 border-b border-border/70 px-4 py-3.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-muted text-foreground" aria-hidden><CategoryIcon category={group.category} className="size-5" /></span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium">{CATEGORY_TH[group.category] ?? group.category}</span>
          <span className="text-xs text-muted-foreground">{group.category} · {group.rows.length} รายการ</span>
        </div>
        {draft && open.length > 1 && (
          <Button variant="ghost" size="xs" onClick={() => onConfirm(open.map((r) => r.id))} title="ยอดทุกบัญชีในหมวดนี้ไม่เปลี่ยน">
            <CircleCheck /> ยืนยันทั้งหมวด ({open.length})
          </Button>
        )}
        <div className="flex flex-col items-end">
          <span className="tabular font-semibold">{money(total)}</span>
          {prevMonth && <span className="text-xs"><Change value={change} compact /></span>}
        </div>
        {target != null && <TargetBar value={total} target={target} />}
      </div>
      <ul className="flex flex-col py-1">
        {group.rows.map((r) => (
          <RowItem key={r.id} row={r} draft={draft} prevMonth={prevMonth} siblingsInvested={invested}
            onSet={onSet} onConfirm={onConfirm} onRemove={onRemove} onClassify={onClassify} />
        ))}
      </ul>
      <div className="border-t px-2 py-1.5">
        {preset != null
          ? <AddItemForm side={group.side} category={group.category} initialItem={preset} rows={group.rows} onCancel={() => setPreset(null)} onAdd={(i) => { onAdd(i); setPreset(null) }} />
          : <Chips chips={chips} onPick={setPreset} className="px-2 py-1" />}
      </div>
    </Card>
  )
}

/** A usual category with nothing in it yet: open with chips until the first month is closed, a one-line button after that */
function EmptyCategory({ side, category, chips, expanded, rows, onAdd }: {
  side: BalanceSide
  category: string
  chips: string[]
  expanded: boolean
  rows: BalanceRow[]
  onAdd: (item: NewBalanceItem) => void
}) {
  const [open, setOpen] = useState(expanded)
  const [preset, setPreset] = useState<string | null>(null)
  if (!open) {
    return (
      <Button variant="ghost" size="sm" className="self-start text-muted-foreground" onClick={() => setOpen(true)}>
        <Plus /> เพิ่มใน {CATEGORY_TH[category] ?? category}
      </Button>
    )
  }
  return (
    <Card className="gap-0 py-0">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-muted text-muted-foreground" aria-hidden><CategoryIcon category={category} className="size-5" /></span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium">{CATEGORY_TH[category] ?? category}</span>
          <span className="text-xs text-muted-foreground">{category} · ยังไม่มีรายการ</span>
        </div>
        <span className="tabular text-muted-foreground">–</span>
      </div>
      <div className="border-t px-2 py-1.5">
        {preset != null
          ? <AddItemForm side={side} category={category} initialItem={preset} rows={rows} onCancel={() => setPreset(null)} onAdd={(i) => { onAdd(i); setPreset(null) }} />
          : <Chips chips={chips} onPick={setPreset} className="px-2 py-1" />}
      </div>
    </Card>
  )
}
```

In `RowItem`, delete the line `  const s = r.suggestion` and the whole `{s && ( … )}` block (the suggestion strip with `Sparkles`).

- [ ] **Step 6: Replace `TierFields`, `ClassifyForm` and `AddItemForm`**

Replace the whole `TierFields` function with `InvestFields`:

```tsx
/** "Counts in the portfolio" switch, then tier (with a one-line meaning), type and country — all optional */
function InvestFields({ tier, type, country, onChange }: {
  tier: Tier | null
  type: string
  country: string
  onChange: (p: { tier?: Tier | null; type?: string; country?: string }) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={tier != null} onChange={(e) => onChange({ tier: e.target.checked ? 'Core' : null })} />
        นับเป็นพอร์ตลงทุน
      </label>
      {tier && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            กลุ่ม
            <div className="inline-flex overflow-hidden rounded-lg border" role="radiogroup" aria-label="กลุ่มพอร์ต">
              {TIERS.map((t) => (
                <button key={t} type="button" role="radio" aria-checked={t === tier} onClick={() => onChange({ tier: t })}
                  className={cn('border-r px-2.5 py-1 text-xs last:border-r-0', t === tier ? 'bg-primary font-medium text-primary-foreground' : 'text-foreground hover:bg-muted')}>
                  {t}
                </button>
              ))}
            </div>
            <span>{tier} = {TIER_INFO[tier]}</span>
          </div>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            ประเภท
            <Input list="invest-types" value={type} onChange={(e) => onChange({ type: e.target.value })} className="w-32" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            ประเทศ
            <Input list="invest-countries" value={country} onChange={(e) => onChange({ country: e.target.value })} className="w-36" />
          </label>
          <datalist id="invest-types">{INVEST_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
          <datalist id="invest-countries">{COUNTRIES.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
      )}
    </div>
  )
}
```

In `ClassifyForm`, change `<TierFields … />` to `<InvestFields … />` (same props).

Replace the whole `AddItemForm` function with:

```tsx
function AddItemForm({ side, category: fixed, initialItem = '', rows, onAdd, onCancel }: {
  side: BalanceSide
  category?: string
  initialItem?: string
  rows: BalanceRow[]
  onAdd: (item: NewBalanceItem) => void
  onCancel: () => void
}) {
  const [category, setCategory] = useState(fixed ?? '')
  const [item, setItem] = useState(initialItem)
  const [amount, setAmount] = useState<{ thb: number; expr: string | null } | null>(null)
  const [cls, setCls] = useState(() => guess(rows, fixed ?? ''))
  const ok = item.trim() && category.trim()
  const submit = () => ok && onAdd({
    side,
    category: category.trim(),
    item: item.trim(),
    ...(side === 'asset' ? cls : { tier: null, type: null, country: null }),
    ...(amount ? { thb: amount.thb, expr: amount.expr } : {}),
  })
  return (
    <form className="flex flex-col gap-3 p-2" onSubmit={(e) => { e.preventDefault(); submit() }}>
      <div className="flex flex-wrap items-end gap-3">
        {!fixed && (
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            หมวด
            <Input autoFocus value={category} onChange={(e) => { setCategory(e.target.value); setCls(guess(rows, e.target.value)) }} placeholder="เช่น Others" className="w-44" />
          </label>
        )}
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          ชื่อบัญชี / กองทุน
          <Input autoFocus={!!fixed && !initialItem} value={item} onChange={(e) => setItem(e.target.value)} placeholder="เช่น บัญชีออมทรัพย์ SCB" className="w-56" />
        </label>
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          ยอด (THB)
          <MoneyInput value={amount?.thb ?? null} expr={amount?.expr} label="ยอด" className="w-40 rounded-lg border border-input" onCommit={(thb, expr) => setAmount({ thb, expr })} />
        </div>
      </div>
      {side === 'asset' && <InvestFields tier={cls.tier} type={cls.type} country={cls.country} onChange={(p) => setCls((x) => ({ ...x, ...p }))} />}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>ยกเลิก</Button>
        <Button type="submit" size="sm" disabled={!ok}>เพิ่ม</Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 7: Typecheck and build**

Run: `pnpm typecheck && pnpm build`
Expected: no errors. Leftover references to `suggestion`, `live`, `applySuggestions`, `refreshCrypto`, `thDateTime`, `Sparkles` or `RefreshCw` mean a step above was missed — fix by removing them, never by adding them to the API.

- [ ] **Step 8: Check it in the browser**

With `DEV_USER_EMAIL` pointing at a fresh email (e.g. `new-${date}@money-plan.local`), `pnpm dev`, open http://localhost:5173/balance:
1. The StartCard lists 12 months, newest first; start this month.
2. Every usual category shows with chips (mockup `2-balance.html`); `+ PVD` opens the form with the name filled; type `300000` → เพิ่ม → a confirmed row; tick "นับเป็นพอร์ตลงทุน", pick Core → the tier shows under the item.
3. Liabilities show สินเชื่อบ้าน / สินเชื่อรถ / บัตรเครดิต / หนี้อื่นๆ.
4. The EF card says to set ตกงาน in Planning; after adding a ตกงาน expense in Planning, it shows the meter with target 6 × that expense.
5. ปิดเดือน, then "เริ่มปิดบัญชี <next month>": rows copy over unconfirmed; empty categories collapse to "+ เพิ่มใน …" buttons; hiding a row lists it under "รายการที่ซ่อนอยู่" and เอากลับ restores last month's value.
6. With Planning lines that have an account (e.g. `SCB/ออม`), the draft shows "โอนเงินเดือนนี้" with the bank total; ticking works.

- [ ] **Step 9: Commit**

```bash
git config user.email   # c.soonue@gmail.com
git add src/pages/balance.tsx
git commit -m "Balance page: first-month picker, every usual category with quick-add chips, amount in the add form, optional tier, EF target from ตกงาน"
```

---

### Task 10: Overview page (checklist, layout B, Sankey)

**Files:**
- Create: `shared/sankey.ts`
- Replace: `src/pages/overview.tsx`
- Test: `test/shared-sankey.test.ts`

**Interfaces:**
- Consumes: `api.overview / planning / setTierTargets`; `Overview`, `Planning`, `ScenarioId`, `Tier`, `TierTargets`, `TIERS`, `TIER_COLOR`, `SERIES`, `OTHER_COLOR` (`@/lib/api`); `totals`, `efStatus`, `EfStatus`, `Totals`, `partOf` (`@shared/planning`); charts, `Sankey`, `ChartCard`, `Legend`, `ToggleLegend`.
- Produces:
  - `shared/sankey.ts`: `FLOW_COLOR = { income, expense, saving, invest, left }`, `interface MoneyFlow { nodes: SankeyNode[]; links: SankeyLink[]; income: number; left: number }`, `moneyFlow(lines, categoryLabel?): MoneyFlow | null`.
  - `OverviewPage` (route `/`).

- [ ] **Step 1: Write the failing Sankey test**

`test/shared-sankey.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { moneyFlow } from '../shared/sankey'
import type { BudgetType } from '../shared/types'

const L = (id: number, type: BudgetType, category: string, item: string, thb: number) => ({ id, type, category, item, thb })

describe('moneyFlow', () => {
  it('is null without income', () => {
    expect(moneyFlow([L(1, 'Expense', 'Housing', 'ค่าเช่า', 100)])).toBeNull()
  })

  it('runs income → total → expense / saving / investing / unallocated → categories and items', () => {
    const f = moneyFlow([
      L(1, 'Income', 'Salary', 'เงินเดือน', 60000), L(2, 'Income', 'Others', 'รายได้เสริม', 5000),
      L(3, 'Expense', 'Mortgage', 'ผ่อนคอนโด', 18000), L(4, 'Expense', 'Daily Living', 'อาหาร', 9000), L(5, 'Expense', 'Daily Living', 'เดินทาง', 3000),
      L(6, 'Saving', 'Saving', 'เงินออม', 8000), L(7, 'Saving', 'Investment', 'RMF', 10000), L(8, 'Expense', 'Travel', 'ทริป', 0),
    ], (c) => `TH:${c}`)!
    expect(f.income).toBe(65000)
    expect(f.left).toBe(17000)
    expect(f.nodes.filter((n) => n.column === 0).map((n) => n.label)).toEqual(['เงินเดือน', 'รายได้เสริม'])
    expect(f.nodes.filter((n) => n.column === 2).map((n) => [n.id, n.label])).toEqual([['g:expense', 'รายจ่าย'], ['g:saving', 'ออม'], ['g:invest', 'ลงทุน'], ['left', 'ยังไม่จัดสรร']])
    expect(f.nodes.filter((n) => n.column === 3).map((n) => n.label)).toEqual(['TH:Mortgage', 'TH:Daily Living', 'เงินออม', 'RMF'])
    const into = (id: string) => f.links.filter((l) => l.target === id).reduce((s, l) => s + l.value, 0)
    expect(into('income')).toBe(65000)
    expect(into('g:expense')).toBe(30000)
    expect(into('c:Daily Living')).toBe(12000)
    expect(into('left')).toBe(17000)
    expect(f.nodes.find((n) => n.id === 'c:Daily Living')!.note).toBe('อาหาร 9,000 · เดินทาง 3,000')
    expect(f.nodes.find((n) => n.id === 'g:expense')!.note).toBe('46% ของรายรับ')
    expect(f.links.every((l) => l.value > 0)).toBe(true)
  })

  it('has no unallocated node or negative band when over-allocated', () => {
    const f = moneyFlow([L(1, 'Income', 'Salary', 'เงินเดือน', 10000), L(2, 'Expense', 'Housing', 'ค่าเช่า', 12000)])!
    expect(f.left).toBe(-2000)
    expect(f.nodes.some((n) => n.id === 'left')).toBe(false)
    expect(f.links.every((l) => l.value > 0)).toBe(true)
  })
})
```

Run: `pnpm test test/shared-sankey.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 2: Write `shared/sankey.ts`**

```ts
import { partOf, totals, type Part } from './planning'
import type { BudgetLineRow, SankeyLink, SankeyNode } from './types'

// Money coming in stays neutral; the three uses keep the Planning page colours; unallocated is baseline grey
export const FLOW_COLOR = {
  income: 'var(--muted-foreground)',
  expense: 'var(--chart-2)',
  saving: 'var(--chart-1)',
  invest: 'var(--chart-3)',
  left: 'var(--baseline)',
} as const

const GROUPS: { id: Part; label: string }[] = [
  { id: 'expense', label: 'รายจ่าย' },
  { id: 'saving', label: 'ออม' },
  { id: 'invest', label: 'ลงทุน' },
]

type Line = Pick<BudgetLineRow, 'id' | 'type' | 'category' | 'item' | 'thb'>
export interface MoneyFlow { nodes: SankeyNode[]; links: SankeyLink[]; income: number; left: number }

const sumOf = (ls: Line[]) => ls.reduce((s, l) => s + l.thb, 0)
const whole = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 0 })

/**
 * "Where the salary goes" for one scenario: each income line → total income → expense / saving / investing / unallocated
 * → expenses by category (note lists the lines), saving and investing by line. Null when the scenario has no income.
 */
export function moneyFlow(lines: Line[], categoryLabel: (c: string) => string = (c) => c): MoneyFlow | null {
  const live = lines.filter((l) => l.thb > 0)
  const t = totals(live)
  if (t.income <= 0) return null
  const share = (v: number) => `${Math.round((v / t.income) * 100)}% ของรายรับ`
  const nodes: SankeyNode[] = []
  const links: SankeyLink[] = []

  for (const l of live.filter((x) => x.type === 'Income')) {
    nodes.push({ id: `i:${l.id}`, label: l.item, column: 0, color: FLOW_COLOR.income })
    links.push({ source: `i:${l.id}`, target: 'income', value: l.thb })
  }
  nodes.push({ id: 'income', label: 'รายรับ', column: 1, color: FLOW_COLOR.income })

  for (const g of GROUPS) {
    const gl = live.filter((l) => partOf(l) === g.id)
    const total = sumOf(gl)
    if (!total) continue
    nodes.push({ id: `g:${g.id}`, label: g.label, column: 2, color: FLOW_COLOR[g.id], note: share(total) })
    links.push({ source: 'income', target: `g:${g.id}`, value: total })
    if (g.id === 'expense') {
      const cats = new Map<string, Line[]>()
      for (const l of gl) cats.set(l.category, [...(cats.get(l.category) ?? []), l])
      for (const [c, cl] of [...cats].sort((a, b) => sumOf(b[1]) - sumOf(a[1]))) {
        nodes.push({ id: `c:${c}`, label: categoryLabel(c), column: 3, color: FLOW_COLOR.expense, note: cl.map((l) => `${l.item} ${whole(l.thb)}`).join(' · ') })
        links.push({ source: 'g:expense', target: `c:${c}`, value: sumOf(cl) })
      }
    } else {
      for (const l of [...gl].sort((a, b) => b.thb - a.thb)) {
        nodes.push({ id: `l:${l.id}`, label: l.item, column: 3, color: FLOW_COLOR[g.id] })
        links.push({ source: `g:${g.id}`, target: `l:${l.id}`, value: l.thb })
      }
    }
  }
  // over-allocated plans get a warning on the page instead of a negative band
  if (t.left >= 0.5) {
    nodes.push({ id: 'left', label: 'ยังไม่จัดสรร', column: 2, color: FLOW_COLOR.left, note: share(t.left) })
    links.push({ source: 'income', target: 'left', value: t.left })
  }
  return { nodes, links, income: t.income, left: t.left }
}
```

Run: `pnpm test test/shared-sankey.test.ts` — Expected: PASS.

- [ ] **Step 3: Write `src/pages/overview.tsx`** (mockups `1-onboarding.html` A and `3-overview.html`)

```tsx
import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowDownRight, ArrowUpRight, CircleAlert, CircleCheck, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { AllocationBullets, DivergingList, MultiLines, NetWorthChart, RankedBars, StackedColumns } from '@/components/charts'
import { ChartCard, Legend, ToggleLegend } from '@/components/chart-card'
import { PageState } from '@/components/layout'
import { Sankey } from '@/components/sankey'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api, OTHER_COLOR, SERIES, TIER_COLOR, TIERS, type Overview, type Planning, type ScenarioId, type Tier, type TierTargets } from '@/lib/api'
import { CATEGORY_TH } from '@/lib/categories'
import { pct, signed, thb, thbCompact, thMonth } from '@/lib/format'
import { cn } from '@/lib/utils'
import { efStatus, totals, type EfStatus, type Totals } from '@shared/planning'
import { FLOW_COLOR, moneyFlow } from '@shared/sankey'

const th = (c: string) => CATEGORY_TH[c] ?? c

export function OverviewPage() {
  const [o, setO] = useState<Overview | null>(null)
  const [p, setP] = useState<Planning | null>(null)
  const [error, setError] = useState<unknown>()
  useEffect(() => {
    Promise.all([api.overview(), api.planning()]).then(([a, b]) => { setO(a); setP(b) }, setError)
  }, [])
  if (!o || !p) return <PageState error={error} />
  if (!o.month) return <Onboarding checklist={o.checklist} />

  const lines = (id: ScenarioId) => p.scenarios.find((s) => s.id === id)?.lines ?? []
  const mainT = totals(lines('main'))
  const ef = efStatus(o.ef, totals(lines('em')))
  const history = o.netHistory.length >= 2
  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-12 gap-4">
        <NetWorthHero o={o} className="col-span-7" />
        <div className="col-span-5 grid gap-3">
          <SavingTile t={mainT} />
          <EfTile ef={ef} />
          <DebtTile o={o} />
        </div>
      </section>

      <MoneyFlowCard planning={p} />

      {history && (
        <div className="grid grid-cols-12 gap-6">
          <ChartCard
            className="col-span-7"
            title="สินทรัพย์ vs หนี้ รายเดือน"
            description={`ปิดแล้ว ${o.netHistory.length} เดือน · ใหม่สุดอยู่ซ้าย`}
            legend={<Legend items={[{ label: 'สินทรัพย์', color: 'var(--chart-1)' }, { label: 'หนี้สิน', color: 'var(--chart-2)' }, { label: 'สุทธิ', color: 'var(--chart-3)', line: true, value: thb(o.netWorth) }]} />}
            chart={<NetWorthChart data={o.netHistory} />}
            table={<NetTable rows={o.netHistory} />}
          />
          <Card className="col-span-5">
            <CardHeader>
              <CardTitle>เดือนนี้เปลี่ยนเพราะอะไร</CardTitle>
              <CardDescription>ผลต่อความมั่งคั่งสุทธิ แยกหมวด เทียบ {thMonth(o.prev!.month)} · หนี้ลด = บวก</CardDescription>
            </CardHeader>
            <CardContent>
              {o.contributions.length
                ? <DivergingList rows={o.contributions.map((c) => ({ label: th(c.label), value: c.value }))} format={thbCompact} posLabel="เพิ่ม" negLabel="ลด" />
                : <p className="text-sm text-muted-foreground">ไม่มีหมวดไหนเปลี่ยน</p>}
            </CardContent>
          </Card>
        </div>
      )}

      {history && <AssetMixCard o={o} />}
      {o.investments.length > 0 && <PortfolioSection o={o} onChange={setO} />}
      <BalanceSheetCard o={o} />
    </div>
  )
}

// ---- first visit: three steps (mockup 1-onboarding.html, option A) ----

function Onboarding({ checklist }: { checklist: Overview['checklist'] }) {
  const steps = [
    { done: checklist.planning, title: 'วางแผนเงินรายเดือน', sub: 'รายรับ · ออม/ลงทุน · รายจ่าย', to: '/planning', cta: 'ไป Planning' },
    { done: checklist.balanceStarted, title: 'กรอกงบดุลเดือนแรก', sub: 'เงินในบัญชี กองทุน หนี้ ณ วันนี้', to: '/balance', cta: 'ไป Balance' },
    { done: checklist.closed, title: 'ปิดเดือน', sub: 'กราฟสรุปจะขึ้นในหน้านี้', to: '/balance', cta: 'ไปปิดเดือน' },
  ]
  const next = steps.findIndex((s) => !s.done)
  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-12 gap-4">
        <Card className="finance-hero col-span-8">
          <CardContent className="flex flex-col gap-4 py-2">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">ยินดีต้อนรับ</h1>
              <p className="text-sm text-muted-foreground">เริ่มใช้ 3 ขั้น แล้วหน้านี้จะสรุปการเงินของคุณให้</p>
            </div>
            <ol className="grid grid-cols-3 gap-3">
              {steps.map((s, i) => (
                <li key={s.title} className={cn('flex flex-col gap-1 rounded-xl border bg-card p-3', !s.done && i !== next && 'opacity-60')}>
                  <span className="flex items-center gap-2 font-medium">
                    {s.done
                      ? <CircleCheck className="size-5 text-good" aria-label="เสร็จแล้ว" />
                      : <span className="grid size-5 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{i + 1}</span>}
                    {s.title}
                  </span>
                  <span className="text-sm text-muted-foreground">{s.sub}</span>
                  {!s.done && <Link to={s.to} className={cn(buttonVariants({ size: 'sm', variant: i === next ? 'default' : 'outline' }), 'mt-1 self-start')}>{s.cta}</Link>}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
        <Card className="col-span-4">
          <CardHeader><CardTitle>หน้านี้จะมีอะไร</CardTitle></CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
              <li>Net worth และการเปลี่ยนแปลงรายเดือน</li>
              <li>เงินเดือนไปไหน (จาก Planning)</li>
              <li>สัดส่วนสินทรัพย์ หนี้ต่อสินทรัพย์ เงินสำรอง</li>
              <li>พอร์ตลงทุนเทียบเป้า (ถ้าใส่กลุ่มพอร์ต)</li>
            </ul>
          </CardContent>
        </Card>
      </section>
      <div className="grid grid-cols-2 gap-4">
        <GhostChart label="Net worth ตามเวลา" />
        <GhostChart label="สัดส่วนสินทรัพย์" />
      </div>
    </div>
  )
}

function GhostChart({ label }: { label: string }) {
  return (
    <div className="grid h-40 place-items-center rounded-xl border border-dashed text-sm text-muted-foreground [background:repeating-linear-gradient(90deg,var(--muted)_0_12px,transparent_12px_24px)]">
      {label} จะขึ้นหลังปิดเดือนแรก
    </div>
  )
}

// ---- top row ----

function NetWorthHero({ o, className }: { o: Overview; className?: string }) {
  const h = o.netHistory
  const change = o.prev ? o.netWorth - o.prev.netWorth : null
  const span = h.length >= 2 ? h[0].net - h[h.length - 1].net : null
  return (
    <Card className={cn('finance-hero', className)}>
      <CardContent className="flex h-full flex-col gap-3 py-2">
        <span className="text-sm text-muted-foreground">ความมั่งคั่งสุทธิ · Net worth · {thMonth(o.month!, true)}</span>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="tabular text-5xl font-semibold tracking-tight">{thb(o.netWorth)}</span>
          {change != null && <Change value={change} base={o.prev!.netWorth} label={`จาก ${thMonth(o.prev!.month)}`} />}
        </div>
        {h.length >= 2 && <Sparkline values={[...h].reverse().map((r) => r.net)} />}
        {span != null && (
          <span className="text-sm text-muted-foreground">
            {h.length - 1} เดือนที่ผ่านมา {signed(span, thb)} · เฉลี่ย {signed(span / (h.length - 1), thb)} / เดือน
          </span>
        )}
      </CardContent>
    </Card>
  )
}

function Change({ value, base, label }: { value: number; base: number; label: string }) {
  if (Math.abs(value) < 0.5) return <span className="text-sm text-muted-foreground">ไม่เปลี่ยน {label}</span>
  const up = value > 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className={cn('tabular inline-flex items-center gap-1 text-sm font-medium', up ? 'text-good' : 'text-critical')}>
      <Icon className="size-4" aria-hidden />
      {signed(value, thb)}{base ? ` (${signed(value / Math.abs(base), (n) => pct(n))})` : ''}
      <span className="font-normal text-muted-foreground">{label}</span>
    </span>
  )
}

/** Net worth over the closed months, oldest → newest, no axes */
function Sparkline({ values }: { values: number[] }) {
  const w = 300, h = 48
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 4 - ((v - min) / span) * (h - 8)).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-12 w-full" role="img" aria-label="แนวโน้ม net worth">
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill="var(--chart-1)" fillOpacity={0.12} />
      <polyline points={pts} fill="none" stroke="var(--foreground)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function Tile({ label, value, share, color, sub }: { label: string; value: ReactNode; share?: number; color?: string; sub: ReactNode }) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm text-muted-foreground">{label}</span>
          <span className="tabular">{value}</span>
        </div>
        {share != null && (
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full" style={{ width: `${Math.min(Math.max(share, 0), 1) * 100}%`, background: color }} />
          </div>
        )}
        <span className="text-xs text-muted-foreground">{sub}</span>
      </CardContent>
    </Card>
  )
}

function SavingTile({ t }: { t: Totals }) {
  if (t.income <= 0) {
    return <Tile label="ออม + ลงทุนต่อเดือน" value="—" sub={<>ใส่รายรับใน <Link to="/planning" className="underline underline-offset-2">Planning</Link> แล้วจะเห็นอัตราการออม</>} />
  }
  const saved = t.saving + t.invest
  return (
    <Tile label="ออม + ลงทุนต่อเดือน" value={<><b>{thb(saved)}</b> <span className="text-muted-foreground">/ {thb(t.income)}</span></>}
      share={saved / t.income} color="var(--chart-3)" sub={`${pct(saved / t.income)} ของรายได้ · จาก Planning (ปัจจุบัน)`} />
  )
}

function EfTile({ ef }: { ef: EfStatus }) {
  if (ef.target == null) {
    return <Tile label="เงินสำรองฉุกเฉิน" value={<b>{thb(ef.thb)}</b>} sub={<>ตั้งชุด "ตกงาน" ใน <Link to="/planning" className="underline underline-offset-2">Planning</Link> แล้วจะเห็นเป้า</>} />
  }
  return (
    <Tile label="เงินสำรองฉุกเฉิน" value={<><b>{ef.months!.toFixed(1)}</b> <span className="text-muted-foreground">/ 6 เดือน</span></>}
      share={ef.thb / ef.target} color="var(--chart-1)"
      sub={`${thb(ef.thb)} จากเป้า ${thb(ef.target)} (6 × รายจ่ายตอนตกงาน)${ef.netMonths != null && Math.abs(ef.netMonths - ef.months!) > 0.05 ? ` · หักรายรับที่ยังได้ อยู่ได้ ${ef.netMonths.toFixed(1)} เดือน` : ''}`} />
  )
}

function DebtTile({ o }: { o: Overview }) {
  const ratio = o.totalAssets ? o.totalLiabilities / o.totalAssets : 0
  return (
    <Tile label="หนี้ต่อสินทรัพย์" value={<b>{pct(ratio)}</b>} share={ratio} color="var(--chart-2)"
      sub={`หนี้ ${thb(o.totalLiabilities)} · สินทรัพย์ ${thb(o.totalAssets)}`} />
  )
}

// ---- where the salary goes (Sankey like the portfolio Flow page) ----

function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div className="inline-flex rounded-lg border p-0.5 text-xs" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} onClick={() => onChange(o.value)}
          className={cn('rounded-md px-2.5 py-1 transition-colors', o.value === value ? 'bg-primary font-medium text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function MoneyFlowCard({ planning }: { planning: Planning }) {
  const [id, setId] = useState<ScenarioId>('main')
  const sc = planning.scenarios.find((s) => s.id === id) ?? planning.scenarios[0]
  const flow = moneyFlow(sc.lines, th)
  const t = totals(sc.lines)
  const share = (v: number) => (t.income ? ` · ${pct(v / t.income, 0)}` : '')
  return (
    <Card>
      <CardHeader>
        <CardTitle>เงินเดือนไปไหน</CardTitle>
        <CardDescription>
          {flow ? `Planning · รายรับ ${thb(flow.income)} / เดือน → รายจ่าย / ออม / ลงทุน → แต่ละหมวด · ชี้ที่เส้นเพื่อดูยอดและรายการย่อย` : `ยังไม่มีรายรับในชุด ${sc.name}`}
        </CardDescription>
        <CardAction className="flex items-center gap-2">
          <Segmented value={sc.id} onChange={setId} label="ชุดงบ" options={planning.scenarios.map((s) => ({ value: s.id, label: s.name }))} />
          <Link to="/planning" className={buttonVariants({ variant: 'outline', size: 'sm' })}>แก้ใน Planning →</Link>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {flow
          ? (
            <>
              <Sankey nodes={flow.nodes} links={flow.links} format={thbCompact} height={360} label={`รายรับ ${thb(flow.income)} ต่อเดือน ชุด ${sc.name}`} />
              <Legend items={[
                { label: 'รายจ่าย', color: FLOW_COLOR.expense, value: `${thb(t.expense)}${share(t.expense)}` },
                { label: 'ออม', color: FLOW_COLOR.saving, value: `${thb(t.saving)}${share(t.saving)}` },
                { label: 'ลงทุน', color: FLOW_COLOR.invest, value: `${thb(t.invest)}${share(t.invest)}` },
                { label: 'ยังไม่จัดสรร', color: FLOW_COLOR.left, value: `${thb(Math.max(t.left, 0))}${share(Math.max(t.left, 0))}` },
              ]} />
              {t.left < -0.5 && (
                <p className="flex items-center gap-2 text-sm text-critical">
                  <CircleAlert className="size-4" aria-hidden />จัดสรรเกินรายรับ {thb(-t.left)} / เดือน — แก้ใน Planning
                </p>
              )}
            </>
          )
          : (
            <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
              ใส่รายรับในชุด "{sc.name}" แล้วภาพนี้จะขึ้น
              <Link to="/planning" className={buttonVariants({ size: 'sm' })}>ไป Planning</Link>
            </div>
          )}
      </CardContent>
    </Card>
  )
}

// ---- history ----

function NetTable({ rows }: { rows: Overview['netHistory'] }) {
  return (
    <Table>
      <TableHeader><TableRow><TableHead>เดือน</TableHead><TableHead className="text-right">สินทรัพย์</TableHead><TableHead className="text-right">หนี้สิน</TableHead><TableHead className="text-right">สุทธิ</TableHead></TableRow></TableHeader>
      <TableBody className="tabular">
        {rows.map((r) => (
          <TableRow key={r.month}>
            <TableCell>{r.label}</TableCell>
            <TableCell className="text-right">{thb(r.assets)}</TableCell>
            <TableCell className="text-right">{thb(r.liabilities)}</TableCell>
            <TableCell className="text-right font-medium">{thb(r.net)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

type CatRow = { label: string; live: boolean; month: string } & Record<string, any>
const FOLD = 'หมวดอื่น'

/** Asset categories over time, filterable; Lines mode compares each category's growth on its own */
function AssetMixCard({ o }: { o: Overview }) {
  // a fixed colour per category by today's size; the tail (and anything no longer held) folds into หมวดอื่น
  const cats = o.balance.assets.map((a) => th(a.category))
  const top = cats.length > 8 ? cats.slice(0, 7) : cats
  const rows: CatRow[] = o.categoryHistory.map((r) => {
    const row: CatRow = { label: r.label, live: false, month: r.month }
    for (const [k, v] of Object.entries(r.values)) {
      const key = top.includes(th(k)) ? th(k) : FOLD
      row[key] = (row[key] ?? 0) + v
    }
    return row
  })
  const series = [...top.map((c, i) => ({ key: c, color: SERIES[i] })), ...(rows.some((r) => FOLD in r) ? [{ key: FOLD, color: OTHER_COLOR }] : [])]
  const [active, setActive] = useState(() => series.map((c) => c.key))
  const [mode, setMode] = useState<'stacked' | 'lines'>('stacked')
  const shown = series.filter((c) => active.includes(c.key))
  const total = (r: CatRow) => shown.reduce((s, c) => s + (r[c.key] ?? 0), 0)
  return (
    <ChartCard
      title="สัดส่วนสินทรัพย์ตามเวลา"
      description={`${shown.length < series.length ? `${shown.length} จาก ${series.length} หมวด` : 'สินทรัพย์ทุกหมวด'} · ใหม่สุดอยู่ซ้าย · กดชื่อหมวดเพื่อซ่อน`}
      legend={
        <div className="flex items-start justify-between gap-2">
          <ToggleLegend items={series.map((c) => ({ label: c.key, color: c.color }))} active={active} onChange={setActive} />
          <Segmented value={mode} onChange={setMode} label="แบบกราฟ" options={[{ value: 'stacked', label: 'ซ้อน' }, { value: 'lines', label: 'เส้น' }]} />
        </div>
      }
      chart={mode === 'stacked' ? <StackedColumns data={rows} series={shown} /> : <MultiLines data={rows} series={shown} />}
      table={
        <Table>
          <TableHeader><TableRow><TableHead>เดือน</TableHead>{shown.map((c) => <TableHead key={c.key} className="text-right">{c.key}</TableHead>)}{shown.length > 1 && <TableHead className="text-right">รวม</TableHead>}</TableRow></TableHeader>
          <TableBody className="tabular">
            {rows.map((r) => (
              <TableRow key={r.month}>
                <TableCell>{r.label}</TableCell>
                {shown.map((c) => <TableCell key={c.key} className="text-right">{thbCompact(r[c.key] ?? 0)}</TableCell>)}
                {shown.length > 1 && <TableCell className="text-right font-medium">{thbCompact(total(r))}</TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      }
    />
  )
}

// ---- portfolio (only when items carry a tier) ----

function rank<T extends { thb: number }>(rows: T[], key: keyof T) {
  const m = new Map<string, number>()
  for (const r of rows) m.set(String(r[key]), (m.get(String(r[key])) ?? 0) + r.thb)
  return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
}

function RankCard({ title, description, rows, total, limit, className }: { title: string; description?: string; rows: { label: string; value: number; color?: string; sub?: string }[]; total: number; limit?: number; className?: string }) {
  return (
    <ChartCard
      className={className}
      title={title}
      description={description}
      chart={<RankedBars rows={rows} format={thbCompact} total={total} limit={limit} />}
      table={
        <Table>
          <TableBody className="tabular">
            {rows.map((r) => <TableRow key={r.label}><TableCell>{r.label}</TableCell><TableCell className="text-right">{thb(r.value)}</TableCell><TableCell className="text-right">{pct(r.value / total)}</TableCell></TableRow>)}
          </TableBody>
        </Table>
      }
    />
  )
}

function PortfolioSection({ o, onChange }: { o: Overview; onChange: (o: Overview) => void }) {
  const [editing, setEditing] = useState(false)
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline gap-3 px-1">
        <h2 className="text-xl font-semibold tracking-tight">พอร์ตลงทุน</h2>
        <span className="text-sm text-muted-foreground">{thb(o.investTotal)} · ใส่กลุ่มพอร์ตแล้ว {o.investments.length} รายการ</span>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => setEditing((x) => !x)}><Pencil /> แก้เป้า</Button>
      </div>
      {editing && <TargetsEditor tiers={o.tiers} onCancel={() => setEditing(false)} onSaved={(next) => { onChange(next); setEditing(false) }} />}
      <div className="grid grid-cols-12 gap-6">
        <ChartCard
          className="col-span-7"
          title="เทียบเป้า"
          description={`แท่ง = สัดส่วนตอนนี้ · ขีด = เป้า ${o.tiers.map((t) => pct(t.target, 0)).join(' / ')}`}
          chart={<AllocationBullets tiers={o.tiers} />}
          table={
            <Table>
              <TableHeader><TableRow><TableHead>กลุ่ม</TableHead><TableHead className="text-right">ยอด</TableHead><TableHead className="text-right">%</TableHead><TableHead className="text-right">เป้า</TableHead><TableHead className="text-right">ขาด / เกิน</TableHead></TableRow></TableHeader>
              <TableBody className="tabular">
                {o.tiers.map((t) => (
                  <TableRow key={t.tier}>
                    <TableCell>{t.tier}</TableCell>
                    <TableCell className="text-right">{thb(t.thb)}</TableCell>
                    <TableCell className="text-right">{pct(t.pct)}</TableCell>
                    <TableCell className="text-right">{pct(t.target, 0)}</TableCell>
                    <TableCell className="text-right">{signed(t.gap, thb)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          }
        />
        <div className="col-span-5 grid gap-6">
          <RankCard title="ตามประเภท" rows={rank(o.investments, 'type')} total={o.investTotal} />
          <RankCard title="ตามประเทศ" rows={rank(o.investments, 'country')} total={o.investTotal} />
        </div>
      </div>
      <RankCard title="รายการใหญ่สุด" total={o.investTotal} limit={10}
        rows={o.investments.map((r) => ({ label: r.symbol, value: r.thb, color: TIER_COLOR[r.tier], sub: `${r.tier} · ${r.type} · ${r.country}` }))} />
    </section>
  )
}

/** Inline editor for the four tier targets (percent), saved only when they add up to 100% */
function TargetsEditor({ tiers, onCancel, onSaved }: { tiers: Overview['tiers']; onCancel: () => void; onSaved: (o: Overview) => void }) {
  const [v, setV] = useState<Record<Tier, string>>(() => Object.fromEntries(tiers.map((t) => [t.tier, String(Math.round(t.target * 1000) / 10)])) as Record<Tier, string>)
  const [busy, setBusy] = useState(false)
  const nums = TIERS.map((t) => Number(v[t]))
  const sum = nums.reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0)
  const valid = nums.every((n) => Number.isFinite(n) && n >= 0 && n <= 100) && Math.abs(sum - 100) < 0.1
  const save = async () => {
    setBusy(true)
    try {
      onSaved(await api.setTierTargets(Object.fromEntries(TIERS.map((t) => [t, Number(v[t]) / 100])) as TierTargets))
      toast.success('บันทึกเป้าแล้ว')
    } catch (e) {
      toast.error('บันทึกไม่ได้', { description: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card size="sm">
      <CardContent className="flex flex-wrap items-end gap-3">
        {TIERS.map((t) => (
          <label key={t} className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t} (%)
            <Input inputMode="decimal" value={v[t]} onChange={(e) => setV({ ...v, [t]: e.target.value })} className="w-24 text-right" />
          </label>
        ))}
        <span className={cn('tabular pb-2 text-sm', valid ? 'text-muted-foreground' : 'text-critical')}>รวม {sum.toFixed(1)}%{valid ? '' : ' — ต้องได้ 100%'}</span>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>ยกเลิก</Button>
          <Button size="sm" disabled={!valid || busy} onClick={save}>บันทึก</Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ---- balance sheet ----

function BalanceTable({ title, groups, total, base }: { title: string; groups: Overview['balance']['assets']; total: number; base: number }) {
  const share = (v: number) => pct(base ? v / base : 0)
  return (
    <Table>
      <TableHeader>
        <TableRow><TableHead>{title}</TableHead><TableHead className="text-right">บาท</TableHead><TableHead className="w-20 text-right">% สินทรัพย์</TableHead></TableRow>
      </TableHeader>
      <TableBody className="tabular">
        {groups.map((g) => (
          <Fragment key={g.category}>
            <TableRow className="font-medium">
              <TableCell>{th(g.category)}</TableCell>
              <TableCell className="text-right">{thb(g.thb)}</TableCell>
              <TableCell className="text-right">{share(g.thb)}</TableCell>
            </TableRow>
            {g.items.length > 1 && g.items.map((i) => (
              <TableRow key={`${g.category}/${i.item}`} className="text-muted-foreground">
                <TableCell className="pl-6">{i.item}</TableCell>
                <TableCell className="text-right">{thb(i.thb)}</TableCell>
                <TableCell />
              </TableRow>
            ))}
          </Fragment>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow><TableCell>รวม{title}</TableCell><TableCell className="text-right">{thb(total)}</TableCell><TableCell className="text-right">{share(total)}</TableCell></TableRow>
      </TableFooter>
    </Table>
  )
}

function BalanceSheetCard({ o }: { o: Overview }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>งบดุล · Balance sheet</CardTitle>
        <CardDescription>{thMonth(o.month!, true)} (เดือนล่าสุดที่ปิดแล้ว)</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-8">
        <BalanceTable title="สินทรัพย์" groups={o.balance.assets} total={o.totalAssets} base={o.totalAssets} />
        <div className="flex flex-col gap-8">
          <BalanceTable title="หนี้สิน" groups={o.balance.liabilities} total={o.totalLiabilities} base={o.totalAssets} />
          <div className="flex items-baseline justify-between border-t pt-4">
            <span className="font-medium">ความมั่งคั่งสุทธิ</span>
            <span className="text-xl font-semibold">{thb(o.netWorth)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Typecheck, build, test**

Run: `pnpm typecheck && pnpm build && pnpm test`
Expected: all green. If `noUnusedLocals` flags an import, remove only that import.

- [ ] **Step 5: Check it in the browser**

`pnpm dev` and open http://localhost:5173:
1. With a fresh `DEV_USER_EMAIL`: the checklist shows; steps tick as you add a Planning line (1), start a Balance month (2); after closing the month (3) the page switches to the full layout.
2. With the demo user (Task 11 seed, or two closed months by hand): the hero shows the change and the sparkline; the three tiles; the Sankey with the scenario switch; "สินทรัพย์ vs หนี้", "เดือนนี้เปลี่ยนเพราะอะไร", the asset mix; the portfolio section appears only once an item has a tier; "แก้เป้า" refuses 90% and saves 100%.
3. **Review Focus 4:** in Planning ปัจจุบัน make expenses exceed income → Overview's Sankey has no "ยังไม่จัดสรร" node and shows the red "จัดสรรเกินรายรับ" line.

- [ ] **Step 6: Commit**

```bash
git config user.email   # c.soonue@gmail.com
git add shared/sankey.ts src/pages/overview.tsx test/shared-sankey.test.ts
git commit -m "Overview page: first-visit checklist, net worth hero + health tiles, Sankey of the plan per scenario, history charts, portfolio vs editable targets"
```

---

### Task 11: Demo data, README, ChinOS integration

**Files:**
- Create: `scripts/seed-demo.sql`, `README.md`
- Move: ChinOS `docs/superpowers/specs/2026-09-29-money-plan-design.md`, `docs/superpowers/specs/2026-09-29-money-plan-mockups/`, `docs/superpowers/plans/2026-09-29-money-plan.md` → `apps/money-plan/docs/superpowers/…`
- Modify (ChinOS): `.gitmodules`, `AGENT.md`

**Interfaces:**
- Consumes: the schema (Task 1).
- Produces: `pnpm db:seed:demo` user `demo@money-plan.local` with 6 closed months (2026-04 → 2026-09) and a plan; the repo on GitHub as ChinOS submodule `apps/money-plan`.

- [ ] **Step 1: Write the demo seed**

`scripts/seed-demo.sql`:

```sql
-- Demo user for local dev: set DEV_USER_EMAIL=demo@money-plan.local in .dev.vars, then `pnpm db:seed:demo`.
-- Six closed months (2026-04 → 2026-09) and a plan whose numbers match the mockups. Re-running replaces the user.
DELETE FROM users WHERE email = 'demo@money-plan.local';

INSERT INTO users (email, name, picture, created_at) VALUES ('demo@money-plan.local', 'Demo', NULL, '2026-04-01T00:00:00.000Z');

INSERT INTO budget_scenarios (user_id, id, name, note, sort)
SELECT u.id, s.id, s.name, s.note, s.sort FROM users u, (
  SELECT 'main' AS id, 'ปัจจุบัน' AS name, NULL AS note, 0 AS sort
  UNION ALL SELECT 'proj', 'Projection', 'แผนอนาคต เช่น หลังขึ้นเงินเดือน แต่งงาน ย้ายบ้าน', 1
  UNION ALL SELECT 'em', 'ตกงาน', 'รายจ่ายที่ยังต้องจ่ายถ้าไม่มีรายได้ · ใช้คำนวณเป้าเงินสำรองฉุกเฉิน', 2
) s WHERE u.email = 'demo@money-plan.local';

INSERT INTO tier_targets (user_id, tier, target)
SELECT u.id, t.tier, t.target FROM users u, (
  SELECT 'Foundation' AS tier, 0.10 AS target UNION ALL SELECT 'Core', 0.40 UNION ALL SELECT 'Growth', 0.35 UNION ALL SELECT 'High Risk', 0.15
) t WHERE u.email = 'demo@money-plan.local';

-- ปัจจุบัน: income 65,000 · expense 41,000 · saving 8,000 · investing 10,000 · unallocated 6,000; ตกงาน expenses 31,500
INSERT INTO budget_lines (user_id, scenario, type, category, item, thb, expr, account, sort)
SELECT u.id, l.scenario, l.type, l.category, l.item, l.thb, NULL, l.account, l.sort FROM users u, (
  SELECT 'main' AS scenario, 'Income' AS type, 'Salary' AS category, 'เงินเดือน' AS item, 60000 AS thb, NULL AS account, 1 AS sort
  UNION ALL SELECT 'main', 'Income', 'Others', 'รายได้เสริม', 5000, NULL, 2
  UNION ALL SELECT 'main', 'Saving', 'Saving', 'เงินสำรองฉุกเฉิน', 5000, 'KBank/ออมทรัพย์', 3
  UNION ALL SELECT 'main', 'Saving', 'Saving', 'เงินออม', 3000, 'KBank/ออมทรัพย์', 4
  UNION ALL SELECT 'main', 'Saving', 'Investment', 'PVD', 4000, NULL, 5
  UNION ALL SELECT 'main', 'Saving', 'Investment', 'RMF', 3000, 'SCB/กองทุน', 6
  UNION ALL SELECT 'main', 'Saving', 'Investment', 'กองทุนหุ้น', 3000, 'SCB/กองทุน', 7
  UNION ALL SELECT 'main', 'Expense', 'Mortgage', 'ผ่อนคอนโด', 18000, 'SCB/ผ่อนบ้าน', 8
  UNION ALL SELECT 'main', 'Expense', 'Daily Living', 'อาหาร', 9000, 'KBank', 9
  UNION ALL SELECT 'main', 'Expense', 'Daily Living', 'เดินทาง', 3000, 'KBank', 10
  UNION ALL SELECT 'main', 'Expense', 'Bills & Utilities', 'ค่าน้ำไฟ / โทรศัพท์', 3000, 'KBank', 11
  UNION ALL SELECT 'main', 'Expense', 'Insurance', 'ประกัน', 2500, 'KBank', 12
  UNION ALL SELECT 'main', 'Expense', 'Travel', 'ท่องเที่ยว', 5500, 'KBank', 13
  UNION ALL SELECT 'em', 'Expense', 'Mortgage', 'ผ่อนคอนโด', 18000, NULL, 1
  UNION ALL SELECT 'em', 'Expense', 'Daily Living', 'อาหาร', 8000, NULL, 2
  UNION ALL SELECT 'em', 'Expense', 'Bills & Utilities', 'ค่าน้ำไฟ / โทรศัพท์', 3000, NULL, 3
  UNION ALL SELECT 'em', 'Expense', 'Insurance', 'ประกัน', 2500, NULL, 4
) l WHERE u.email = 'demo@money-plan.local';

INSERT INTO balance_items (user_id, side, category, item, tier, type, country, active, sort)
SELECT u.id, i.side, i.category, i.item, i.tier, i.type, i.country, 1, i.sort FROM users u, (
  SELECT 'asset' AS side, 'Cash' AS category, 'บัญชีออมทรัพย์ KBank' AS item, NULL AS tier, NULL AS type, NULL AS country, 1 AS sort
  UNION ALL SELECT 'asset', 'Emergency Funds', 'บัญชีดอกเบี้ยสูง', NULL, NULL, NULL, 2
  UNION ALL SELECT 'asset', 'PVD', 'PVD', 'Foundation', 'Bonds', 'Thailand', 3
  UNION ALL SELECT 'asset', 'Insurance & Social Security', 'ประกันสังคม', NULL, NULL, NULL, 4
  UNION ALL SELECT 'asset', 'Equity', 'กองทุนหุ้นโลก', 'Core', 'Equity', 'Global', 5
  UNION ALL SELECT 'asset', 'Real Estate', 'คอนโด', NULL, NULL, NULL, 6
  UNION ALL SELECT 'liability', 'Mortgage', 'สินเชื่อคอนโด', NULL, NULL, NULL, 7
  UNION ALL SELECT 'liability', 'Credit Card', 'บัตรเครดิต', NULL, NULL, NULL, 8
) i WHERE u.email = 'demo@money-plan.local';

INSERT INTO balance_months (user_id, month, status, updated_at, closed_at)
SELECT u.id, m.month, 'closed', m.month || '-28T12:00:00.000Z', m.month || '-28T12:00:00.000Z' FROM users u, (
  SELECT '2026-04' AS month UNION ALL SELECT '2026-05' UNION ALL SELECT '2026-06'
  UNION ALL SELECT '2026-07' UNION ALL SELECT '2026-08' UNION ALL SELECT '2026-09'
) m WHERE u.email = 'demo@money-plan.local';

-- value = base + step × n, n = 0 for 2026-04 … 5 for 2026-09
INSERT INTO balance_entries (user_id, month, item_id, thb, expr, updated_at)
SELECT i.user_id, m.month, i.id, round(v.base + v.step * m.n, 2), NULL, m.month || '-28T12:00:00.000Z'
FROM balance_items i
JOIN users u ON u.id = i.user_id AND u.email = 'demo@money-plan.local'
JOIN (
  SELECT 'บัญชีออมทรัพย์ KBank' AS item, 110000 AS base, 2000 AS step
  UNION ALL SELECT 'บัญชีดอกเบี้ยสูง', 155000, 5000
  UNION ALL SELECT 'PVD', 274000, 7200
  UNION ALL SELECT 'ประกันสังคม', 58000, 400
  UNION ALL SELECT 'กองทุนหุ้นโลก', 218000, 4500
  UNION ALL SELECT 'คอนโด', 2100000, 0
  UNION ALL SELECT 'สินเชื่อคอนโด', 1677000, -5400
  UNION ALL SELECT 'บัตรเครดิต', 12000, 0
) v ON v.item = i.item
CROSS JOIN (
  SELECT '2026-04' AS month, 0 AS n UNION ALL SELECT '2026-05', 1 UNION ALL SELECT '2026-06', 2
  UNION ALL SELECT '2026-07', 3 UNION ALL SELECT '2026-08', 4 UNION ALL SELECT '2026-09', 5
) m;
```

Run: `pnpm db:migrate:local && pnpm db:seed:demo`, set `DEV_USER_EMAIL=demo@money-plan.local`, `pnpm dev`.
Expected on Overview: net worth ฿1,348,500 for กันยายน 2026, up ฿24,500 from ส.ค. (assets +19,100, mortgage −5,400); "5 เดือนที่ผ่านมา +฿122,500 · เฉลี่ย +฿24,500 / เดือน"; saving tile ฿18,000 / ฿65,000; EF 5.7 / 6 เดือน (฿180,000 of ฿189,000); debt 55.2%; Sankey with ฿6,000 unallocated; portfolio section with PVD (Foundation) and กองทุนหุ้นโลก (Core).

- [ ] **Step 2: Write `README.md`**

````markdown
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
````

- [ ] **Step 3: Move the design docs into the repo and commit**

```bash
cd /Users/chin_mini/Desktop/ChinOS/apps/money-plan
mkdir -p docs/superpowers/specs docs/superpowers/plans
cp -R ../../docs/superpowers/specs/2026-09-29-money-plan-design.md ../../docs/superpowers/specs/2026-09-29-money-plan-mockups docs/superpowers/specs/
cp ../../docs/superpowers/plans/2026-09-29-money-plan.md docs/superpowers/plans/
git config user.email   # c.soonue@gmail.com
git add scripts/seed-demo.sql README.md docs
git commit -m "Demo seed, README, design spec + plan + mockups"
```

- [ ] **Step 4: Put the repo on GitHub (needs Chin)**

`gh` is not installed on the Mac mini. Ask Chin to create an **empty private** repo at https://github.com/new — owner `0xchimz`, name `money-plan`, no README/licence. Then:

```bash
cd /Users/chin_mini/Desktop/ChinOS/apps/money-plan
git remote add origin git@github.com:0xchimz/money-plan.git
git push -u origin main
```

Expected: push succeeds (same SSH key as `0xchimz/relu`).

- [ ] **Step 5: Register the submodule in ChinOS and update AGENT.md**

```bash
cd /Users/chin_mini/Desktop/ChinOS
git submodule add git@github.com:0xchimz/money-plan.git apps/money-plan   # adopts the existing clone
git rm -r docs/superpowers/specs/2026-09-29-money-plan-design.md docs/superpowers/specs/2026-09-29-money-plan-mockups docs/superpowers/plans/2026-09-29-money-plan.md
```

In `AGENT.md`, in the `## โครงสร้าง repo` block, add after the `apps/relu/` line:

```
apps/money-plan/      # Planning / Balance / Overview หลาย user บน Cloudflare Workers + D1 (submodule, repo 0xchimz/money-plan) — spec/plan ใน docs/superpowers/
```

Commit only these paths (other sessions may have files staged — never `git add -A` in ChinOS):

```bash
git config user.email   # c.soonue@gmail.com
git add .gitmodules apps/money-plan AGENT.md
git commit -m "money-plan: new submodule (multi-user Planning / Balance / Overview on Cloudflare); design docs moved into the repo"
```

---

### Task 12: First deploy with Chin, then acceptance

**Files:**
- Modify: `apps/money-plan/wrangler.jsonc` (`database_id`, `vars.GOOGLE_CLIENT_ID`)

**Interfaces:**
- Consumes: everything above; Chin's Cloudflare account (exists) and a new Google Cloud project.
- Produces: `https://money-plan.<account>.workers.dev` live with Google login.

Commands marked **Chin** are interactive: suggest them as `! <command>` so they run in the session.

- [ ] **Step 1: Log wrangler in (Chin)**

```bash
! cd /Users/chin_mini/Desktop/ChinOS/apps/money-plan && pnpm exec wrangler login
```

Then `pnpm exec wrangler whoami` shows the account.

- [ ] **Step 2: Create the D1 database**

```bash
pnpm exec wrangler d1 create money-plan
```

Copy the printed `database_id` into `wrangler.jsonc` → `d1_databases[0].database_id` (replacing the zeros).

- [ ] **Step 3: First deploy (login page only)**

```bash
pnpm run deploy
```

Answer `y` if wrangler asks to apply migrations. Note the printed URL `https://money-plan.<account>.workers.dev`. Opening it shows the login card with "ยังไม่ได้ตั้ง GOOGLE_CLIENT_ID".

- [ ] **Step 4: Google OAuth client (Chin, in the browser)**

1. https://console.cloud.google.com → new project `money-plan`.
2. APIs & Services → OAuth consent screen: External · app name `money-plan` · support + developer email · scopes `openid`, `email`, `profile` only → Publish app (these scopes need no Google review). If Chin prefers not to publish, add every family email as a test user instead.
3. Credentials → Create credentials → OAuth client ID → Web application → Authorized JavaScript origins: the URL from Step 3 and `http://localhost:5173`. No redirect URI.
4. Give the **Client ID** (…`.apps.googleusercontent.com`) to the session. The client secret is not used.

- [ ] **Step 5: Wire the client id, set the allowlist, redeploy**

Put the Client ID in `wrangler.jsonc` → `vars.GOOGLE_CLIENT_ID`, then:

```bash
! cd /Users/chin_mini/Desktop/ChinOS/apps/money-plan && pnpm exec wrangler secret put ALLOWED_EMAILS
pnpm run deploy
git config user.email   # c.soonue@gmail.com
git add wrangler.jsonc
git commit -m "Deploy config: D1 database id + Google OAuth client id"
git push
```

(Chin types the comma-separated emails: `c.soonue@gmail.com` + family.) Then bump the submodule pointer in ChinOS: `git add apps/money-plan && git commit -m "Bump apps/money-plan: deployed"`.

- [ ] **Step 6: Acceptance on prod (spec §11)**

Check each and report the result to Chin:
1. Chin logs in with Google → Overview checklist.
2. An email **not** in the list → red box "… ยังไม่ได้รับสิทธิ์", no data.
3. A private/incognito window: `https://money-plan.<account>.workers.dev/api/overview` → `{"error":"กรุณาเข้าสู่ระบบ"}` (401).
4. Chin and one family member each add a Planning line and close a Balance month; neither sees the other's numbers.
5. ออกจากระบบ → back to the login card; the old tab's next action also lands on the login card.
6. Cloudflare dashboard → Workers & Pages → money-plan → Metrics: CPU time per request well under 10 ms; plan = Free.

