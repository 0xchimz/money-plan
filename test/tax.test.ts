import { describe, expect, it } from 'vitest'
import type { Planning, Tax } from '../shared/types'
import { call, login, ok, sql, uidOf } from './helpers'

const Y = 2026
const get = (cookie: string) => ok<Tax>(call(`/api/tax?year=${Y}`, { cookie }))
const addLine = (cookie: string, json: Record<string, unknown>) => call(`/api/tax/${Y}/lines`, { cookie, json })
const planLine = async (cookie: string, json: Record<string, unknown>) => {
  const p = await ok<Planning>(call('/api/planning/main/lines', { cookie, json: { category: 'X', expr: null, account: null, ...json } }))
  return p.scenarios[0].lines.find((l) => l.item === json.item)!.id
}

describe('tax', () => {
  it('starts empty and creates nothing by reading', async () => {
    const { email, cookie } = await login()
    const t = await get(cookie)
    expect(t).toMatchObject({ year: Y, lines: [], scenarios: [], reserve: { thb: 0, expr: null, asOf: null, monthly: 0 } })
    expect(t.years).toContain(Y)
    expect(t.today).toMatch(/^\d{4}-\d{2}$/)
    expect((await sql('SELECT COUNT(*) AS n FROM tax_years WHERE user_id = ?', await uidOf(email)).first<{ n: number }>())!.n).toBe(0)
    expect((await call('/api/tax?year=1999', { cookie })).status).toBe(404)
    expect((await call('/api/tax?year=abc', { cookie })).status).toBe(404)
    expect((await call('/api/tax', { cookie })).status).toBe(200)
  })

  it('adds, edits and deletes hand-typed lines', async () => {
    const { cookie } = await login()
    let t = await ok<Tax>(addLine(cookie, { kind: 'inc_freelance', label: ' งานนอก ', thb: 148500.004, expr: null }))
    expect(t.lines).toEqual([{ id: expect.any(Number), kind: 'inc_freelance', label: 'งานนอก', budget: null, paid: 148500, paidExpr: null, asOf: null, lump: 0, lumpExpr: null }])
    t = await ok<Tax>(addLine(cookie, { kind: 'ded_parent', label: '', thb: 30000, expr: '30000*1' }))
    expect(t.lines[1]).toMatchObject({ label: 'บิดามารดา (30,000 ต่อคน)', paid: 30000, paidExpr: '30000*1' })
    const id = t.lines[0].id!
    t = await ok<Tax>(call(`/api/tax/lines/${id}`, { method: 'PATCH', cookie, json: { label: 'Freelance', thb: 150000, expr: null } }))
    expect(t.lines[0]).toMatchObject({ label: 'Freelance', paid: 150000 })
    t = await ok<Tax>(call(`/api/tax/lines/${id}`, { method: 'DELETE', cookie, json: {} }))
    expect(t.lines.map((l) => l.kind)).toEqual(['ded_parent'])
    expect((await call(`/api/tax/lines/${id}`, { method: 'DELETE', cookie, json: {} })).status).toBe(404)
  })

  it.each([
    ['an unknown kind', { kind: 'nope', label: 'x', thb: 1 }],
    ['the personal allowance', { kind: 'ded_self', label: 'x', thb: 1 }],
    ['the reserve kind', { kind: 'reserve', label: 'x', thb: 1 }],
    ['a negative amount', { kind: 'ded_life', label: 'x', thb: -1 }],
    ['a text amount', { kind: 'ded_life', label: 'x', thb: '1,000' }],
    ['a null amount', { kind: 'ded_life', label: 'x', thb: null }],
  ])('rejects a line with %s', async (_, json) => {
    const { cookie } = await login()
    expect((await addLine(cookie, json)).status).toBe(400)
  })

  it('shows tagged plan lines right away and stores what is typed for them', async () => {
    const { cookie } = await login()
    const rmf = await planLine(cookie, { type: 'Saving', item: 'RMF', thb: 26650, taxKind: 'ded_rmf' })
    await planLine(cookie, { type: 'Expense', item: 'Tax Reserve', thb: 1300, taxKind: 'reserve' })
    await planLine(cookie, { type: 'Expense', item: 'Food', thb: 9000 })
    let t = await get(cookie)
    expect(t.lines).toEqual([{ id: null, kind: 'ded_rmf', label: 'RMF', budget: { lineId: rmf, thb: 26650 }, paid: 0, paidExpr: null, asOf: null, lump: 0, lumpExpr: null }])
    expect(t.reserve.monthly).toBe(1300)
    const put = (json: Record<string, unknown>) => call(`/api/tax/${Y}/budget-lines/${rmf}`, { method: 'PUT', cookie, json })
    t = await ok<Tax>(put({ paid: 90000, paidExpr: null, asOf: '2026-09', lump: 61316.49, lumpExpr: '61316.49' }))
    expect(t.lines[0]).toMatchObject({ id: expect.any(Number), paid: 90000, asOf: '2026-09', lump: 61316.49, lumpExpr: '61316.49' })
    // typing again replaces, never duplicates; PATCH by id does the same
    t = await ok<Tax>(put({ paid: 116650, paidExpr: null, asOf: '2026-10', lump: 61316.49, lumpExpr: null }))
    expect(t.lines).toHaveLength(1)
    t = await ok<Tax>(call(`/api/tax/lines/${t.lines[0].id}`, { method: 'PATCH', cookie, json: { paid: 1, paidExpr: null, asOf: '2026-10', lump: 0, lumpExpr: null } }))
    expect(t.lines[0]).toMatchObject({ paid: 1, asOf: '2026-10', lump: 0 })
    // the name and amount follow the plan line
    await ok(call(`/api/planning/lines/${rmf}`, { method: 'PATCH', cookie, json: { item: 'TLWORLDRMF', thb: 20000 } }))
    expect((await get(cookie)).lines[0]).toMatchObject({ label: 'TLWORLDRMF', budget: { lineId: rmf, thb: 20000 } })
    // a linked line is removed at the plan, not here
    expect((await call(`/api/tax/lines/${t.lines[0].id}`, { method: 'DELETE', cookie, json: {} })).status).toBe(409)
    // bad input
    expect((await put({ paid: 1, asOf: '2025-12', lump: 0 })).status).toBe(400)
    expect((await put({ paid: 1, asOf: '2026-13', lump: 0 })).status).toBe(400)
    expect((await put({ paid: -1, asOf: null, lump: 0 })).status).toBe(400)
    // a paid amount needs the month it is paid up to
    const noMonth = await put({ paid: 1, asOf: null, lump: 0 })
    expect(noMonth.status).toBe(400)
    expect(await noMonth.json()).toMatchObject({ error: 'ถ้ามียอดที่จ่ายแล้ว ต้องระบุว่าจ่ายถึงสิ้นเดือนไหน' })
    expect((await put({ paid: 0, asOf: null, lump: 5 })).status).toBe(200)
  })

  it('keeps the stored amounts for fields a body leaves out', async () => {
    const { cookie } = await login()
    const rmf = await planLine(cookie, { type: 'Saving', item: 'RMF', thb: 26650, taxKind: 'ded_rmf' })
    const t = await ok<Tax>(call(`/api/tax/${Y}/budget-lines/${rmf}`, { method: 'PUT', cookie, json: { paid: 90000, paidExpr: '60000+30000', asOf: '2026-09', lump: 1, lumpExpr: null } }))
    const t2 = await ok<Tax>(call(`/api/tax/lines/${t.lines[0].id}`, { method: 'PATCH', cookie, json: { lump: 5 } }))
    expect(t2.lines[0]).toMatchObject({ paid: 90000, paidExpr: '60000+30000', asOf: '2026-09', lump: 5 })
  })

  it('refuses amounts for plan lines that are not tax lines', async () => {
    const { cookie } = await login()
    const food = await planLine(cookie, { type: 'Expense', item: 'Food', thb: 9000 })
    const reserve = await planLine(cookie, { type: 'Expense', item: 'Tax Reserve', thb: 1300, taxKind: 'reserve' })
    const v = { paid: 1, paidExpr: null, asOf: null, lump: 0, lumpExpr: null }
    expect((await call(`/api/tax/${Y}/budget-lines/${food}`, { method: 'PUT', cookie, json: v })).status).toBe(404)
    expect((await call(`/api/tax/${Y}/budget-lines/${reserve}`, { method: 'PUT', cookie, json: v })).status).toBe(400)
    expect((await call(`/api/tax/${Y}/budget-lines/999999`, { method: 'PUT', cookie, json: v })).status).toBe(404)
  })

  it('stores the reserve', async () => {
    const { cookie } = await login()
    const put = (json: Record<string, unknown>) => call(`/api/tax/${Y}/reserve`, { method: 'PUT', cookie, json })
    const t = await ok<Tax>(put({ thb: 14378.09, expr: null, asOf: '2026-09' }))
    expect(t.reserve).toEqual({ thb: 14378.09, expr: null, asOf: '2026-09', monthly: 0 })
    expect((await ok<Tax>(put({ thb: 20000, expr: '14378.09+5621.91', asOf: '2027-02' }))).reserve).toMatchObject({ thb: 20000, expr: '14378.09+5621.91', asOf: '2027-02' })
    expect((await put({ thb: 1, expr: null, asOf: '2027-04' })).status).toBe(400)   // after the filing month
    expect((await put({ thb: 1, expr: null, asOf: '2025-12' })).status).toBe(400)
    expect((await put({ thb: -1, expr: null, asOf: null })).status).toBe(400)
  })

  it('keeps scenarios and turns one into real lines', async () => {
    const { cookie } = await login()
    let t = await ok<Tax>(call(`/api/tax/${Y}/scenarios`, { cookie, json: { name: ' RMF เพิ่ม ', changes: [{ kind: 'ded_rmf', thb: 100000 }] } }))
    expect(t.scenarios).toEqual([{ id: expect.any(Number), name: 'RMF เพิ่ม', changes: [{ kind: 'ded_rmf', thb: 100000 }] }])
    const id = t.scenarios[0].id
    t = await ok<Tax>(call(`/api/tax/scenarios/${id}`, { method: 'PATCH', cookie, json: { changes: [{ kind: 'ded_rmf', thb: 50000 }, { kind: 'inc_freelance', thb: -20000 }] } }))
    expect(t.scenarios[0].changes).toHaveLength(2)
    // a negative change cannot become a real line
    expect((await call(`/api/tax/scenarios/${id}/apply`, { cookie, json: {} })).status).toBe(409)
    t = await ok<Tax>(call(`/api/tax/scenarios/${id}`, { method: 'PATCH', cookie, json: { name: 'แผน A', changes: [{ kind: 'ded_rmf', thb: 50000 }] } }))
    t = await ok<Tax>(call(`/api/tax/scenarios/${id}/apply`, { cookie, json: {} }))
    expect(t.scenarios).toEqual([])
    expect(t.lines).toEqual([expect.objectContaining({ kind: 'ded_rmf', label: 'RMF (แผน A)', paid: 50000, budget: null })])
    const other = (await ok<Tax>(call(`/api/tax/${Y}/scenarios`, { cookie, json: { name: 'x', changes: [] } }))).scenarios[0].id
    expect((await ok<Tax>(call(`/api/tax/scenarios/${other}`, { method: 'DELETE', cookie, json: {} }))).scenarios).toEqual([])
    expect((await call(`/api/tax/scenarios/${other}`, { method: 'DELETE', cookie, json: {} })).status).toBe(404)
  })

  it.each([
    ['no name', { name: '  ', changes: [] }],
    ['changes that are not a list', { name: 'x', changes: 'no' }],
    ['an unknown kind', { name: 'x', changes: [{ kind: 'nope', thb: 1 }] }],
    ['a zero change', { name: 'x', changes: [{ kind: 'ded_rmf', thb: 0 }] }],
    ['a text amount', { name: 'x', changes: [{ kind: 'ded_rmf', thb: '5' }] }],
    ['more than 20 changes', { name: 'x', changes: Array.from({ length: 21 }, () => ({ kind: 'ded_rmf', thb: 1 })) }],
  ])('rejects a scenario with %s', async (_, json) => {
    const { cookie } = await login()
    expect((await call(`/api/tax/${Y}/scenarios`, { cookie, json })).status).toBe(400)
  })

  it('ignores kinds the rules do not know', async () => {
    const { email, cookie } = await login()
    const uid = await uidOf(email)
    await sql('INSERT INTO tax_years (user_id, year) VALUES (?, ?)', uid, Y).run()
    await sql("INSERT INTO tax_lines (user_id, year, kind, label, paid_thb) VALUES (?, ?, 'old_kind', 'เก่า', 5), (?, ?, 'ded_life', 'ชีวิต', 7)", uid, Y, uid, Y).run()
    await sql(`INSERT INTO tax_scenarios (user_id, year, name, changes) VALUES (?, ?, 'a', '[{"kind":"old_kind","thb":1},{"kind":"ded_rmf","thb":2},{"kind":"ded_rmf"},7]'), (?, ?, 'b', 'not json')`, uid, Y, uid, Y).run()
    await sql("INSERT INTO budget_lines (user_id, scenario, type, category, item, thb, tax_kind, sort) VALUES (?, 'main', 'Saving', 'X', 'ghost', 1, 'old_kind', 1)", uid).run()
    const t = await get(cookie)
    expect(t.lines.map((l) => l.kind)).toEqual(['ded_life'])
    expect(t.scenarios.map((s) => s.changes)).toEqual([[{ kind: 'ded_rmf', thb: 2 }], []])
  })
})
