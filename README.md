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

### First deploy

```bash
pnpm exec wrangler login                       # once per machine
pnpm exec wrangler d1 create money-plan         # paste the returned database_id into wrangler.jsonc
pnpm exec wrangler secret put ALLOWED_EMAILS    # comma-separated allowlist, before the first deploy
pnpm run deploy
```

Then create the Google OAuth Web client: JavaScript origins = the `workers.dev` URL from the deploy output and
`http://localhost:5173`, no redirect URI needed. Put its Client ID into `wrangler.jsonc` → `vars.GOOGLE_CLIENT_ID`, then redeploy.

Live: https://money-plan.c-soonue.workers.dev

### CI/CD (GitHub Actions, `.github/workflows/ci.yml`)

- Every PR and push: `pnpm typecheck`, `pnpm test`, `pnpm build`.
- Push to `main`, once those pass: `pnpm run deploy` (migrations included). One deploy at a time.
- Needs the repo secret `CLOUDFLARE_API_TOKEN`: Cloudflare → My Profile → API Tokens → template "Edit Cloudflare Workers",
  add permission Account · D1 · Edit, limit it to this account. The account id is in `wrangler.jsonc`.
- `ALLOWED_EMAILS` stays a Worker secret set with `wrangler secret put`; CI never touches it.

## People

Who may log in is the `ALLOWED_EMAILS` secret (comma-separated, the whole list every time):

```bash
pnpm exec wrangler secret put ALLOWED_EMAILS
```

Removing an email locks that person out on their next request, even with a live session.

## ภาษี (Tax page)

`/tax` — ประมาณการภาษีเงินได้บุคคลธรรมดาต่อ user ต่อปีภาษี: เงินได้ 40(1) / 40(2) / 40(5), ค่าลดหย่อน, ขั้นภาษี, จ่ายเพิ่มหรือได้คืน, เงินสำรองภาษีพอไหม, ช่องลดหย่อนที่ยังเหลือ และวางแผนภาษี (ลองเพิ่ม/ลดยอดเทียบกับตัวเลขจริง) เป็นตัวช่วยประมาณการ ไม่ใช่ที่ยื่นภาษี

- **ที่มาของตัวเลข:** แถวงบชุด ปัจจุบัน ในหน้า Planning เลือก "ภาษี: …" ได้ (เงินได้ / ลดหย่อน / หัก ณ ที่จ่าย / เงินสำรองภาษี) → ยอดทั้งปี = จ่ายแล้วสะสม (ถึงเดือนที่ระบุ) + ยอดก้อน + งบต่อเดือน × เดือนที่เหลือ · ของที่ไม่อยู่ในงบ กด "+ เพิ่มรายการ" ในแต่ละหมวดแล้วกรอกยอดทั้งปีเอง
- **โค้ด:** กติกาต่อปีเป็นข้อมูลใน `shared/tax-rules.ts` · ตัวคำนวณล้วนใน `shared/tax.ts` · `shared/tax-view.ts` แปลงข้อมูลจาก API เป็นสิ่งที่หน้าแสดง · Worker (`worker/tax.ts`) เก็บเฉพาะสิ่งที่กรอก ภาษีคำนวณในเบราว์เซอร์ทุกครั้ง · ตาราง `tax_years`, `tax_lines`, `tax_scenarios` + คอลัมน์ `budget_lines.tax_kind` (migration `0003_tax.sql`)
- **ขึ้นปีภาษีใหม่:** อ่าน `docs/superpowers/notes/2026-10-04-tax-follow-ups.md` หัวข้อแรกก่อน (ต้องมีตัวเลือกปีก่อน) → คัดลอกชุดกติกาปีล่าสุดใน `shared/tax-rules.ts` แก้ตามที่กรมสรรพากรเปลี่ยน ใส่ใน `TAX_RULES` → เพิ่ม test ที่มีผลลัพธ์ที่รู้คำตอบ 1 ชุด → push
- กติกาปี 2569 ตรวจกับกรมสรรพากรแล้ว 4 Oct 2026: `docs/superpowers/notes/2026-10-04-tax-rules-2569-check.md`

## Import from Excel

Two one-person importers write SQL; what each maps and what it refuses to overwrite is in its docstring.

- `scripts/import-nitcha-excel.py` — Nitcha's personal-finance workbook (Planning ปัจจุบัน + ตกงาน, every balance-sheet month as closed).
- `scripts/import-portfolio-db.py` — Chin's `apps/portfolio` database (all three plans, tier targets, every closed balance month).

```bash
uv run --no-project --with openpyxl python scripts/import-nitcha-excel.py "<xlsx>" /tmp/import.sql
uv run --no-project python scripts/import-portfolio-db.py ../portfolio/data/portfolio.db /tmp/import.sql
pnpm exec wrangler d1 execute money-plan --local --file /tmp/import.sql            # try it first
pnpm exec wrangler d1 execute money-plan --remote --yes --file /tmp/import.sql
```

## How it fits

- `shared/` — pure logic used by both sides (plan totals, EF, transfers, overview aggregation, Sankey, categories). Unit-tested.
- `worker/` — Hono API. Login = Google ID token (checked with `jose`) → allowlist → a random session token in an HttpOnly cookie, only its SHA-256 stored in D1.
  Every query filters on the session's `user_id`; writes by id use `WHERE id = ? AND user_id = ?` and answer 404 otherwise. Writes must be JSON (CSRF).
  D1 has no interactive transactions: read first, then one `db.batch()`.
- USD rows (Balance): each month has a USD/THB rate (`balance_months.usd_thb`, carried into the next month unconfirmed). A row typed in USD keeps
  `balance_entries.usd`, and its `thb` is always SQLite `ROUND(usd × rate, 2)` — re-priced when the rate changes — so Overview, history and the
  importers only ever read `thb`. `worker/fx.ts` offers the ECB rate (frankfurter.dev) as a suggestion.
- `src/` — React SPA (UI kit copied from `apps/portfolio`). Desktop only.
- Design and plan: `docs/superpowers/specs/2026-09-29-money-plan-design.md`, `docs/superpowers/plans/2026-09-29-money-plan.md`.
