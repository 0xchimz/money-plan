import { describe, expect, it } from 'vitest'
import { addMonth, bangkokMonth } from '../shared/month'
import type { Balance, BalanceRow } from '../shared/types'
import { call, login, ok, sql, uidOf } from './helpers'

const cur = bangkokMonth()
const get = (cookie: string, month?: string) => ok<Balance>(call(`/api/balance${month ? `?month=${month}` : ''}`, { cookie }))
const start = (cookie: string, month: string) => call(`/api/balance/${month}/start`, { cookie, json: {} })
const item = (over: Record<string, unknown> = {}) => ({ side: 'asset', category: 'Cash', item: 'บัญชีออมทรัพย์', tier: null, type: null, country: null, ...over })
const addItem = (cookie: string, month: string, over: Record<string, unknown> = {}) => call(`/api/balance/${month}/items`, { cookie, json: item(over) })
const row = (b: Balance, name: string) => b.rows.find((r) => r.item === name) as BalanceRow

describe('balance', () => {
  it('offers the last 12 months (Bangkok time) before any sheet exists', async () => {
    const { cookie } = await login()
    const b = await get(cookie)
    expect(b.month).toBeNull()
    expect(b.months).toEqual([])
    expect(b.firstMonths).toHaveLength(12)
    expect(b.firstMonths[0]).toBe(cur)
    expect(b.firstMonths[11]).toBe(addMonth(cur, -11))
    expect(b.hasClosed).toBe(false)
  })

  it('starts the first month only inside that window, and only once', async () => {
    const { cookie } = await login()
    expect((await start(cookie, addMonth(cur, 1))).status).toBe(400)
    expect((await start(cookie, addMonth(cur, -12))).status).toBe(400)
    expect((await start(cookie, 'bad')).status).toBe(400)
    const b = await ok<Balance>(start(cookie, cur))
    expect(b).toMatchObject({ month: cur, status: 'draft', rows: [], firstMonths: [] })
    expect((await start(cookie, cur)).status).toBe(409)
    expect((await start(cookie, addMonth(cur, 1))).status).toBe(409)
  })

  it('adds items with and without an amount', async () => {
    const { cookie } = await login()
    await start(cookie, cur)
    let b = await ok<Balance>(addItem(cookie, cur, { thb: 85000, expr: '80000+5000' }))
    expect(row(b, 'บัญชีออมทรัพย์')).toMatchObject({ thb: 85000, expr: '80000+5000', confirmed: true, tier: null })
    b = await ok<Balance>(addItem(cookie, cur, { category: 'Equity', item: 'RMF', tier: 'Core', type: 'Fund', country: 'Global' }))
    expect(row(b, 'RMF')).toMatchObject({ thb: 0, confirmed: false, tier: 'Core', type: 'Fund', country: 'Global' })
  })

  it('drops the investment classification of liabilities', async () => {
    const { cookie } = await login()
    await start(cookie, cur)
    const b = await ok<Balance>(addItem(cookie, cur, { side: 'liability', category: 'Mortgage', item: 'สินเชื่อบ้าน', tier: 'Core', type: 'x', country: 'y', thb: 1000 }))
    expect(row(b, 'สินเชื่อบ้าน')).toMatchObject({ tier: null, type: null, country: null })
  })

  it.each([
    ['a bad side', { side: 'both' }],
    ['an empty name', { item: ' ' }],
    ['an unknown tier', { tier: 'Big' }],
    ['an amount with a comma', { thb: '1,000' }],
  ])('rejects an item with %s', async (_, over) => {
    const { cookie } = await login()
    await start(cookie, cur)
    expect((await addItem(cookie, cur, over)).status).toBe(400)
  })

  it('re-adds a removed item instead of duplicating it', async () => {
    const { email, cookie } = await login()
    await start(cookie, cur)
    const id = row(await ok<Balance>(addItem(cookie, cur, { thb: 100 })), 'บัญชีออมทรัพย์').id
    let b = await ok<Balance>(call(`/api/balance/${cur}/entries/${id}`, { method: 'DELETE', cookie, json: {} }))
    expect(b.rows).toEqual([])
    b = await ok<Balance>(addItem(cookie, cur, { thb: 200 }))
    expect(b.rows.map((r) => [r.id, r.thb])).toEqual([[id, 200]])
    expect(b.hidden).toEqual([])
    const n = await sql("SELECT COUNT(*) AS n FROM balance_items WHERE user_id = ? AND item = 'บัญชีออมทรัพย์'", await uidOf(email)).first<{ n: number }>()
    expect(n!.n).toBe(1)
  })

  it('edits, confirms, hides and restores rows', async () => {
    const { cookie } = await login()
    await start(cookie, cur)
    const id = row(await ok<Balance>(addItem(cookie, cur)), 'บัญชีออมทรัพย์').id
    let b = await ok<Balance>(call(`/api/balance/${cur}/entries/${id}`, { method: 'PUT', cookie, json: { thb: 1000.555, expr: null } }))
    expect(row(b, 'บัญชีออมทรัพย์')).toMatchObject({ thb: 1000.56, confirmed: true })
    await call(`/api/balance/${cur}/close`, { cookie, json: {} })
    // hidden rows are the ones last month had: that needs a second month
    const next = addMonth(cur, 1)
    b = await ok<Balance>(start(cookie, next))
    expect(row(b, 'บัญชีออมทรัพย์').confirmed).toBe(false)
    b = await ok<Balance>(call(`/api/balance/${next}/confirm`, { cookie, json: { ids: [id] } }))
    expect(row(b, 'บัญชีออมทรัพย์').confirmed).toBe(true)
    b = await ok<Balance>(call(`/api/balance/${next}/entries/${id}`, { method: 'DELETE', cookie, json: {} }))
    expect(b.rows).toEqual([])
    expect(b.hidden).toEqual([{ id, side: 'asset', category: 'Cash', item: 'บัญชีออมทรัพย์', prev: 1000.56 }])
    b = await ok<Balance>(call(`/api/balance/${next}/entries/${id}/restore`, { cookie, json: {} }))
    expect(row(b, 'บัญชีออมทรัพย์')).toMatchObject({ thb: 1000.56, confirmed: false })
  })

  it('rejects non-numeric amounts and unknown rows or months', async () => {
    const { cookie } = await login()
    await start(cookie, cur)
    const id = row(await ok<Balance>(addItem(cookie, cur)), 'บัญชีออมทรัพย์').id
    for (const thb of ['abc', '1,000', null, true]) {
      expect((await call(`/api/balance/${cur}/entries/${id}`, { method: 'PUT', cookie, json: { thb, expr: null } })).status).toBe(400)
    }
    expect((await call(`/api/balance/${cur}/entries/999999`, { method: 'PUT', cookie, json: { thb: 1, expr: null } })).status).toBe(404)
    expect((await call(`/api/balance/2020-01/entries/${id}`, { method: 'PUT', cookie, json: { thb: 1, expr: null } })).status).toBe(404)
    expect((await call(`/api/balance/${cur}/confirm`, { cookie, json: { ids: 'all' } })).status).toBe(400)
  })

  it('lists transfers from the current plan and ticks banks', async () => {
    const { cookie } = await login()
    const addLine = (json: Record<string, unknown>) => call('/api/planning/main/lines', { cookie, json: { expr: null, account: null, ...json } })
    await addLine({ type: 'Saving', category: 'Saving', item: 'เงินออม', thb: 3000, account: 'KBank/ออม: ทุกวันที่ 1' })
    await addLine({ type: 'Expense', category: 'Mortgage', item: 'ผ่อนบ้าน', thb: 18000, account: 'SCB' })
    await addLine({ type: 'Expense', category: 'Debt', item: 'PVD', thb: 4000 })
    await start(cookie, cur)
    let b = await get(cookie)
    expect(b.transfers!.banks.map((x) => [x.bank, x.thb, x.doneAt])).toEqual([['SCB', 18000, null], ['KBank', 3000, null]])
    expect(b.transfers!.skipped).toEqual([{ item: 'PVD', thb: 4000 }])
    b = await ok<Balance>(call(`/api/balance/${cur}/transfers/SCB`, { cookie, json: { done: true } }))
    expect(b.transfers!.banks[0].doneAt).toEqual(expect.any(String))
    b = await ok<Balance>(call(`/api/balance/${cur}/transfers/SCB`, { cookie, json: { done: false } }))
    expect(b.transfers!.banks[0].doneAt).toBeNull()
  })

  it('uses 6 × ตกงาน expenses as the emergency fund target', async () => {
    const { cookie } = await login()
    await call('/api/planning/em/lines', { cookie, json: { type: 'Expense', category: 'Housing', item: 'ค่าเช่า', thb: 30000, expr: null, account: null } })
    await start(cookie, cur)
    expect((await get(cookie)).targets).toEqual({ 'Emergency Funds': 180000 })
  })

  it('closes a month and carries it into the next', async () => {
    const { cookie } = await login()
    await start(cookie, cur)
    await addItem(cookie, cur, { thb: 100 })
    await addItem(cookie, cur, { item: 'เงินสด' })
    let b = await ok<Balance>(call(`/api/balance/${cur}/close`, { cookie, json: {} }))
    expect(b.status).toBe('closed')
    expect(b.rows.every((r) => r.confirmed)).toBe(true)
    expect(b.next).toBe(addMonth(cur, 1))
    expect(b.hasClosed).toBe(true)
    const next = addMonth(cur, 1)
    b = await ok<Balance>(start(cookie, next))
    expect(b).toMatchObject({ month: next, status: 'draft', prevMonth: cur })
    expect(b.rows.map((r) => [r.item, r.thb, r.confirmed, r.prev])).toEqual([['บัญชีออมทรัพย์', 100, false, 100], ['เงินสด', 0, false, 0]])
    expect(b.history.map((h) => [h.month, h.net, h.draft])).toEqual([[next, 100, true], [cur, 100, false]])
  })

  it('discards a draft but never a closed month', async () => {
    const { cookie } = await login()
    await start(cookie, cur)
    await call(`/api/balance/${cur}/close`, { cookie, json: {} })
    await start(cookie, addMonth(cur, 1))
    const b = await ok<Balance>(call(`/api/balance/${addMonth(cur, 1)}`, { method: 'DELETE', cookie, json: {} }))
    expect(b.months).toEqual([{ month: cur, status: 'closed' }])
    expect((await call(`/api/balance/${cur}`, { method: 'DELETE', cookie, json: {} })).status).toBe(409)
    expect((await call(`/api/balance/${cur}/close`, { cookie, json: {} })).status).toBe(409)
  })
})
