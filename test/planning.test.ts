import { describe, expect, it } from 'vitest'
import type { Planning, Tax } from '../shared/types'
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
    expect(((await res.json()) as { error: string }).error).toEqual(expect.any(String))
  })

  it('rejects a JSON body of null with a validation 400, not a 500 (F5)', async () => {
    const { cookie } = await login()
    const res = await call('/api/planning/main/lines', { cookie, json: null })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toEqual(expect.any(String))
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

  it('409s copying into em or proj when main has nothing copyable (F6)', async () => {
    const { cookie } = await login()
    let res = await call('/api/planning/em/copy', { cookie, json: { from: 'main' } })
    expect(res.status).toBe(409)
    expect((await res.json()) as { error: string }).toEqual({ error: 'ชุด ปัจจุบัน ยังไม่มีรายจ่ายให้คัดลอก' })
    res = await call('/api/planning/proj/copy', { cookie, json: { from: 'main' } })
    expect(res.status).toBe(409)
    expect((await res.json()) as { error: string }).toEqual({ error: 'ชุด ปัจจุบัน ยังไม่มีรายการให้คัดลอก' })
    // main has income/saving but no expense: em (expense-only) still has nothing to copy
    await add(cookie, 'main', line({ type: 'Income', category: 'Salary', item: 'เงินเดือน', thb: 60000 }))
    res = await call('/api/planning/em/copy', { cookie, json: { from: 'main' } })
    expect(res.status).toBe(409)
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

  const patchLine = (cookie: string, id: number, json: Record<string, unknown>) => call(`/api/planning/lines/${id}`, { method: 'PATCH', cookie, json })

  it('tags a main line with a tax kind and clears it again', async () => {
    const { cookie } = await login()
    let p = await ok<Planning>(add(cookie, 'main', line({ type: 'Saving', category: 'Investment', item: 'RMF', thb: 26650 })))
    const l = main(p).lines[0]
    expect(l.taxKind).toBeNull()
    p = await ok<Planning>(patchLine(cookie, l.id, { taxKind: 'ded_rmf' }))
    expect(main(p).lines[0].taxKind).toBe('ded_rmf')
    p = await ok<Planning>(patchLine(cookie, l.id, { taxKind: null }))
    expect(main(p).lines[0].taxKind).toBeNull()
    // a new line can carry its tag (used by "undo delete")
    p = await ok<Planning>(add(cookie, 'main', line({ type: 'Income', category: 'Salary', item: 'เงินเดือน', thb: 1, taxKind: 'inc_wage' })))
    expect(main(p).lines.find((x) => x.item === 'เงินเดือน')?.taxKind).toBe('inc_wage')
  })

  it.each([
    ['a deduction on an income line', 'Income', 'ded_rmf'],
    ['an income kind on a saving line', 'Saving', 'inc_wage'],
    ['a kind nobody types (personal allowance)', 'Saving', 'ded_self'],
    ['an unknown kind', 'Saving', 'nope'],
    ['a non-string kind', 'Saving', 5],
  ])('rejects %s', async (_, type, taxKind) => {
    const { cookie } = await login()
    const p = await ok<Planning>(add(cookie, 'main', line({ type, category: 'X', item: 'x' })))
    expect((await patchLine(cookie, main(p).lines[0].id, { taxKind })).status).toBe(400)
  })

  it('allows tax kinds on the main scenario only and never copies them', async () => {
    const { cookie } = await login()
    await add(cookie, 'main', line({ type: 'Saving', category: 'Investment', item: 'RMF', taxKind: 'ded_rmf' }))
    const p = await ok<Planning>(call('/api/planning/proj/copy', { cookie, json: { from: 'main' } }))
    const proj = p.scenarios.find((s) => s.id === 'proj')!.lines[0]
    expect(proj.taxKind).toBeNull()
    expect((await patchLine(cookie, proj.id, { taxKind: 'ded_rmf' })).status).toBe(400)
    expect((await add(cookie, 'em', line({ taxKind: 'ded_life' }))).status).toBe(400)
  })

  describe('a plan line that already has tax amounts', () => {
    const setup = async (paid: number, lump: number) => {
      const { email, cookie } = await login()
      const uid = await uidOf(email)
      const p = await ok<Planning>(add(cookie, 'main', line({ type: 'Saving', category: 'Investment', item: 'RMF', thb: 26650, taxKind: 'ded_rmf' })))
      const id = main(p).lines[0].id
      await sql('INSERT INTO tax_years (user_id, year) VALUES (?, 2026)', uid).run()
      await sql("INSERT INTO tax_lines (user_id, year, kind, label, budget_line_id, paid_thb, paid_expr, as_of, lump_thb) VALUES (?, 2026, 'ded_rmf', 'RMF', ?, ?, '1+1', '2026-09', ?)", uid, id, paid, lump).run()
      const rows = () => sql('SELECT kind, label, budget_line_id AS b, paid_thb AS paid, paid_expr AS expr, as_of AS asOf, lump_thb AS lump FROM tax_lines WHERE user_id = ?', uid).all()
      return { cookie, id, rows }
    }

    it('keeps what was paid when the plan line is deleted', async () => {
      const { cookie, id, rows } = await setup(90000, 61316.49)
      await ok(call(`/api/planning/lines/${id}`, { method: 'DELETE', cookie, json: {} }))
      expect((await rows()).results).toEqual([{ kind: 'ded_rmf', label: 'RMF', b: null, paid: 151316.49, expr: null, asOf: '2026-09', lump: 0 }])
    })

    it('keeps what was paid when the tag is removed, and drops an empty tax line', async () => {
      const a = await setup(90000, 0)
      await ok(patchLine(a.cookie, a.id, { taxKind: null }))
      expect((await a.rows()).results).toEqual([{ kind: 'ded_rmf', label: 'RMF', b: null, paid: 90000, expr: null, asOf: '2026-09', lump: 0 }])
      const b = await setup(0, 0)
      await ok(patchLine(b.cookie, b.id, { taxKind: null }))
      expect((await b.rows()).results).toEqual([])
    })

    const taxLines = (cookie: string) => ok<Tax>(call('/api/tax?year=2026', { cookie })).then((t) => t.lines)

    it('re-attaches the detached row when the same tag comes back', async () => {
      const { cookie, id, rows } = await setup(90000, 61316.49)
      await ok(patchLine(cookie, id, { taxKind: null }))
      await ok(patchLine(cookie, id, { taxKind: 'ded_rmf' }))
      expect((await rows()).results).toEqual([{ kind: 'ded_rmf', label: 'RMF', b: id, paid: 151316.49, expr: null, asOf: '2026-09', lump: 0 }])
      const lines = await taxLines(cookie)
      expect(lines).toHaveLength(1)
      expect(lines[0]).toMatchObject({ budget: { lineId: id, thb: 26650 }, paid: 151316.49, asOf: '2026-09', lump: 0 })
    })

    it('re-attaches to the new line when a deleted line is added back (undo)', async () => {
      const { cookie, id, rows } = await setup(90000, 61316.49)
      await ok(call(`/api/planning/lines/${id}`, { method: 'DELETE', cookie, json: {} }))
      await ok(add(cookie, 'main', line()))   // takes the freed id, so the re-added line gets a different one
      const p = await ok<Planning>(add(cookie, 'main', line({ type: 'Saving', category: 'Investment', item: 'RMF', thb: 26650, taxKind: 'ded_rmf' })))
      const newId = main(p).lines.find((l) => l.item === 'RMF')!.id
      expect(newId).not.toBe(id)
      expect((await rows()).results).toEqual([{ kind: 'ded_rmf', label: 'RMF', b: newId, paid: 151316.49, expr: null, asOf: '2026-09', lump: 0 }])
      expect(await taxLines(cookie)).toHaveLength(1)
    })

    it('does not re-attach for another kind, nor a row whose amount was re-typed, nor another user', async () => {
      const a = await setup(90000, 0)
      await ok(patchLine(a.cookie, a.id, { taxKind: null }))
      await ok(patchLine(a.cookie, a.id, { taxKind: 'ded_esg' }))
      expect((await a.rows()).results).toEqual([{ kind: 'ded_rmf', label: 'RMF', b: null, paid: 90000, expr: null, asOf: '2026-09', lump: 0 }])

      const b = await setup(90000, 0)
      await ok(patchLine(b.cookie, b.id, { taxKind: null }))
      const t = await taxLines(b.cookie)
      await ok(call(`/api/tax/lines/${t[0].id}`, { method: 'PATCH', cookie: b.cookie, json: { thb: 95000 } }))
      await ok(patchLine(b.cookie, b.id, { taxKind: 'ded_rmf' }))
      expect((await b.rows()).results).toEqual([{ kind: 'ded_rmf', label: 'RMF', b: null, paid: 95000, expr: null, asOf: null, lump: 0 }])

      const owner = await setup(90000, 0)
      await ok(patchLine(owner.cookie, owner.id, { taxKind: null }))
      const other = await login()
      const p = await ok<Planning>(add(other.cookie, 'main', line({ type: 'Saving', category: 'Investment', item: 'RMF', thb: 26650 })))
      await ok(patchLine(other.cookie, main(p).lines[0].id, { taxKind: 'ded_rmf' }))
      expect((await owner.rows()).results).toEqual([{ kind: 'ded_rmf', label: 'RMF', b: null, paid: 90000, expr: null, asOf: '2026-09', lump: 0 }])
    })

    it('keeps the link when the tag changes to another kind, and detaches when it becomes the tax reserve', async () => {
      const a = await setup(90000, 0)
      await ok(patchLine(a.cookie, a.id, { taxKind: 'ded_esg' }))
      expect((await a.rows()).results[0]).toMatchObject({ b: a.id, paid: 90000 })
      await ok(patchLine(a.cookie, a.id, { taxKind: 'reserve' }))
      expect((await a.rows()).results[0]).toMatchObject({ kind: 'ded_esg', b: null, paid: 90000 })
    })
  })
})
