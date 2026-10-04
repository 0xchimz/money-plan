// Planning page: the monthly plan (income / saving & investing / expenses) in three fixed scenarios per user
import { bangkokMonth } from '../shared/month'
import { kindOf, rulesFor } from '../shared/tax-rules'
import { BUDGET_TYPES, type BudgetLineInput, type BudgetLineRow, type BudgetType, type MonthStatus, type Planning, type ScenarioId } from '../shared/types'
import { all, one, run, stmt, type Db } from './db'
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
    all<BudgetLineRow>(db, `SELECT id, scenario, type, category, item, thb, expr, account, tax_kind AS taxKind FROM budget_lines WHERE user_id = ?
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
  if (p.taxKind !== undefined) {
    if (p.taxKind != null && typeof p.taxKind !== 'string') throw bad('ชนิดภาษีไม่ถูกต้อง')
    out.taxKind = p.taxKind || null
  }
  return out
}

const COLUMN: Record<keyof BudgetLineInput, string> = { type: 'type', category: 'category', item: 'item', thb: 'thb', expr: 'expr', account: 'account', taxKind: 'tax_kind' }

/** A tax kind fits a plan line when the line is in ปัจจุบัน and the year's rules offer that kind to lines of its type */
function checkTaxKind(scenario: string, type: BudgetType, taxKind: string | null | undefined) {
  if (taxKind == null) return
  if (scenario !== 'main') throw bad('ป้ายภาษีใช้ได้เฉพาะชุด ปัจจุบัน')
  const k = kindOf(rulesFor(Number(bangkokMonth().slice(0, 4))), taxKind)
  if (!k || k.auto != null || !k.budgetTypes.includes(type)) throw bad('ชนิดภาษีนี้ใช้กับรายการประเภทนี้ไม่ได้')
}

/**
 * Before a plan line is deleted or loses its tax tag: tax lines linked to it that hold money become hand-typed lines
 * (paid so far + one-off, no more monthly projection); empty ones go. Run these statements in the same batch as the change.
 */
export function detachTaxLines(db: Db, uid: number, lineId: number) {
  return [
    stmt(db, `UPDATE tax_lines SET
        kind = COALESCE((SELECT tax_kind FROM budget_lines WHERE id = ?1 AND user_id = ?2), kind),
        label = COALESCE((SELECT item FROM budget_lines WHERE id = ?1 AND user_id = ?2), label),
        paid_thb = ROUND(paid_thb + lump_thb, 2), paid_expr = NULL, lump_thb = 0, lump_expr = NULL, as_of = NULL, budget_line_id = NULL
      WHERE user_id = ?2 AND budget_line_id = ?1 AND paid_thb + lump_thb > 0`, lineId, uid),
    stmt(db, 'DELETE FROM tax_lines WHERE user_id = ?2 AND budget_line_id = ?1', lineId, uid),
  ]
}

export async function addLine(db: Db, uid: number, scenario: string, p: RawLine) {
  if (!isScenario(scenario) || !(await one(db, 'SELECT 1 AS ok FROM budget_scenarios WHERE user_id = ? AND id = ?', uid, scenario))) {
    throw notFound('ไม่พบชุดงบนี้')
  }
  const v = clean(p)
  if (!v.type || !v.category || !v.item) throw bad('ต้องมีประเภท หมวด และชื่อรายการ')
  checkTaxKind(scenario, v.type, v.taxKind)
  const sort = (await one<{ s: number | null }>(db, 'SELECT MAX(sort) AS s FROM budget_lines WHERE user_id = ? AND scenario = ?', uid, scenario))?.s ?? 0
  await run(db, 'INSERT INTO budget_lines (user_id, scenario, type, category, item, thb, expr, account, tax_kind, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    uid, scenario, v.type, v.category, v.item, v.thb ?? 0, v.expr ?? null, v.account ?? null, v.taxKind ?? null, sort + 1)
}

export async function updateLine(db: Db, uid: number, id: number, p: RawLine) {
  const v = clean(p)
  const keys = Object.keys(v) as (keyof BudgetLineInput)[]
  if (!keys.length) throw bad('ไม่มีอะไรให้แก้')
  const cur = await one<{ scenario: string; type: BudgetType; taxKind: string | null }>(db, 'SELECT scenario, type, tax_kind AS taxKind FROM budget_lines WHERE id = ? AND user_id = ?', id, uid)
  if (!cur) throw notFound('ไม่พบรายการนี้')
  const nextKind = v.taxKind !== undefined ? v.taxKind : cur.taxKind
  if (v.taxKind !== undefined || v.type !== undefined) checkTaxKind(cur.scenario, v.type ?? cur.type, nextKind)
  // the tag goes away (or becomes the reserve, which has no tax line): keep what was already paid as a hand-typed line
  const detach = cur.taxKind != null && nextKind !== cur.taxKind && (nextKind == null || nextKind === 'reserve')
  await db.batch([
    ...(detach ? detachTaxLines(db, uid, id) : []),
    stmt(db, `UPDATE budget_lines SET ${keys.map((k) => `${COLUMN[k]} = ?`).join(', ')} WHERE id = ? AND user_id = ?`, ...keys.map((k) => v[k] ?? null), id, uid),
  ])
}

export async function deleteLine(db: Db, uid: number, id: number) {
  const res = await db.batch([...detachTaxLines(db, uid, id), stmt(db, 'DELETE FROM budget_lines WHERE id = ? AND user_id = ?', id, uid)])
  if (!res.at(-1)!.meta.changes) throw notFound('ไม่พบรายการนี้')
}

/** Fill an empty Projection with every line of ปัจจุบัน, or an empty ตกงาน with its expenses only */
export async function copyScenario(db: Db, uid: number, to: string, from: unknown) {
  if (to !== 'proj' && to !== 'em') throw bad('คัดลอกได้เฉพาะไปที่ Projection หรือ ตกงาน')
  if (from !== 'main') throw bad('คัดลอกได้จากชุด ปัจจุบัน เท่านั้น')
  if (await one(db, 'SELECT 1 AS ok FROM budget_lines WHERE user_id = ? AND scenario = ? LIMIT 1', uid, to)) {
    throw conflict('ชุดนี้มีรายการแล้ว ลบให้ว่างก่อนถ้าจะคัดลอกใหม่')
  }
  const types = to === 'em' ? "('Expense')" : "('Income', 'Saving', 'Expense')"
  if (!(await one(db, `SELECT 1 AS ok FROM budget_lines WHERE user_id = ? AND scenario = 'main' AND type IN ${types} LIMIT 1`, uid))) {
    throw conflict(to === 'em' ? 'ชุด ปัจจุบัน ยังไม่มีรายจ่ายให้คัดลอก' : 'ชุด ปัจจุบัน ยังไม่มีรายการให้คัดลอก')
  }
  // NOT EXISTS keeps two simultaneous copies from both inserting
  await run(db, `INSERT INTO budget_lines (user_id, scenario, type, category, item, thb, expr, account, sort)
    SELECT user_id, ?, type, category, item, thb, expr, account, sort FROM budget_lines
    WHERE user_id = ? AND scenario = 'main' AND type IN ${types}
      AND NOT EXISTS (SELECT 1 FROM budget_lines WHERE user_id = ? AND scenario = ?)`, to, uid, uid, to)
}
