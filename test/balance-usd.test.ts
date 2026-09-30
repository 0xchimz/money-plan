import { afterEach, describe, expect, it, vi } from 'vitest'
import { addMonth, bangkokMonth } from '../shared/month'
import type { Balance, BalanceRow, FxQuote, Overview } from '../shared/types'
import { ecbUsdThb } from '../worker/fx'
import { call, login, ok } from './helpers'

const cur = bangkokMonth()
const next = addMonth(cur, 1)
const start = (cookie: string, month: string) => ok<Balance>(call(`/api/balance/${month}/start`, { cookie, json: {} }))
const rate = (cookie: string, month: string, usdThb: unknown) => call(`/api/balance/${month}/fx`, { method: 'PUT', cookie, json: { usdThb } })
const add = (cookie: string, month: string, over: Record<string, unknown>) =>
  call(`/api/balance/${month}/items`, { cookie, json: { side: 'asset', category: 'Equity', item: 'SCHD', tier: 'Core', type: 'ETF', country: 'US', ...over } })
const put = (cookie: string, month: string, id: number, json: Record<string, unknown>) => call(`/api/balance/${month}/entries/${id}`, { method: 'PUT', cookie, json })
const currency = (cookie: string, month: string, id: number, c: unknown) => call(`/api/balance/${month}/entries/${id}/currency`, { cookie, json: { currency: c } })
const row = (b: Balance, name: string) => b.rows.find((r) => r.item === name) as BalanceRow

describe('balance in USD', () => {
  it('keeps a rate per month and refuses nonsense', async () => {
    const { cookie } = await login()
    let b = await start(cookie, cur)
    expect(b.fx).toEqual({ usdThb: null, confirmed: false, prev: null })
    b = await ok<Balance>(rate(cookie, cur, 32.45678))
    expect(b.fx).toEqual({ usdThb: 32.4568, confirmed: true, prev: null })
    for (const v of [0, -1, '32.4', null, 1e6]) expect((await rate(cookie, cur, v)).status).toBe(400)
    expect((await rate(cookie, '2020-01', 32)).status).toBe(404)
  })

  it('needs the month rate before any USD amount', async () => {
    const { cookie } = await login()
    await start(cookie, cur)
    expect((await add(cookie, cur, { usd: 100 })).status).toBe(409)
    const id = row(await ok<Balance>(add(cookie, cur, {})), 'SCHD').id
    expect((await put(cookie, cur, id, { usd: 100, expr: null })).status).toBe(409)
    expect((await currency(cookie, cur, id, 'USD')).status).toBe(409)
  })

  it('prices USD rows at the rate and re-prices them when it changes, THB rows untouched', async () => {
    const { cookie } = await login()
    await start(cookie, cur)
    await rate(cookie, cur, 32.45)
    let b = await ok<Balance>(add(cookie, cur, { usd: 8949.53, expr: '8000+949.53' }))
    b = await ok<Balance>(add(cookie, cur, { item: 'SCBWORLD', thb: 418221.4 }))
    expect(row(b, 'SCHD')).toMatchObject({ usd: 8949.53, thb: 290412.25, expr: '8000+949.53', confirmed: true })
    expect(row(b, 'SCBWORLD')).toMatchObject({ usd: null, thb: 418221.4 })
    b = await ok<Balance>(put(cookie, cur, row(b, 'SCHD').id, { usd: 1000.126, expr: null }))
    expect(row(b, 'SCHD')).toMatchObject({ usd: 1000.13, thb: 32454.22, expr: null })
    b = await ok<Balance>(rate(cookie, cur, 33))
    expect(row(b, 'SCHD')).toMatchObject({ usd: 1000.13, thb: 33004.29 })
    expect(row(b, 'SCBWORLD').thb).toBe(418221.4)
    expect(b.history[0].assets).toBeCloseTo(33004.29 + 418221.4, 2)
  })

  it('a THB amount turns a USD row back into THB', async () => {
    const { cookie } = await login()
    await start(cookie, cur)
    await rate(cookie, cur, 32)
    const id = row(await ok<Balance>(add(cookie, cur, { usd: 10 })), 'SCHD').id
    const b = await ok<Balance>(put(cookie, cur, id, { thb: 500, expr: null }))
    expect(row(b, 'SCHD')).toMatchObject({ usd: null, thb: 500 })
  })

  it('switches currency at the month rate, keeping the THB value and whether it was checked', async () => {
    const { cookie } = await login()
    await start(cookie, cur)
    await rate(cookie, cur, 34)
    const id = row(await ok<Balance>(add(cookie, cur, { thb: 34000, expr: '30000+4000' })), 'SCHD').id
    await ok(call(`/api/balance/${cur}/close`, { cookie, json: {} }))
    await start(cookie, next)
    let b = await ok<Balance>(currency(cookie, next, id, 'USD'))
    expect(row(b, 'SCHD')).toMatchObject({ usd: 1000, thb: 34000, expr: null, confirmed: false })
    b = await ok<Balance>(currency(cookie, next, id, 'USD')) // already USD: nothing changes
    expect(row(b, 'SCHD')).toMatchObject({ usd: 1000, thb: 34000 })
    b = await ok<Balance>(currency(cookie, next, id, 'THB'))
    expect(row(b, 'SCHD')).toMatchObject({ usd: null, thb: 34000, expr: null, confirmed: false })
    expect((await currency(cookie, next, id, 'EUR')).status).toBe(400)
    expect((await currency(cookie, next, 999999, 'THB')).status).toBe(404)
  })

  it('carries the rate (unconfirmed) and USD rows into the next month; a new rate there leaves the closed month alone', async () => {
    const { cookie } = await login()
    await start(cookie, cur)
    await rate(cookie, cur, 32.45)
    await add(cookie, cur, { usd: 1000 })
    await ok(call(`/api/balance/${cur}/close`, { cookie, json: {} }))
    let b = await start(cookie, next)
    expect(b.fx).toEqual({ usdThb: 32.45, confirmed: false, prev: 32.45 })
    expect(row(b, 'SCHD')).toMatchObject({ usd: 1000, thb: 32450, prev: 32450, prevUsd: 1000, confirmed: false })
    b = await ok<Balance>(rate(cookie, next, 32.45)) // same rate typed again = checked
    expect(b.fx.confirmed).toBe(true)
    b = await ok<Balance>(rate(cookie, next, 33.5))
    expect(row(b, 'SCHD')).toMatchObject({ usd: 1000, thb: 33500, prev: 32450 })
    const closed = await ok<Balance>(call(`/api/balance?month=${cur}`, { cookie }))
    expect(closed.fx).toEqual({ usdThb: 32.45, confirmed: true, prev: null })
    expect(row(closed, 'SCHD').thb).toBe(32450)
  })

  it('restores a hidden USD row at this month rate', async () => {
    const { cookie } = await login()
    await start(cookie, cur)
    await rate(cookie, cur, 30)
    const id = row(await ok<Balance>(add(cookie, cur, { usd: 100, expr: '60+40' })), 'SCHD').id
    await ok(call(`/api/balance/${cur}/close`, { cookie, json: {} }))
    await start(cookie, next)
    await rate(cookie, next, 35)
    await ok(call(`/api/balance/${next}/entries/${id}`, { method: 'DELETE', cookie, json: {} }))
    const b = await ok<Balance>(call(`/api/balance/${next}/entries/${id}/restore`, { cookie, json: {} }))
    expect(row(b, 'SCHD')).toMatchObject({ usd: 100, thb: 3500, expr: '60+40', confirmed: false })
  })

  it('Overview counts USD rows at their THB value', async () => {
    const { cookie } = await login()
    await start(cookie, cur)
    await rate(cookie, cur, 32.5)
    await add(cookie, cur, { usd: 2000 })
    await add(cookie, cur, { item: 'KKP', category: 'Cash', tier: null, thb: 1000 })
    await ok(call(`/api/balance/${cur}/close`, { cookie, json: {} }))
    const o = await ok<Overview>(call('/api/overview', { cookie }))
    expect(o.netWorth).toBe(66000)
    expect(o.investTotal).toBe(65000)
  })

  it("never touches another person's month", async () => {
    const a = await login(), b = await login()
    await start(a.cookie, cur)
    await rate(a.cookie, cur, 30)
    const id = row(await ok<Balance>(add(a.cookie, cur, { thb: 300 })), 'SCHD').id
    await start(b.cookie, cur)
    await rate(b.cookie, cur, 40)
    expect((await currency(b.cookie, cur, id, 'USD')).status).toBe(404)
    expect((await ok<Balance>(call('/api/balance', { cookie: a.cookie }))).fx.usdThb).toBe(30)
  })
})

describe('ECB reference rate', () => {
  afterEach(() => { vi.restoreAllMocks() })
  const answer = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }))

  it('asks for the last day of a finished month, and latest while the month is running', async () => {
    const f = answer({ amount: 1, base: 'USD', date: '2026-08-28', rates: { THB: 32.95512 } })
    expect(await ecbUsdThb('2026-08', '2026-09-30', f as unknown as typeof fetch)).toEqual({ rate: 32.9551, date: '2026-08-28', source: 'ECB' })
    expect((f.mock.calls[0] as unknown[])[0]).toBe('https://api.frankfurter.dev/v1/2026-08-31?base=USD&symbols=THB')
    await ecbUsdThb('2026-09', '2026-09-30', f as unknown as typeof fetch)
    expect((f.mock.calls[1] as unknown[])[0]).toBe('https://api.frankfurter.dev/v1/latest?base=USD&symbols=THB')
  })

  it('answers null when the service fails or says something odd', async () => {
    expect(await ecbUsdThb('2026-08', '2026-09-30', answer({}, 500) as unknown as typeof fetch)).toBeNull()
    expect(await ecbUsdThb('2026-08', '2026-09-30', answer({ date: '2026-08-28', rates: {} }) as unknown as typeof fetch)).toBeNull()
    expect(await ecbUsdThb('2026-08', '2026-09-30', vi.fn(async () => { throw new Error('offline') }) as unknown as typeof fetch)).toBeNull()
  })

  it('is served per month to a logged-in user', async () => {
    const { cookie } = await login()
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ date: '2026-08-28', rates: { THB: 32.955 } })))
    expect(await ok<FxQuote>(call('/api/balance/2026-08/fx/ecb', { cookie }))).toEqual({ rate: 32.955, date: '2026-08-28', source: 'ECB' })
    expect((await call('/api/balance/2026-08/fx/ecb')).status).toBe(401)
    expect((await call('/api/balance/bad/fx/ecb', { cookie })).status).toBe(400)
  })
})
