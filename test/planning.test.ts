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
})
