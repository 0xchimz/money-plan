import { describe, expect, it } from 'vitest'
import { bangkokMonth } from '../shared/month'
import type { Overview } from '../shared/types'
import { call, login, ok } from './helpers'

const cur = bangkokMonth()
const get = (cookie: string) => ok<Overview>(call('/api/overview', { cookie }))

describe('overview', () => {
  it('ticks the checklist as the user goes and ignores drafts', async () => {
    const { cookie } = await login()
    expect((await get(cookie)).checklist).toEqual({ planning: false, balanceStarted: false, closed: false })
    await call('/api/planning/main/lines', { cookie, json: { type: 'Income', category: 'Salary', item: 'เงินเดือน', thb: 50000, expr: null, account: null } })
    expect((await get(cookie)).checklist.planning).toBe(true)
    await call(`/api/balance/${cur}/start`, { cookie, json: {} })
    await call(`/api/balance/${cur}/items`, { cookie, json: { side: 'asset', category: 'Cash', item: 'SCB', tier: null, type: null, country: null, thb: 5000 } })
    let o = await get(cookie)
    expect(o.checklist.balanceStarted).toBe(true)
    expect(o.month).toBeNull()
    await call(`/api/balance/${cur}/close`, { cookie, json: {} })
    o = await get(cookie)
    expect(o).toMatchObject({ month: cur, netWorth: 5000, checklist: { planning: true, balanceStarted: true, closed: true } })
  })

  it('saves tier targets that add up to 100%', async () => {
    const { cookie } = await login()
    const put = (json: unknown) => call('/api/tier-targets', { method: 'PUT', cookie, json })
    await ok(put({ Foundation: 0.2, Core: 0.5, Growth: 0.2, 'High Risk': 0.1 }))
    await call(`/api/balance/${cur}/start`, { cookie, json: {} })
    await call(`/api/balance/${cur}/items`, { cookie, json: { side: 'asset', category: 'Equity', item: 'RMF', tier: 'Core', type: 'Fund', country: 'Global', thb: 1000 } })
    await call(`/api/balance/${cur}/close`, { cookie, json: {} })
    expect((await get(cookie)).tiers.map((t) => [t.tier, t.target])).toEqual([['Foundation', 0.2], ['Core', 0.5], ['Growth', 0.2], ['High Risk', 0.1]])
    expect((await put({ Foundation: 0.2, Core: 0.5, Growth: 0.2, 'High Risk': 0.2 })).status).toBe(400)
    expect((await put({ Foundation: 1.2, Core: -0.2, Growth: 0, 'High Risk': 0 })).status).toBe(400)
    expect((await put({ Foundation: 0.5, Core: 0.5, Growth: 0 })).status).toBe(400)
  })
})
