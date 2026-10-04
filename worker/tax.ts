// Tax page: stores what the user typed for one tax year. Tax itself is computed in the browser (shared/tax.ts).
import { bangkokMonth, isMonth } from '../shared/month'
import { kindOf, TAX_RULES, taxYears, type TaxRules } from '../shared/tax-rules'
import type { Tax, TaxChange, TaxLine } from '../shared/types'
import { all, one, run, stmt, type Db } from './db'
import { bad, conflict, notFound } from './http'

/** The year asked for; none = this year in Bangkok when it has rules, else the latest year that does */
export function yearParam(raw: string | undefined): number {
  if (raw == null || raw === '') {
    const y = Number(bangkokMonth().slice(0, 4))
    return TAX_RULES[y] ? y : taxYears().at(-1)!
  }
  const y = Number(raw)
  if (!Number.isInteger(y) || !TAX_RULES[y]) throw notFound('ยังไม่มีกติกาภาษีของปีนี้')
  return y
}

const round2 = (n: number) => Math.round(n * 100) / 100
const ensureYear = (db: Db, uid: number, year: number) => stmt(db, 'INSERT OR IGNORE INTO tax_years (user_id, year) VALUES (?, ?)', uid, year)

function amount(v: unknown, what: string) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw bad(`${what}ต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป`)
  return round2(v)
}
const exprOf = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** A kind the user may type a line or a scenario change for */
function typedKind(rules: TaxRules, key: unknown) {
  const k = typeof key === 'string' ? kindOf(rules, key) : undefined
  if (!k || k.auto != null || k.section === 'reserve') throw bad('ไม่รู้จักชนิดรายการนี้')
  return k
}

function readChanges(rules: TaxRules, raw: string): TaxChange[] {
  let v: unknown
  try { v = JSON.parse(raw) } catch { return [] }
  if (!Array.isArray(v)) return []
  return v.flatMap((c) => (c && typeof c.kind === 'string' && typeof c.thb === 'number' && Number.isFinite(c.thb) && kindOf(rules, c.kind) ? [{ kind: c.kind, thb: c.thb }] : []))
}

type Row = { id: number; kind: string; label: string; budgetLineId: number | null; paid: number; paidExpr: string | null; asOf: string | null; lump: number; lumpExpr: string | null }

export async function getTax(db: Db, uid: number, year: number): Promise<Tax> {
  const rules = TAX_RULES[year]
  const [budget, rows, yr, scenarios] = await Promise.all([
    all<{ id: number; item: string; thb: number; taxKind: string }>(db, `SELECT id, item, thb, tax_kind AS taxKind FROM budget_lines
      WHERE user_id = ? AND scenario = 'main' AND tax_kind IS NOT NULL
      ORDER BY CASE type WHEN 'Income' THEN 0 WHEN 'Saving' THEN 1 ELSE 2 END, sort, id`, uid),
    all<Row>(db, `SELECT id, kind, label, budget_line_id AS budgetLineId, paid_thb AS paid, paid_expr AS paidExpr, as_of AS asOf, lump_thb AS lump, lump_expr AS lumpExpr
      FROM tax_lines WHERE user_id = ? AND year = ? ORDER BY sort, id`, uid, year),
    one<{ thb: number; expr: string | null; asOf: string | null }>(db, 'SELECT reserve_thb AS thb, reserve_expr AS expr, reserve_as_of AS asOf FROM tax_years WHERE user_id = ? AND year = ?', uid, year),
    all<{ id: number; name: string; changes: string }>(db, 'SELECT id, name, changes FROM tax_scenarios WHERE user_id = ? AND year = ? ORDER BY sort, id', uid, year),
  ])
  const typed = new Map(rows.filter((r) => r.budgetLineId != null).map((r) => [r.budgetLineId!, r]))
  const lines: TaxLine[] = []
  let monthly = 0
  // tagged plan lines first (name, kind and monthly amount always follow the plan), then the hand-typed lines
  for (const b of budget) {
    const k = kindOf(rules, b.taxKind)
    if (!k) continue
    if (k.section === 'reserve') { monthly += b.thb; continue }
    const r = typed.get(b.id)
    lines.push({ id: r?.id ?? null, kind: b.taxKind, label: b.item, budget: { lineId: b.id, thb: b.thb },
      paid: r?.paid ?? 0, paidExpr: r?.paidExpr ?? null, asOf: r?.asOf ?? null, lump: r?.lump ?? 0, lumpExpr: r?.lumpExpr ?? null })
  }
  for (const r of rows) {
    if (r.budgetLineId != null || !kindOf(rules, r.kind)) continue
    lines.push({ id: r.id, kind: r.kind, label: r.label, budget: null, paid: r.paid, paidExpr: r.paidExpr, asOf: null, lump: 0, lumpExpr: null })
  }
  return {
    year, years: taxYears(), lines,
    reserve: { thb: yr?.thb ?? 0, expr: yr?.expr ?? null, asOf: yr?.asOf ?? null, monthly: round2(monthly) },
    scenarios: scenarios.map((s) => ({ id: s.id, name: s.name, changes: readChanges(rules, s.changes) })),
    today: bangkokMonth(),
  }
}

type Raw = Record<string, unknown>

export async function addTaxLine(db: Db, uid: number, year: number, p: Raw) {
  const k = typedKind(TAX_RULES[year], p.kind)
  const label = String(p.label ?? '').trim() || k.label
  await db.batch([
    ensureYear(db, uid, year),
    stmt(db, `INSERT INTO tax_lines (user_id, year, kind, label, paid_thb, paid_expr, sort)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, (SELECT COALESCE(MAX(sort), 0) + 1 FROM tax_lines WHERE user_id = ?1 AND year = ?2))`,
      uid, year, k.key, label, amount(p.thb, 'ยอด'), exprOf(p.expr)),
  ])
}

/** Paid so far / as-of month / one-off of a tagged plan line; typing again replaces what was there */
export async function setLinkedLine(db: Db, uid: number, year: number, lineId: number, p: Raw) {
  const b = await one<{ item: string; taxKind: string }>(db, "SELECT item, tax_kind AS taxKind FROM budget_lines WHERE id = ? AND user_id = ? AND scenario = 'main' AND tax_kind IS NOT NULL", lineId, uid)
  if (!b) throw notFound('ไม่พบรายการแผนเงินที่ติดป้ายภาษี')
  typedKind(TAX_RULES[year], b.taxKind)
  let asOf: string | null = null
  if (p.asOf != null) {
    if (typeof p.asOf !== 'string' || !isMonth(p.asOf) || !p.asOf.startsWith(`${year}-`)) throw bad('เดือนต้องอยู่ในปีภาษีนี้')
    asOf = p.asOf
  }
  await db.batch([
    ensureYear(db, uid, year),
    stmt(db, `INSERT INTO tax_lines (user_id, year, kind, label, budget_line_id, paid_thb, paid_expr, as_of, lump_thb, lump_expr)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (user_id, year, budget_line_id) DO UPDATE SET kind = excluded.kind, label = excluded.label,
        paid_thb = excluded.paid_thb, paid_expr = excluded.paid_expr, as_of = excluded.as_of, lump_thb = excluded.lump_thb, lump_expr = excluded.lump_expr`,
      uid, year, b.taxKind, b.item, lineId, amount(p.paid ?? 0, 'ยอดที่จ่ายแล้ว'), exprOf(p.paidExpr), asOf, amount(p.lump ?? 0, 'ยอดก้อน'), exprOf(p.lumpExpr)),
  ])
}

const lineOf = (db: Db, uid: number, id: number) =>
  one<{ year: number; budgetLineId: number | null }>(db, 'SELECT year, budget_line_id AS budgetLineId FROM tax_lines WHERE id = ? AND user_id = ?', id, uid)

/** Returns the line's year */
export async function updateTaxLine(db: Db, uid: number, id: number, p: Raw): Promise<number> {
  const row = await lineOf(db, uid, id)
  if (!row) throw notFound('ไม่พบรายการนี้')
  if (row.budgetLineId != null) {
    await setLinkedLine(db, uid, row.year, row.budgetLineId, p)
    return row.year
  }
  const sets: string[] = [], vals: unknown[] = []
  if (p.label !== undefined) {
    const label = String(p.label ?? '').trim()
    if (!label) throw bad('ต้องมีชื่อรายการ')
    sets.push('label = ?'); vals.push(label)
  }
  if (p.thb !== undefined) { sets.push('paid_thb = ?'); vals.push(amount(p.thb, 'ยอด')) }
  if (p.expr !== undefined) { sets.push('paid_expr = ?'); vals.push(exprOf(p.expr)) }
  if (!sets.length) throw bad('ไม่มีอะไรให้แก้')
  await run(db, `UPDATE tax_lines SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`, ...vals, id, uid)
  return row.year
}

export async function deleteTaxLine(db: Db, uid: number, id: number): Promise<number> {
  const row = await lineOf(db, uid, id)
  if (!row) throw notFound('ไม่พบรายการนี้')
  if (row.budgetLineId != null) throw conflict('รายการนี้มาจากแผนเงิน เอาป้ายภาษีออกที่หน้าแผนเงิน')
  await run(db, 'DELETE FROM tax_lines WHERE id = ? AND user_id = ?', id, uid)
  return row.year
}

export async function setReserve(db: Db, uid: number, year: number, p: Raw) {
  let asOf: string | null = null
  if (p.asOf != null) {
    if (typeof p.asOf !== 'string' || !isMonth(p.asOf) || p.asOf < `${year}-01` || p.asOf > TAX_RULES[year].filingMonth) throw bad('เดือนต้องอยู่ระหว่างต้นปีภาษีถึงเดือนที่ยื่น')
    asOf = p.asOf
  }
  await db.batch([
    ensureYear(db, uid, year),
    stmt(db, 'UPDATE tax_years SET reserve_thb = ?, reserve_expr = ?, reserve_as_of = ? WHERE user_id = ? AND year = ?', amount(p.thb, 'ยอด'), exprOf(p.expr), asOf, uid, year),
  ])
}

function cleanName(v: unknown) {
  const name = String(v ?? '').trim().slice(0, 60)
  if (!name) throw bad('ต้องมีชื่อฉากทัศน์')
  return name
}
function cleanChanges(rules: TaxRules, v: unknown): string {
  if (!Array.isArray(v)) throw bad('รายการที่เปลี่ยนไม่ถูกต้อง')
  if (v.length > 20) throw bad('ฉากทัศน์หนึ่งเปลี่ยนได้ไม่เกิน 20 รายการ')
  return JSON.stringify(v.map((c: Raw) => {
    const k = typedKind(rules, c?.kind)
    if (typeof c.thb !== 'number' || !Number.isFinite(c.thb) || c.thb === 0) throw bad('ยอดที่เปลี่ยนต้องเป็นตัวเลขที่ไม่ใช่ 0')
    return { kind: k.key, thb: round2(c.thb) }
  }))
}

export async function addScenario(db: Db, uid: number, year: number, p: Raw) {
  const name = cleanName(p.name), changes = cleanChanges(TAX_RULES[year], p.changes ?? [])
  await db.batch([
    ensureYear(db, uid, year),
    stmt(db, `INSERT INTO tax_scenarios (user_id, year, name, changes, sort)
      VALUES (?1, ?2, ?3, ?4, (SELECT COALESCE(MAX(sort), 0) + 1 FROM tax_scenarios WHERE user_id = ?1 AND year = ?2))`, uid, year, name, changes),
  ])
}

const scenarioOf = (db: Db, uid: number, id: number) =>
  one<{ year: number; name: string; changes: string }>(db, 'SELECT year, name, changes FROM tax_scenarios WHERE id = ? AND user_id = ?', id, uid)

export async function updateScenario(db: Db, uid: number, id: number, p: Raw): Promise<number> {
  const row = await scenarioOf(db, uid, id)
  if (!row) throw notFound('ไม่พบฉากทัศน์นี้')
  const sets: string[] = [], vals: unknown[] = []
  if (p.name !== undefined) { sets.push('name = ?'); vals.push(cleanName(p.name)) }
  if (p.changes !== undefined) { sets.push('changes = ?'); vals.push(cleanChanges(TAX_RULES[row.year], p.changes)) }
  if (!sets.length) throw bad('ไม่มีอะไรให้แก้')
  await run(db, `UPDATE tax_scenarios SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`, ...vals, id, uid)
  return row.year
}

export async function deleteScenario(db: Db, uid: number, id: number): Promise<number> {
  const row = await scenarioOf(db, uid, id)
  if (!row) throw notFound('ไม่พบฉากทัศน์นี้')
  await run(db, 'DELETE FROM tax_scenarios WHERE id = ? AND user_id = ?', id, uid)
  return row.year
}

/** Each change becomes a hand-typed line named after the scenario, then the scenario goes */
export async function applyScenario(db: Db, uid: number, id: number): Promise<number> {
  const row = await scenarioOf(db, uid, id)
  if (!row) throw notFound('ไม่พบฉากทัศน์นี้')
  const rules = TAX_RULES[row.year]
  const changes = readChanges(rules, row.changes)
  if (changes.some((c) => c.thb < 0)) throw conflict('ฉากทัศน์นี้มีรายการที่ลดยอด ให้ไปลดยอดที่รายการจริงเอง')
  await db.batch([
    ...changes.map((c, i) => stmt(db, `INSERT INTO tax_lines (user_id, year, kind, label, paid_thb, sort)
      VALUES (?1, ?2, ?3, ?4, ?5, (SELECT COALESCE(MAX(sort), 0) + 1 FROM tax_lines WHERE user_id = ?1 AND year = ?2) + ?6)`,
      uid, row.year, c.kind, `${kindOf(rules, c.kind)!.label} (${row.name})`, round2(c.thb), i)),
    stmt(db, 'DELETE FROM tax_scenarios WHERE id = ? AND user_id = ?', id, uid),
  ])
  return row.year
}
