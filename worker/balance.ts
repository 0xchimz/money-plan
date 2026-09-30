// Balance page: the month-end balance sheet. A new month starts as a draft copied from the previous month; each row
// is confirmed or updated; closing the month makes it count in Overview. D1 has no interactive transactions, so each
// write reads what it needs first and then applies every statement in one atomic batch.
// A row can be typed in USD: the entry keeps that amount in `usd` and its THB value in `thb`, always
// ROUND(usd × the month's usd_thb, 2) computed by SQLite, so changing the month's rate re-prices its USD rows in one UPDATE.
import { addMonth, firstMonthOptions } from '../shared/month'
import { efStatus, totals } from '../shared/planning'
import { transfers } from '../shared/transfers'
import { TIERS, type Balance, type BalanceRow, type BalanceSide, type BudgetLineRow, type MonthStatus, type Tier } from '../shared/types'
import { all, isConstraint, now, one, run, stmt, type Db } from './db'
import { bad, conflict, notFound } from './http'

interface Item { id: number; side: BalanceSide; category: string; item: string; tier: Tier | null; type: string | null; country: string | null; active: number; sort: number }
interface Cell { thb: number; usd: number | null; expr: string | null; confirmed: boolean }
type Month = { month: string; status: MonthStatus; usd_thb: number | null; usd_thb_at: string | null }

const items = (db: Db, uid: number) =>
  all<Item>(db, 'SELECT id, side, category, item, tier, type, country, active, sort FROM balance_items WHERE user_id = ? ORDER BY sort, id', uid)
const monthList = (db: Db, uid: number) =>
  all<Month>(db, 'SELECT month, status, usd_thb, usd_thb_at FROM balance_months WHERE user_id = ? ORDER BY month DESC', uid)

async function requireMonth(db: Db, uid: number, month: string): Promise<Month> {
  const m = await one<Month>(db, 'SELECT month, status, usd_thb, usd_thb_at FROM balance_months WHERE user_id = ? AND month = ?', uid, month)
  if (!m) throw notFound(`ยังไม่มีงบดุลเดือน ${month}`)
  return m
}
async function requireItem(db: Db, uid: number, id: number) {
  if (!(await one(db, 'SELECT 1 AS ok FROM balance_items WHERE user_id = ? AND id = ?', uid, id))) throw notFound('ไม่พบรายการนี้')
}

async function monthCells(db: Db, uid: number, m: Month): Promise<Map<number, Cell>> {
  const rows = await all<{ item_id: number; thb: number; usd: number | null; expr: string | null; updated_at: string | null }>(db,
    'SELECT item_id, thb, usd, expr, updated_at FROM balance_entries WHERE user_id = ? AND month = ?', uid, m.month)
  return new Map(rows.map((r) => [r.item_id, { thb: r.thb, usd: r.usd, expr: r.expr, confirmed: m.status === 'closed' || r.updated_at != null }]))
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
function rateOf(m: Month): number {
  if (m.usd_thb == null) throw conflict(`ใส่เรท USD/THB ของเดือน ${m.month} ก่อน`)
  return m.usd_thb
}
/** An amount typed in THB ({ thb }) or in USD ({ usd }, needs the month's rate); SQL prices it as ROUND(value × rate, 2) */
function typed(m: Month, p: Record<string, unknown>) {
  if (p.usd === undefined) return { value: amount(p.thb), rate: 1, usd: null }
  const usd = amount(p.usd)
  return { value: usd, rate: rateOf(m), usd }
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
  const monthsOut = months.map(({ month, status }) => ({ month, status }))
  if (!current) {
    return { months: monthsOut, next, firstMonths: firstMonthOptions(), month: null, status: null, prevMonth: null,
      fx: { usdThb: null, confirmed: true, prev: null }, rows: [], hidden: [], history: [], targets, transfers: null, hasClosed }
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
    const p = prev.get(i.id)
    return { id: i.id, side: i.side, category: i.category, item: i.item, tier: i.tier, type: i.type, country: i.country,
      thb: c.thb, usd: c.usd, expr: c.expr, confirmed: c.confirmed, prev: p?.thb ?? null, prevUsd: p?.usd ?? null }
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
    months: monthsOut, next, firstMonths: [], month: current.month, status: current.status, prevMonth: prevM?.month ?? null,
    fx: { usdThb: current.usd_thb, confirmed: current.status === 'closed' || current.usd_thb_at != null, prev: prevM?.usd_thb ?? null },
    rows, hidden, history, targets, transfers: transfers(planLines, new Map(done.map((d) => [d.bank, d.done_at]))), hasClosed,
  }
}

/** First month: any of the last 12 months. Later: exactly the month after the latest, which must be closed. Rows and the USD/THB rate carry over unconfirmed. */
export async function startMonth(db: Db, uid: number, month: string) {
  const months = await monthList(db, uid)
  if (!months.length) {
    if (!firstMonthOptions().includes(month)) throw bad('เดือนแรกต้องอยู่ในช่วง 12 เดือนล่าสุดถึงเดือนนี้')
  } else {
    if (months[0].status === 'draft') throw conflict(`ยังมีร่าง ${months[0].month} ค้างอยู่ ปิดหรือลบก่อน`)
    const next = addMonth(months[0].month, 1)
    if (month !== next) throw conflict(`เดือนถัดไปที่เริ่มได้คือ ${next}`)
  }
  const prevMonth = months[0]?.month ?? null
  try {
    // Exactly two statements regardless of sheet size (Workers Free D1: 50 queries/invocation) — the carry-over
    // (active rows, or inactive rows the previous month still had) is one INSERT ... SELECT, not one row per item.
    await db.batch([
      stmt(db, 'INSERT INTO balance_months (user_id, month, status, updated_at, usd_thb) VALUES (?, ?, ?, ?, ?)', uid, month, 'draft', now(), months[0]?.usd_thb ?? null),
      stmt(db, `INSERT INTO balance_entries (user_id, month, item_id, thb, usd, expr, updated_at)
        SELECT ?, ?, i.id, COALESCE(p.thb, 0), p.usd, p.expr, NULL FROM balance_items i
        LEFT JOIN balance_entries p ON p.user_id = i.user_id AND p.month = ? AND p.item_id = i.id
        WHERE i.user_id = ? AND (i.active = 1 OR p.item_id IS NOT NULL)`,
        uid, month, prevMonth, uid),
    ])
  } catch (e) {
    if (isConstraint(e)) throw conflict('เดือนนี้เริ่มไปแล้ว')
    throw e
  }
}

/** { thb, expr } makes it a THB row, { usd, expr } a USD row priced at the month's rate */
export async function setEntry(db: Db, uid: number, month: string, id: number, p: Record<string, unknown>) {
  const t = typed(await requireMonth(db, uid, month), p)
  await requireItem(db, uid, id)
  await db.batch([
    stmt(db, `INSERT INTO balance_entries (user_id, month, item_id, thb, usd, expr, updated_at) VALUES (?, ?, ?, ROUND(? * ?, 2), ?, ?, ?)
      ON CONFLICT (user_id, month, item_id) DO UPDATE SET thb = excluded.thb, usd = excluded.usd, expr = excluded.expr, updated_at = excluded.updated_at`,
      uid, month, id, t.value, t.rate, t.usd, text(p.expr), now()),
    touch(db, uid, month),
  ])
}

/**
 * Switch a row between THB and USD at the month's rate; the typed formula goes, checked-or-not stays.
 * The USD amount keeps 6 decimals so ROUND(usd × rate, 2) gives back the same THB value — flipping ฿→$→฿ never loses a satang.
 */
export async function setCurrency(db: Db, uid: number, month: string, id: number, currency: unknown) {
  const m = await requireMonth(db, uid, month)
  if (currency !== 'THB' && currency !== 'USD') throw bad('สกุลเงินต้องเป็น THB หรือ USD')
  const rate = currency === 'USD' ? rateOf(m) : null
  const e = await one<{ usd: number | null }>(db, 'SELECT usd FROM balance_entries WHERE user_id = ? AND month = ? AND item_id = ?', uid, month, id)
  if (!e) throw notFound('ไม่พบรายการนี้')
  if ((e.usd != null) === (currency === 'USD')) return
  const where = 'WHERE user_id = ? AND month = ? AND item_id = ?'
  await db.batch([
    rate != null
      ? stmt(db, `UPDATE balance_entries SET usd = ROUND(thb / ?, 6), thb = ROUND(ROUND(thb / ?, 6) * ?, 2), expr = NULL ${where}`, rate, rate, rate, uid, month, id)
      : stmt(db, `UPDATE balance_entries SET usd = NULL, expr = NULL ${where}`, uid, month, id),
    touch(db, uid, month),
  ])
}

/** The month's USD/THB rate (typing the same one again confirms it); every USD row of the month is re-priced */
export async function setRate(db: Db, uid: number, month: string, v: unknown) {
  await requireMonth(db, uid, month)
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v >= 10000) throw bad('เรทต้องเป็นตัวเลขมากกว่า 0')
  const rate = Math.round(v * 10000) / 10000
  const t = now()
  await db.batch([
    stmt(db, 'UPDATE balance_months SET usd_thb = ?, usd_thb_at = ?, updated_at = ? WHERE user_id = ? AND month = ?', rate, t, t, uid, month),
    stmt(db, 'UPDATE balance_entries SET thb = ROUND(usd * ?, 2) WHERE user_id = ? AND month = ? AND usd IS NOT NULL', rate, uid, month),
  ])
}

/** Mark rows as checked without changing them (the value really did not move) */
export async function confirmRows(db: Db, uid: number, month: string, ids: unknown) {
  await requireMonth(db, uid, month)
  if (!Array.isArray(ids) || !ids.every((x) => Number.isInteger(x))) throw bad('ids ต้องเป็นรายการตัวเลข')
  const t = now()
  await db.batch([
    // one UPDATE for every id (Workers Free D1: 50 queries/invocation), not one per row
    stmt(db, `UPDATE balance_entries SET updated_at = ? WHERE user_id = ? AND month = ? AND updated_at IS NULL
      AND item_id IN (SELECT value FROM json_each(?))`, t, uid, month, JSON.stringify(ids)),
    touch(db, uid, month),
  ])
}

/** New row (or an existing one brought back), optionally with its amount; the item and its entry are written in one batch */
export async function addItem(db: Db, uid: number, month: string, p: Record<string, unknown>) {
  const m = await requireMonth(db, uid, month)
  const side = p.side, category = text(p.category), name = text(p.item)
  if ((side !== 'asset' && side !== 'liability') || !category || !name) throw bad('ต้องมีฝั่ง หมวด และชื่อรายการ')
  const tier = side === 'asset' ? tierOf(p.tier) : null
  const type = tier ? text(p.type) : null
  const country = tier ? text(p.country) : null
  const t = p.thb === undefined && p.usd === undefined ? null : typed(m, p)
  // new rows go last in their category (or last overall for a new category)
  const sort = ((await one<{ s: number | null }>(db, 'SELECT MAX(sort) AS s FROM balance_items WHERE user_id = ? AND side = ? AND category = ?', uid, side, category))?.s
    ?? (await one<{ s: number | null }>(db, 'SELECT MAX(sort) AS s FROM balance_items WHERE user_id = ?', uid))?.s ?? 0) + 0.01
  const pick = 'FROM balance_items WHERE user_id = ? AND side = ? AND category = ? AND item = ?'
  await db.batch([
    stmt(db, `INSERT INTO balance_items (user_id, side, category, item, tier, type, country, active, sort) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
      ON CONFLICT (user_id, side, category, item) DO UPDATE SET active = 1`, uid, side, category, name, tier, type, country, sort),
    t != null
      ? stmt(db, `INSERT INTO balance_entries (user_id, month, item_id, thb, usd, expr, updated_at) SELECT ?, ?, id, ROUND(? * ?, 2), ?, ?, ? ${pick}
          ON CONFLICT (user_id, month, item_id) DO UPDATE SET thb = excluded.thb, usd = excluded.usd, expr = excluded.expr, updated_at = excluded.updated_at`,
          uid, month, t.value, t.rate, t.usd, text(p.expr), now(), uid, side, category, name)
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

/** Put a hidden row back with last month's value, unconfirmed; a USD row is re-priced at this month's rate (or comes back in THB if there is none) */
export async function restoreEntry(db: Db, uid: number, month: string, id: number) {
  const m = await requireMonth(db, uid, month)
  await requireItem(db, uid, id)
  const prev = await one<Month>(db, 'SELECT month, status, usd_thb, usd_thb_at FROM balance_months WHERE user_id = ? AND month < ? ORDER BY month DESC LIMIT 1', uid, month)
  const c = prev ? (await monthCells(db, uid, prev)).get(id) : undefined
  const t = c?.usd != null && m.usd_thb != null
    ? { value: c.usd, rate: m.usd_thb, usd: c.usd, expr: c.expr }
    : { value: c?.thb ?? 0, rate: 1, usd: null, expr: c?.usd != null ? null : c?.expr ?? null } // a USD formula means nothing in THB
  await db.batch([
    stmt(db, 'INSERT OR IGNORE INTO balance_entries (user_id, month, item_id, thb, usd, expr, updated_at) VALUES (?, ?, ?, ROUND(? * ?, 2), ?, ?, NULL)',
      uid, month, id, t.value, t.rate, t.usd, t.expr),
    stmt(db, 'UPDATE balance_items SET active = 1 WHERE user_id = ? AND id = ?', uid, id),
    touch(db, uid, month),
  ])
}

export async function closeMonth(db: Db, uid: number, month: string) {
  if ((await requireMonth(db, uid, month)).status !== 'draft') throw conflict(`${month} ไม่ได้เป็นร่าง`)
  const count = await one<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM balance_entries WHERE user_id = ? AND month = ?', uid, month)
  if (!count?.n) throw conflict('ยังไม่มีรายการในเดือนนี้ เพิ่มอย่างน้อย 1 รายการก่อนปิดเดือน')
  const t = now()
  await db.batch([
    stmt(db, "UPDATE balance_months SET status = 'closed', closed_at = ?, updated_at = ? WHERE user_id = ? AND month = ?", t, t, uid, month),
    stmt(db, 'UPDATE balance_entries SET updated_at = ? WHERE user_id = ? AND month = ? AND updated_at IS NULL', t, uid, month),
  ])
}

export async function discardDraft(db: Db, uid: number, month: string) {
  if ((await requireMonth(db, uid, month)).status !== 'draft') throw conflict(`${month} ปิดไปแล้ว ลบไม่ได้`)
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
