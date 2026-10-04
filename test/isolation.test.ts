import { beforeAll, describe, expect, it } from 'vitest'
import { addMonth, bangkokMonth } from '../shared/month'
import type { Balance, Planning, Tax } from '../shared/types'
import { call, login, ok, sql, uidOf } from './helpers'

const cur = bangkokMonth()
const next = addMonth(cur, 1)
let A: { email: string; cookie: string }
let B: { email: string; cookie: string }
let lineId: number
let itemId: number
let taxLineId: number
let taxScenarioId: number
let taggedId: number

/** Everything A can see, to prove it did not change */
const snapshot = async () => JSON.stringify(await Promise.all([
  ok(call('/api/planning', { cookie: A.cookie })),
  ok(call(`/api/balance?month=${cur}`, { cookie: A.cookie })),
  ok(call(`/api/balance?month=${next}`, { cookie: A.cookie })),
  ok(call('/api/overview', { cookie: A.cookie })),
  ok(call('/api/tax?year=2026', { cookie: A.cookie })),
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
  // A: a tagged plan line with typed amounts, a hand-typed tax line, a reserve and a scenario
  const tagged = await ok<Planning>(call('/api/planning/main/lines', { cookie: A.cookie, json: { type: 'Saving', category: 'Investment', item: 'A-rmf', thb: 100, expr: null, account: null, taxKind: 'ded_rmf' } }))
  taggedId = tagged.scenarios[0].lines.find((l) => l.item === 'A-rmf')!.id
  await call(`/api/tax/2026/budget-lines/${taggedId}`, { method: 'PUT', cookie: A.cookie, json: { paid: 5, paidExpr: null, asOf: '2026-09', lump: 0, lumpExpr: null } })
  const tx = await ok<Tax>(call('/api/tax/2026/lines', { cookie: A.cookie, json: { kind: 'ded_life', label: 'A-life', thb: 9, expr: null } }))
  taxLineId = tx.lines.find((l) => l.label === 'A-life')!.id!
  await call('/api/tax/2026/reserve', { method: 'PUT', cookie: A.cookie, json: { thb: 77, expr: null, asOf: '2026-09' } })
  taxScenarioId = (await ok<Tax>(call('/api/tax/2026/scenarios', { cookie: A.cookie, json: { name: 'A-plan', changes: [{ kind: 'ded_rmf', thb: 1 }] } }))).scenarios[0].id
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
    const t = await ok<Tax>(call('/api/tax?year=2026', { cookie: B.cookie }))
    expect(t.lines).toEqual([])
    expect(t.scenarios).toEqual([])
    expect(t.reserve.thb).toBe(0)
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
      [`/api/tax/lines/${taxLineId}`, { method: 'PATCH', cookie: c, json: { thb: 1 } }],
      [`/api/tax/lines/${taxLineId}`, { method: 'DELETE', cookie: c, json: {} }],
      [`/api/tax/2026/budget-lines/${taggedId}`, { method: 'PUT', cookie: c, json: { paid: 1, paidExpr: null, asOf: null, lump: 0, lumpExpr: null } }],
      [`/api/tax/scenarios/${taxScenarioId}`, { method: 'PATCH', cookie: c, json: { name: 'x' } }],
      [`/api/tax/scenarios/${taxScenarioId}`, { method: 'DELETE', cookie: c, json: {} }],
      [`/api/tax/scenarios/${taxScenarioId}/apply`, { cookie: c, json: {} }],
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

  it('keeps A untouched when B writes its own data through every self-scoped endpoint', async () => {
    const before = await snapshot()

    // B: add expense line to main (POST /api/planning/main/lines)
    const mainRes = await ok<Planning>(call('/api/planning/main/lines', { cookie: B.cookie, json: { type: 'Expense', category: 'Utilities', item: 'B-electricity', thb: 2000, expr: null, account: 'B-bank' } }))
    expect(mainRes.scenarios[0].lines.length).toBeGreaterThan(0)

    // B: copy from main to em (POST /api/planning/em/copy)
    await ok(call('/api/planning/em/copy', { cookie: B.cookie, json: { from: 'main' } }))

    // B: copy from main to proj (POST /api/planning/proj/copy)
    await ok(call('/api/planning/proj/copy', { cookie: B.cookie, json: { from: 'main' } }))

    // B: set tier targets (PUT /api/tier-targets)
    await ok(call('/api/tier-targets', { method: 'PUT', cookie: B.cookie, json: { Foundation: 0.25, Core: 0.25, Growth: 0.25, 'High Risk': 0.25 } }))

    // B: add a balance item so cur isn't empty — F1 rejects closing an empty month
    await ok(call(`/api/balance/${cur}/items`, { cookie: B.cookie, json: { side: 'asset', category: 'Cash', item: 'B-cash', tier: null, type: null, country: null, thb: 500 } }))

    // B: close cur (POST /api/balance/{cur}/close)
    await ok(call(`/api/balance/${cur}/close`, { cookie: B.cookie, json: {} }))

    // B: start next (POST /api/balance/{next}/start)
    await ok(call(`/api/balance/${next}/start`, { cookie: B.cookie, json: {} }))

    // A's data is untouched
    expect(await snapshot()).toBe(before)

    // F1: closing B's month must not break B's own overview either
    expect((await call('/api/overview', { cookie: B.cookie })).status).toBe(200)

    // B's planning actually has the lines (to prove the calls did something)
    const bPlanning = await ok<Planning>(call('/api/planning', { cookie: B.cookie }))
    expect(bPlanning.scenarios.every((s) => s.lines.length > 0)).toBe(true)
  })
})
