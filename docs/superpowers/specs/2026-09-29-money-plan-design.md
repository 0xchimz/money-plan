# money-plan — design spec

> วันที่: 29 Sep 2026 · สถานะ: **Chin อนุมัติ 29 Sep → plan: `docs/superpowers/plans/2026-09-29-money-plan.md`** (แก้ตาม plan: ชิปผ่อนบ้าน → Mortgage ให้ DSR นับถูก, Sankey คอลัมน์สุดท้าย, แผงแก้เป้าแทน dialog, หมวดหนี้อื่น = Other Debts, pure logic อยู่ `shared/` แทน `worker/domain/`, `pnpm dev` ใช้ `@cloudflare/vite-plugin` process เดียวแทน wrangler dev + proxy) · ที่มา: brainstorming 29 Sep · mockup ที่เลือกแล้วอยู่ใน `2026-09-29-money-plan-mockups/` (เปิดในเบราว์เซอร์ได้เลย, CSS บางส่วนมาจาก frame ของ visual companion จึงอาจเพี้ยนเล็กน้อย)
> ตอนเริ่มลงมือ spec + plan ย้ายไปอยู่ใน repo `money-plan` (`docs/superpowers/`)

## 1. เป้าหมายและขอบเขต

**money-plan** คือเว็บแอปให้ Chin และครอบครัว (คนที่อยู่ใน allowlist) ใช้วางแผนเงินรายเดือน, บันทึกงบดุลรายเดือน และดูภาพรวมการเงินของตัวเอง ข้อมูลของแต่ละคนแยกกัน ใช้ได้ตลอดเวลาโดยไม่ต้องพึ่ง Mac mini และไม่มีค่าใช้จ่าย

**v1 มี 3 หน้า**
1. **Overview**: สรุปการเงินของ user คนนั้นเป็น chart
2. **Planning**: แผนเงินรายเดือน (ยกหน้า Budget ของ portfolio มา)
3. **Balance**: งบดุลรายเดือนที่กรอกเอง (ยกหน้า Balance ของ portfolio มา)

**ถือว่า v1 เสร็จเมื่อ**
- Chin และคนในครอบครัวอย่างน้อย 1 คน login ด้วย Google บน `*.workers.dev` ได้
- ทั้งสองคนกรอก Planning และปิด Balance ได้อย่างน้อย 1 เดือน
- Overview แสดงข้อมูลของตัวเอง และไม่เห็นข้อมูลของอีกคน
- test ที่ยิงข้าม user ผ่านทั้งหมด
- ค่าใช้จ่าย Cloudflare = 0.00 USD/เดือน

**ความสัมพันธ์กับ `apps/portfolio`**
- เป็นคนละ project ไม่แตะ `apps/portfolio` เลย
- Chin ใช้ portfolio บน Mac mini ต่อตามเดิม (crypto, หุ้น, Plan, Flow และ Balance/Budget ของ Chin)
- ไม่มี sync ระหว่างสองแอป บน money-plan ทุกคนรวมถึง Chin เริ่มจากข้อมูลว่าง

**ข้อจำกัด**
- desktop อย่างเดียว (กว้างตั้งแต่ 1024px)
- Cloudflare free tier
- UI ภาษาไทยโทนอุ่นแบบหน้า Balance/Budget ปัจจุบัน
- ตัวเลขเงินแสดงเต็มพร้อมคอมมา ใช้ `thb()` เดิม ไม่ย่อ k/M ในการ์ดหลัก

**ไม่อยู่ใน v1**
- mobile
- sync กับ portfolio, crypto/หุ้นสด, import Excel
- ลบบัญชี, export ข้อมูล
- scenario ที่ user ตั้งเอง (มี 3 ชุดตายตัว)
- แชร์ข้อมูลข้าม user / มุมมองครอบครัวรวม
- แก้เป้า EF เอง, หน้า admin จัดการ user
- Cloudflare Zero Trust / Access (ดูข้อ 5)

## 2. ข้อเท็จจริงของ Cloudflare ที่ design นี้อ้างอิง (เช็ก 29 Sep 2026)

| เรื่อง | Free plan | ผลต่อ design |
| --- | --- | --- |
| Workers CPU / request | 10 ms | endpoint ของ Overview/Balance/Budget ใน portfolio ใช้ CPU 0.4–2.6 ms (วัดบน Mac mini รวมเวลา SQLite ด้วย) → ผ่าน |
| Workers request / วัน | 100,000 | ครอบครัวใช้ไม่ถึง 1% |
| Subrequest ขาออก / request | 50 | v1 เรียกข้างนอกแค่ Google JWKS (cache ไว้) |
| D1 | 500 MB/DB · อ่าน 5M แถว / เขียน 100,000 แถวต่อวัน · API แบบ async เท่านั้น · ไม่มี interactive transaction (มีแต่ `batch()` ที่ atomic) | ข้อ 4, 9 |
| `node:sqlite` บน Workers | ใช้ไม่ได้ (ยกเว้นใน Durable Object) | server เขียนใหม่บน D1 |
| Static assets | serve ผ่าน Worker (Workers Static Assets) ฟรี | SPA อยู่ Worker ตัวเดียวกับ API |
| Domain | ใช้ `money-plan.<account>.workers.dev` ได้ ไม่ต้องซื้อ domain | — |

## 3. สถาปัตยกรรม

```
เบราว์เซอร์ desktop (Chin, ครอบครัว)
  │  https://money-plan.<account>.workers.dev
  ▼
Worker "money-plan" (Hono)
  ├─ static: Vite SPA (dist/) — หน้าเว็บเปล่าเปิดได้โดยไม่ login แต่ไม่มีข้อมูล
  ├─ /api/auth/*  — login ด้วย Google ID token → session cookie
  └─ /api/*       — ต้องมี session · ทุก query ผูกกับ user_id ของ session
  ▼
D1 "money-plan" — ข้อมูลทุกคน แยกด้วย user_id
```

### 3.1 Repo `money-plan` (GitHub `0xchimz/money-plan`, private → submodule `apps/money-plan` ใน ChinOS)

```
money-plan/
  src/                    React 19 + Vite + Tailwind + shadcn (UI kit copy มาจาก portfolio)
    pages/                overview.tsx · planning.tsx · balance.tsx · login.tsx
    components/           layout, charts, chart-card, sankey, money-input, stat, category-icon, ui/
    lib/                  api.ts · format.ts · expr.ts · categories.ts · chips.ts
  worker/
    index.ts              Hono app + routes
    auth.ts               ตรวจ Google ID token, session, allowlist, dev bypass
    db.ts                 helper all/one/run/batch บน D1
    planning.ts           logic ของ Planning (port จาก server/budget.ts)
    balance.ts            logic ของ Balance (port จาก server/balance.ts)
    overview.ts           logic ของ Overview (ใหม่ อ่านจาก balance_entries)
    domain/               pure functions (totals, transfers, sankey graph, EF, contributions) — test ได้ไม่ต้องมี DB
  migrations/0001_init.sql
  test/                   vitest + @cloudflare/vitest-pool-workers
  scripts/seed-demo.ts    user ตัวอย่าง 6 เดือน สำหรับ dev
  wrangler.jsonc
```

### 3.2 Environments

| | local | prod |
| --- | --- | --- |
| รัน | `pnpm dev` = `wrangler dev` (Worker + D1 ในเครื่อง) + Vite (proxy `/api`) | `pnpm run deploy` |
| D1 | local (miniflare) | `money-plan` (remote) |
| login | ปุ่ม Google จริง (origin `http://localhost:5173` อยู่ใน OAuth client) หรือ `DEV_USER_EMAIL` ใน `.dev.vars` | ปุ่ม Google เท่านั้น |
| config | `.dev.vars` (git-ignored) | `GOOGLE_CLIENT_ID` = var · `ALLOWED_EMAILS` = secret |

## 4. Data model (D1)

ทุกตารางที่เป็นข้อมูลของ user มี `user_id` และ D1 บังคับ foreign key เป็นค่าเริ่มต้น (มี test ยืนยัน)

```sql
CREATE TABLE users (
  id          INTEGER PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,     -- ตัวเล็ก, จาก Google ID token (email_verified = true เท่านั้น)
  name        TEXT,
  picture     TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,         -- SHA-256 ของ token ใน cookie (ไม่เก็บ token ตรงๆ)
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL             -- created_at + 30 วัน
);

CREATE TABLE tier_targets (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier     TEXT NOT NULL,               -- Foundation | Core | Growth | High Risk
  target   REAL NOT NULL,               -- 0..1, รวม 4 tier = 1
  PRIMARY KEY (user_id, tier)
);

CREATE TABLE budget_scenarios (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id       TEXT NOT NULL,               -- main | proj | em
  name     TEXT NOT NULL,               -- ปัจจุบัน | Projection | ตกงาน
  note     TEXT,
  sort     INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE budget_lines (
  id        INTEGER PRIMARY KEY,
  user_id   INTEGER NOT NULL,
  scenario  TEXT NOT NULL,
  type      TEXT NOT NULL,              -- Income | Saving | Expense
  category  TEXT NOT NULL,              -- Saving: Saving | Investment | Education
  item      TEXT NOT NULL,
  thb       REAL NOT NULL,              -- ต่อเดือน, >= 0
  expr      TEXT,                       -- สูตรที่พิมพ์ เช่น 3638+5000
  account   TEXT,                       -- ธนาคาร/บัญชีย่อย: หมายเหตุ (ไม่บังคับ)
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
  tier      TEXT,                       -- NULL = ไม่นับเป็นพอร์ตลงทุน
  type      TEXT,                       -- มีค่าเฉพาะเมื่อ tier ไม่ใช่ NULL
  country   TEXT,
  active    INTEGER NOT NULL DEFAULT 1, -- 0 = ไม่ยกไปเดือนใหม่
  sort      INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, side, category, item),
  UNIQUE (user_id, id)                  -- ให้ balance_entries อ้างแบบ (user_id, item_id) ได้
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
  updated_at  TEXT,                     -- NULL = ยกมาจากเดือนก่อน ยังไม่ยืนยัน
  PRIMARY KEY (user_id, month, item_id),
  FOREIGN KEY (user_id, month) REFERENCES balance_months(user_id, month) ON DELETE CASCADE,
  FOREIGN KEY (user_id, item_id) REFERENCES balance_items(user_id, id)
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

**ต่างจาก portfolio**
- ไม่มี `balance_monthly` / `investment_monthly` (เคยมีไว้ให้เข้ากับ Excel) → Overview อ่านจาก `balance_entries` ของเดือนที่ `closed` join `balance_items` ตรงๆ · ผลข้างเคียงที่ยอมรับ: เปลี่ยน tier ของรายการแล้ว กราฟย้อนหลังของรายการนั้นเปลี่ยนตาม
- ไม่มี `balance_targets` → เป้า EF คำนวณจาก Planning (ข้อ 7.5)
- ไม่มี status `excel`, `month_moves`, snapshots, ตาราง crypto/หุ้น

**user ใหม่** (login ครั้งแรก) สร้างใน `batch()` เดียว: แถว `users` + `budget_scenarios` 3 ชุด (main ปัจจุบัน / proj Projection / em ตกงาน) + `tier_targets` 0.10 / 0.40 / 0.35 / 0.15

## 5. Login และ session (ไม่ใช้ Zero Trust)

เลือกทำในแอปเพราะ Chin ไม่ต้อง setup Zero Trust (อาจต้องผูกบัตร) และไม่ต้องพึ่งฟีเจอร์ Access บน Worker ที่เพิ่งออก 14 Aug 2026 ซึ่งยังไม่ได้ยืนยันว่าแพลนฟรีใช้ได้ · ถ้าวันหลังอยากย้ายไป Access เปลี่ยนแค่ `worker/auth.ts` ส่วนตาราง `users` และการแยกข้อมูลไม่ต้องแก้

**Flow**
1. หน้า login (`src/pages/login.tsx`) โหลด Google Identity Services แล้วแสดงปุ่ม "เข้าสู่ระบบด้วย Google" (โหมด popup)
2. Google คืน ID token (JWT) → SPA `POST /api/auth/google { credential }`
3. Worker ตรวจด้วย `jose` `jwtVerify` + `createRemoteJWKSet('https://www.googleapis.com/oauth2/v3/certs')` (เก็บ JWKS ไว้ระดับ module):
   - `iss` ∈ {`accounts.google.com`, `https://accounts.google.com`}
   - `aud` = `GOOGLE_CLIENT_ID`
   - `exp` ยังไม่หมด
   - `email_verified` = true
4. อีเมล (ตัวเล็ก) ต้องอยู่ใน `ALLOWED_EMAILS` (secret, คั่นด้วยคอมมา) ไม่งั้นตอบ 403 `{ error: 'not_allowed', email }` → หน้า login แสดงกล่องแดงตาม mockup
5. หา/สร้าง `users` (อัปเดต name/picture ทุกครั้งที่ login) → สุ่ม token 32 bytes (`crypto.getRandomValues`) → เก็บ SHA-256 ใน `sessions` → ตั้ง cookie `mp_session=<token>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`
6. ทุก `/api/*` (ยกเว้น `/api/auth/*`) ผ่าน middleware: hash cookie → หา session ที่ยังไม่หมดอายุ → `c.set('uid', user_id)` · ไม่มี/หมด → 401 → SPA พาไปหน้า login
7. `POST /api/auth/logout` ลบแถว session + ล้าง cookie · session ที่หมดอายุลบทิ้งตอน login ครั้งถัดไปของ user คนนั้น

**กันช่องโหว่**
- **CSRF:** cookie เป็น `SameSite=Lax` และทุก request ที่แก้ข้อมูล (POST/PUT/PATCH/DELETE) ต้องมี `Content-Type: application/json` ไม่งั้นตอบ 415 (form ข้ามเว็บส่ง JSON ไม่ได้ถ้าไม่ผ่าน CORS preflight และเราไม่เปิด CORS)
- **ไม่เชื่อ user_id จาก client** (body/query/header) เอาจาก session เท่านั้น
- **ไม่ log** token, cookie หรือ ID token
- **ตัด allowlist แล้วมีผลทันที:** ถ้าอีเมลถูกเอาออกจาก `ALLOWED_EMAILS` middleware เช็กซ้ำทุก request (อ่านอีเมลจาก users) แล้วตอบ 403 แม้ session ยังไม่หมด

**Dev bypass:** ถ้ามี `DEV_USER_EMAIL` ใน env **และ** host ของ request เป็น `localhost`/`127.0.0.1` → ข้ามการตรวจ cookie ใช้ user นั้น (สร้างให้ถ้ายังไม่มี) · prod ไม่ตั้ง `DEV_USER_EMAIL` และมี test ยืนยันว่า config แบบ prod ที่ไม่มี cookie ได้ 401

## 6. การแยกข้อมูลระหว่าง user

1. route handler ทุกตัวรับ `uid` จาก context แล้วส่งให้ logic ทุกฟังก์ชันเป็น argument แรก (`(db, uid, ...)`)
2. ทุก SELECT/UPDATE/DELETE มี `user_id = ?` · การแก้/ลบด้วย id ใช้ `WHERE id = ? AND user_id = ?` ถ้าไม่มีแถวเปลี่ยน → 404 (กันเดา id ไปแก้ของคนอื่น)
3. FK แบบ `(user_id, item_id)` และ `(user_id, scenario)` ทำให้ DB เองไม่ยอมให้ข้อมูลของคนหนึ่งชี้ไปที่ของอีกคน
4. test isolation (ข้อ 11) ยิงทุก endpoint ด้วย session ของ B ใส่ id/เดือน/scenario ของ A → ต้องได้ 404 (หรือไม่เห็นข้อมูล) และข้อมูลของ A ต้องไม่เปลี่ยน
5. บอกครอบครัวตรงๆ: ในแอปไม่มีใครเห็นข้อมูลของคนอื่น แต่ Chin เป็นเจ้าของบัญชี Cloudflare จึงเปิดดู D1 ได้

## 7. หน้าจอ (desktop, โทนอุ่น, ภาษาไทย)

### 7.1 Layout ทุกหน้า
- header: `money-plan` · แท็บ Overview / Planning / Balance · ขวาสุดเป็นรูปโปรไฟล์ Google + อีเมล → เมนู "ออกจากระบบ"
- ใช้ class `.finance` (โทนอุ่น) กับทุกหน้า
- หน้า login: mockup `5-login.html` (การ์ดกลางจอ + ปุ่ม Google + กล่องแดงเมื่ออีเมลไม่อยู่ใน allowlist)

### 7.2 Overview — mockup `1-onboarding.html` (A) และ `3-overview.html`

**ยังไม่มีเดือนที่ปิด → checklist 3 ขั้น (แบบ A)**

| ขั้น | ติ๊กเองเมื่อ | ปุ่ม |
| --- | --- | --- |
| 1. วางแผนเงินรายเดือน | scenario `main` มีรายการอย่างน้อย 1 บรรทัด | ไป Planning |
| 2. กรอกงบดุลเดือนแรก | มี `balance_months` อย่างน้อย 1 เดือน (draft ก็ได้) | ไป Balance |
| 3. ปิดเดือน | มีเดือน `closed` แล้ว → checklist หายไป แสดงหน้าเต็ม | — |

ข้าง checklist: การ์ด "หน้านี้จะมีอะไร" · ด้านล่าง: โครงกราฟจางๆ

**มีเดือนที่ปิดแล้ว → layout B** (ทุกตัวเลขมาจากเดือน `closed` ล่าสุด draft ไม่นับ)

| ส่วน | เนื้อหา | แสดงเมื่อ |
| --- | --- | --- |
| Hero | net worth · เปลี่ยนจากเดือนก่อน (บาท + %) · เส้น net worth ทุกเดือนที่ปิด · "N เดือนที่ผ่านมา +X · เฉลี่ย +Y / เดือน" | ส่วนเปลี่ยนแปลง/เส้น ต้องมี ≥ 2 เดือน |
| ตัวชี้ 3 ตัว | ออม+ลงทุนต่อเดือน (Saving รวม / Income ของ `main`) · เงินสำรองฉุกเฉิน (ข้อ 7.5) · หนี้ต่อสินทรัพย์ | ตัวแรกต้องมี income ใน `main` · EF ต้องมีรายจ่ายใน `em` (ไม่งั้นบอกให้ไปตั้ง) |
| เงินเดือนไปไหน | **Sankey แบบหน้า Flow** (component `Sankey` เดิม) เต็มความกว้าง: แหล่งรายรับ → รายรับ → รายจ่าย / ออม / ลงทุน / ยังไม่จัดสรร → หมวด · ปุ่มสลับ ปัจจุบัน / Projection / ตกงาน · ปุ่ม "แก้ใน Planning →" · ชี้เส้นเห็นยอด + รายการย่อย | scenario ที่เลือกมี income (ไม่งั้นแสดงว่างพร้อมปุ่มไป Planning) |
| สินทรัพย์ vs หนี้ รายเดือน | แท่งคู่ต่อเดือน | ≥ 2 เดือน |
| เดือนนี้เปลี่ยนเพราะอะไร | ผลต่อ net worth แยกหมวด เทียบเดือนก่อน (หนี้ลด = บวก) — `DivergingList` เดิม | ≥ 2 เดือน |
| สัดส่วนสินทรัพย์ตามเวลา | `AssetMixCard` เดิม | ≥ 2 เดือน |
| พอร์ตลงทุน | ยอดรวม + "ใส่ tier แล้ว N รายการ" · เทียบเป้า (bar + เส้นเป้า) + ปุ่ม [แก้เป้า] · ตามประเภท / ประเทศ / top holdings | มีรายการที่ใส่ tier ในเดือนล่าสุด |
| Balance sheet | ตาราง `BalanceTable` เดิม (สินทรัพย์ / หนี้สิน / net worth) | เสมอ |

การแบ่ง Sankey: `Saving` + category `Investment` = ลงทุน, `Saving` อื่น = ออม, `Expense` = รายจ่าย · คอลัมน์สุดท้าย: รายจ่ายแยกเป็น **หมวด** (ชี้ดูรายการย่อย) ส่วนออม/ลงทุนแยกเป็นรายการ ตาม mockup · ยังไม่จัดสรร = รายรับ − ทุกอย่าง (ถ้าติดลบแสดงเป็นคำเตือนแทน node)

**แผงแก้เป้า tier** (เปิดในหน้า ไม่ใช่ dialog เพราะชุด UI ยังไม่มี dialog): 4 ช่อง % (Foundation / Core / Growth / High Risk) รวมต้องได้ 100% ถึงจะบันทึกได้ → `PUT /api/tier-targets`

### 7.3 Balance — mockup `2-balance.html` (A)

**ยังไม่มีเดือนเลย:** การ์ด "ยังไม่มีงบดุล" + เลือกเดือน (12 เดือนย้อนหลังถึงเดือนปัจจุบันตามเวลาไทย, ค่าเริ่มต้น = เดือนปัจจุบัน) + ปุ่ม "เริ่มกรอกเดือนแรก"

**เดือนแรก (แบบ A):**
- แสดงทุกหมวดตั้งแต่แรก แต่ละหมวดมีชิปรายการยอดนิยม + "เพิ่มเอง"
- กดชิป → ฟอร์มเปิดในการ์ดหมวดนั้น ชื่อกรอกไว้ให้แล้ว
- ฟอร์มมี: ชื่อ · **ยอด** (พิมพ์สูตรได้ มีช่อง "=" โชว์ผล) · ☐ นับเป็นพอร์ตลงทุน → tier (ปุ่มแบ่ง 4 ช่อง + คำอธิบายสั้น) / ประเภท / ประเทศ
- ชิปของรายการที่มีอยู่แล้วในหมวดนั้นจะหายไป
- ตั้งแต่เดือนที่ 2 หมวดที่ว่างยุบเหลือบรรทัดเดียว ("+ เพิ่มใน หมวด")

**เดือนที่ 2 เป็นต้นไป:** flow เดิมของ portfolio
1. เริ่มเดือนถัดไป → copy ยอดเดือนก่อน (ยังไม่ยืนยัน)
2. ติ๊กแถวที่ยอดไม่เปลี่ยน / แก้ยอด
3. checklist โอนเงินรายธนาคาร (จากคอลัมน์บัญชีใน Planning `main`)
4. ปิดเดือน

ส่วนที่ยังมี: ซ่อน/คืนแถว, ลบร่าง, จัดกลุ่ม tier ภายหลัง, "เพิ่มหมวดใหม่" · ส่วนที่ตัดออก: ค่าสด crypto/หุ้น (ปุ่ม "ใช้ค่าสด", refresh), month_moves, status excel

**หมวดและชิป**

| side | หมวด (ไทย) | ชิป |
| --- | --- | --- |
| asset | Cash (เงินสด / บัญชีออมทรัพย์) | บัญชีออมทรัพย์ · เงินสด |
| asset | Emergency Funds (เงินสำรองฉุกเฉิน) | บัญชีดอกเบี้ยสูง · กองทุนตลาดเงิน |
| asset | PVD (กองทุนสำรองเลี้ยงชีพ) | PVD |
| asset | Insurance & Social Security (ประกัน & ประกันสังคม) | ประกันสังคม · ประกันชีวิต |
| asset | Bond (ตราสารหนี้) | กองทุนตราสารหนี้ · หุ้นกู้ |
| asset | Equity (หุ้น & กองทุนหุ้น) | RMF · SSF · ThaiESG · หุ้นไทย · หุ้นต่างประเทศ |
| asset | Gold (ทองคำ) | ทองคำแท่ง |
| asset | Crypto (คริปโต) | BTC |
| asset | Real Estate (อสังหาริมทรัพย์) | บ้าน / คอนโด |
| asset | Others (อื่นๆ) | — |
| liability | Mortgage (สินเชื่อบ้าน) | สินเชื่อบ้าน |
| liability | Car Loan (สินเชื่อรถ) **ใหม่** | สินเชื่อรถ |
| liability | Credit Card (บัตรเครดิต) **ใหม่** | บัตรเครดิต |
| liability | Other Debts (หนี้อื่นๆ) | — |

tier (คำอธิบายสั้นใต้ปุ่ม): Foundation = เงินต้นปลอดภัย · Core = ลงทุนหลักระยะยาว · Growth = เน้นโต ผันผวนขึ้น · High Risk = เสี่ยงสูง · ประเภท/ประเทศใช้ list เดิม (`Cash, Bonds, Equity, ETF, Commodities, Crypto` / `Thailand, Global, United States, China, Vietnam, Netherlands, Crypto`) พิมพ์ค่าอื่นได้

### 7.4 Planning — mockup `4-planning.html`

ยกหน้า Budget ของ portfolio มาทั้งหน้า: ปุ่มสลับ 3 scenario · hero "ออมและลงทุนต่อเดือน" + "เงินออมไปที่ไหน" · การ์ด allocation / DSR (ผ่อนบ้าน + ผ่อนของ ÷ รายรับ, เส้น 40%) / EF runway · 3 section (รายรับ / ออมและลงทุน / รายจ่าย) แก้ inline · รายจ่ายตามหมวด · เทียบทุกชุดงบ · ลบแล้ว undo ได้

**เพิ่มจากเดิม**
- ชิปรายการยอดนิยมต่อ section (กดแล้วเปิดฟอร์มพร้อม type/category/ชื่อ):

| section | ชิป → category |
| --- | --- |
| รายรับ | เงินเดือน → Salary · รายได้เสริม → Others · ค่าเช่า → Rental · ดอกเบี้ย / ปันผล → Interest Money |
| ออม / ลงทุน | เงินสำรองฉุกเฉิน → Saving · เงินออม → Saving · PVD → Investment · RMF → Investment · ThaiESG → Investment · กองทุนหุ้น → Investment |
| รายจ่าย | ค่าเช่าบ้าน → Housing · ผ่อนบ้าน → Mortgage · อาหาร → Daily Living · เดินทาง → Daily Living · ค่าน้ำไฟ / โทรศัพท์ → Bills & Utilities · ประกัน → Insurance · ผ่อนของ / บัตรเครดิต → Debt · ช้อปปิ้ง → Daily Living · ท่องเที่ยว → Travel |

- scenario ว่าง:
  - **ตกงาน**: อธิบายว่าใช้คำนวณเป้า EF + ปุ่ม "คัดลอกรายจ่ายจาก ปัจจุบัน" (copy เฉพาะ `Expense`) และ "เริ่มจากว่าง" · รายรับที่ยังได้ตอนตกงาน เช่น ค่าเช่า ให้ user เพิ่มเอง
  - **Projection**: ปุ่ม "คัดลอกทั้งหมดจาก ปัจจุบัน"
  - copy ทำได้เฉพาะตอน scenario ปลายทางว่าง (ไม่งั้น 409)
- ชิปของรายการที่มีชื่อซ้ำอยู่แล้วใน section นั้นจะหายไป (แบบเดียวกับ Balance)
- คอลัมน์บัญชีไม่บังคับ

### 7.5 เงินสำรองฉุกเฉิน (EF)
- **ยอด EF** = ผลรวมหมวด `Emergency Funds` · Overview ใช้เดือน closed ล่าสุด · Planning ใช้เดือนล่าสุดรวม draft (เหมือน portfolio)
- **เป้า** = 6 × รายจ่ายรวมใน scenario `em`
- **อยู่ได้กี่เดือน** (ตัวเลขหลัก เทียบกับเป้า 6 เดือน) = ยอด EF ÷ รายจ่าย `em` · บรรทัดรอง: หักรายรับที่ยังได้ = ยอด EF ÷ (รายจ่าย `em` − รายรับ `em`) แสดงเมื่อรายจ่ายมากกว่ารายรับ (แก้ 29 Sep ระหว่างลงมือ ให้ตรงกับ code ที่ Chin เห็นใน portfolio)

## 8. API

ทุก endpoint ตอบ JSON · error = `{ error: string }` · 400 ข้อมูลผิด · 401 ไม่มี session · 403 อีเมลไม่อยู่ใน allowlist · 404 ไม่พบ (รวมกรณีเป็นของ user อื่น) · 409 ชนกับสถานะปัจจุบัน · 415 ไม่ใช่ JSON · ทุก write ตอบข้อมูลของหน้านั้นที่อ่านใหม่ (แบบ portfolio)

| method | path | ทำอะไร |
| --- | --- | --- |
| POST | `/api/auth/google` | `{ credential }` → set cookie · ตอบ `me` |
| POST | `/api/auth/logout` | ลบ session |
| GET | `/api/me` | `{ email, name, picture }` |
| GET | `/api/overview` | ข้อมูล Overview + สถานะ checklist |
| PUT | `/api/tier-targets` | `{ Foundation, Core, Growth, High Risk }` แต่ละตัว 0..1 รวม = 1 (±0.001) |
| GET | `/api/planning` | scenarios + lines + ef |
| POST | `/api/planning/:scenario/lines` | เพิ่มบรรทัด |
| PATCH | `/api/planning/lines/:id` | แก้บรรทัด |
| DELETE | `/api/planning/lines/:id` | ลบบรรทัด |
| POST | `/api/planning/:scenario/copy` | `{ from: 'main' }` · `em` copy เฉพาะ Expense · `proj` copy ทั้งหมด |
| GET | `/api/balance?month=` | เดือนที่ขอ / draft / ล่าสุด |
| POST | `/api/balance/:month/start` | เดือนแรก: ถ้ายังไม่มีเดือนเลย และอยู่ในช่วง 12 เดือนล่าสุดถึงเดือนปัจจุบัน (เวลาไทย) · เดือนถัดไป: ต้องเป็นเดือนล่าสุด + 1 และไม่มี draft ค้าง |
| POST | `/api/balance/:month/close` | ปิดเดือน |
| DELETE | `/api/balance/:month` | ลบร่าง |
| PUT | `/api/balance/:month/entries/:id` | `{ thb, expr }` |
| DELETE | `/api/balance/:month/entries/:id` | ซ่อนแถว |
| POST | `/api/balance/:month/entries/:id/restore` | คืนแถว |
| POST | `/api/balance/:month/confirm` | `{ ids }` ยืนยันว่ายอดไม่เปลี่ยน |
| POST | `/api/balance/:month/items` | `{ side, category, item, thb?, expr?, tier?, type?, country? }` (เพิ่มยอดได้ในตัว) |
| PATCH | `/api/balance/:month/items/:id` | จัดกลุ่ม tier/type/country |
| POST | `/api/balance/:month/transfers/:bank` | `{ done }` |

## 9. Port จาก `apps/portfolio`

| ของเดิม | ทำอะไร |
| --- | --- |
| `src/components/ui/*`, `chart-card`, `charts`, `sankey`, `money-input`, `stat`, `category-icon`, `layout` | copy · layout เปลี่ยนแท็บ + เมนู user |
| `src/lib/format.ts`, `expr.ts`, `categories.ts`, `utils.ts` | copy · categories เพิ่ม Car Loan / Credit Card / หนี้อื่นๆ |
| `src/index.css` (รวม `.finance`) | copy · ใช้โทนอุ่นทุกหน้า |
| `src/pages/budget.tsx` | → `planning.tsx` + ชิป + scenario ว่าง |
| `src/pages/balance.tsx` | → `balance.tsx` ตัด DraftBar ส่วนค่าสด/refresh, StartCard ใหม่, ชิป, ฟอร์มมียอด |
| `src/pages/overview.tsx` | → `overview.tsx` จัด layout B ใหม่ ใช้ `AssetMixCard`, `BalanceTable`, rank cards เดิม · Hero/tiles/Sankey/checklist ใหม่ |
| `src/pages/flow.tsx` `budgetGraph()` | → `worker/domain` หรือ `src/lib` สร้าง node/link ของ Sankey (รายจ่ายแยกหมวด ออม/ลงทุนแยกรายการ) → `shared/sankey.ts` |
| `server/budget.ts` | → `worker/planning.ts` async + `uid` + copy |
| `server/balance.ts` | → `worker/balance.ts` async + `uid` · ตัด materialize/sync/ensureLiveRows/suggestions · `tx()` → อ่านก่อน แล้วเขียนด้วย `db.batch()` · เพิ่ม start เดือนแรก |
| `server/api.ts` `overview()` | → `worker/overview.ts` เขียนใหม่ อ่านจาก `balance_entries` ของเดือน closed |
| ทุกอย่างของ crypto / stocks / plan / flow / seed Excel / cex / sources | ไม่เอามา |

**D1 ไม่มี interactive transaction:** ทุกฟังก์ชันที่เคยใช้ `tx()` เปลี่ยนเป็น (1) อ่านข้อมูลที่ต้องใช้ทั้งหมดก่อน (2) สร้างคำสั่งเขียนเป็น list (3) `db.batch(list)` ซึ่ง atomic · ถ้าชน PK (เช่น 2 แท็บกดเริ่มเดือนเดียวกัน) → 409 "เดือนนี้เริ่มไปแล้ว"

## 10. Error handling

- API: validate ทุก input (เดือน `YYYY-MM`, ยอดเป็นตัวเลข finite, type/tier อยู่ใน list) → 400 ข้อความไทยที่ user อ่านเข้าใจ · error ที่ไม่คาดคิด → 500 `{ error: 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง' }` และ `console.error` รายละเอียด (ดูใน `wrangler tail`)
- SPA: ใช้ pattern `mutate()` เดิม (optimistic → ถ้าพลาด toast + โหลดข้อมูลใหม่) · 401 ที่ไหนก็ตาม → ไปหน้า login · 403 not_allowed → กล่องแดงในหน้า login
- Google JWKS โหลดไม่ได้ → 503 "ระบบ login ของ Google ไม่ตอบ ลองใหม่อีกครั้ง"

## 11. Testing

vitest + `@cloudflare/vitest-pool-workers` (รันใน workerd กับ D1 local, apply migrations ก่อนทุกไฟล์)

| กลุ่ม | ครอบคลุม |
| --- | --- |
| auth | ID token ถูก → cookie + user ใหม่ได้ค่าเริ่มต้นครบ · `aud` ผิด / `iss` ผิด / หมดอายุ / ลายเซ็นผิด / `email_verified` false → 401 · อีเมลไม่อยู่ใน allowlist → 403 · ไม่มี cookie → 401 · session หมดอายุ → 401 · logout แล้ว cookie เดิมใช้ไม่ได้ · เอาอีเมลออกจาก allowlist → 403 · write ที่ไม่ใช่ JSON → 415 · dev bypass ใช้ได้เฉพาะ localhost + มี `DEV_USER_EMAIL` (test ใช้ keypair ของตัวเองแทน Google ผ่าน env `GOOGLE_JWKS_URL` · prod ไม่ตั้งค่านี้ จึงใช้ URL ของ Google) |
| isolation | ทุก endpoint: user B ใส่ id/เดือน/scenario ของ A → 404 และข้อมูล A ไม่เปลี่ยน · GET ของ B ไม่มีข้อมูล A · FK กันการสร้าง entry ที่ชี้ไป item ของอีกคน |
| planning | เพิ่ม/แก้/ลบ · validate · copy (`em` เฉพาะ Expense, `proj` ทั้งหมด, ปลายทางไม่ว่าง → 409) |
| balance | เริ่มเดือนแรก (ช่วงเดือนที่อนุญาต) → เพิ่มรายการพร้อมยอด → ปิด → เริ่มเดือนถัดไป copy ยอด → confirm / แก้ / ซ่อน / คืน → transfers → ปิด · ลบร่าง · เริ่มซ้ำ → 409 |
| domain (pure) | totals, DSR, EF (เป้า, runway, ตัวหาร ≤ 0), transfers (bank/sub/note, รายการจากรายรับ, ไม่มีบัญชี), Sankey graph (ยังไม่จัดสรรติดลบ), contributions, asset mix, allocation vs target — fixture สมมติ ไม่ใช้ข้อมูลจริงของ Chin |
| overview | ไม่มีเดือน → checklist state ถูก · 1 เดือน → ไม่มีส่วนเปรียบเทียบ · 6 เดือน (seed demo) → ทุกส่วนมีค่า · ไม่มี tier → ไม่มีส่วนพอร์ต |

ก่อนบอกว่าเสร็จ: `pnpm test` ผ่าน + `pnpm build` (tsc + vite) ผ่าน + เปิดทุกหน้าใน `wrangler dev` กับ seed demo ดูครบทุกสถานะ (ว่าง / 1 เดือน / 6 เดือน)

**รับงานบน prod (Chin + เอ็งทำด้วยกัน หลัง deploy ครั้งแรก):** login ด้วยอีเมลที่อยู่ใน allowlist ได้ · อีเมลอื่นเจอกล่องแดง · เปิด `/api/overview` ในแท็บ incognito ได้ 401 · Chin กับคนในครอบครัวกรอกคนละชุดแล้วไม่เห็นของกันและกัน · logout แล้วกลับหน้า login

## 12. Setup ครั้งแรก (Chin ทำเอง · มีบัญชี Cloudflare + GitHub แล้ว)

1. **Cloudflare:** เปิด 2FA (ถ้ายังไม่เปิด) · บน Mac mini: `pnpm exec wrangler login` ใน `apps/money-plan`
2. **Google Cloud** (ยังไม่มี project):
   1. console.cloud.google.com → สร้าง project `money-plan`
   2. OAuth consent screen: External · ชื่อแอป money-plan · อีเมล support · scope แค่ `openid`, `email`, `profile` → กด Publish (scope พื้นฐานไม่ต้องให้ Google ตรวจ) · ถ้ายังไม่อยาก publish ให้ใส่อีเมลครอบครัวเป็น test users แทน
   3. Credentials → Create OAuth client ID → Web application → Authorized JavaScript origins: `https://money-plan.<account>.workers.dev` และ `http://localhost:5173` (ไม่ต้องใส่ redirect URI)
   4. ส่ง **Client ID** ให้เอ็ง (ไม่ใช่ความลับ จะใส่ใน `wrangler.jsonc`) · ไม่ต้องใช้ client secret
3. **D1 + secret** (เอ็งพิมพ์คำสั่งให้ Chin กด):
   - `wrangler d1 create money-plan`
   - `wrangler secret put ALLOWED_EMAILS` → ใส่อีเมล Chin + ครอบครัว คั่นด้วยคอมมา
4. **Deploy ครั้งแรก:** `pnpm run deploy` → เปิด URL → ทำ checklist รับงานในข้อ 11
5. **เพิ่มคนทีหลัง:** `wrangler secret put ALLOWED_EMAILS` ใส่รายชื่อใหม่ทั้งชุด (wrangler deploy version ใหม่ให้เอง ไม่ต้อง build)

ชื่อเมนูใน dashboard ของ Google/Cloudflare อาจต่างจากที่เขียนเล็กน้อย

## 13. ลำดับงานที่เสนอ (writing-plans จะแตกละเอียด)

1. **Scaffold:** สร้าง repo `0xchimz/money-plan` (private) + submodule `apps/money-plan` · Vite + React + Tailwind + UI kit ที่ copy มา · Hono Worker + static assets · `wrangler.jsonc` · vitest pool workers · migration `0001_init.sql`
2. **Auth + isolation:** `auth.ts` (Google ID token, session, allowlist, dev bypass, JSON-only writes) + `/api/me` + หน้า login + layout/เมนู user + test auth ทั้งหมด
3. **Planning:** `worker/planning.ts` + copy + test → หน้า Planning + ชิป + scenario ว่าง
4. **Balance:** `worker/balance.ts` (batch แทน tx, เริ่มเดือนแรก, เพิ่มพร้อมยอด) + test → หน้า Balance + StartCard + ชิป
5. **Overview:** `worker/overview.ts` + domain functions + test → หน้า Overview (checklist, layout B, Sankey, แผงแก้เป้า)
6. **Isolation suite + seed demo + README** (วิธี dev/deploy/เพิ่มคน) · อัปเดต AGENT.md (โครงสร้าง repo) + `knowledge/README.md`
7. **Setup ของ Chin (ข้อ 12) → deploy → รับงานบน prod**

ข้อ 1–6 ทำบนเครื่องได้หมดโดยไม่ต้องรอ Chin (ใช้ dev bypass + D1 local) · Google Client ID ต้องได้ก่อนทดสอบปุ่ม login จริง

## 14. คำถามที่ยังเปิด

- ไม่มี (ข้อที่ต้องเช็กตอนทำ: ชื่อเมนูใน Google Cloud console, และ D1 บังคับ FK จริงตามที่ docs บอก — มี test ในข้อ 11)
