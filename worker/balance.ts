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
