import { describe, expect, it } from 'vitest'
import { bangkokMonth } from '../shared/month'
import type { Overview } from '../shared/types'
import { call, login, ok, sql, uidOf } from './helpers'

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

  it('bounds history to latest 24 months', async () => {
    const { email, cookie } = await login()
    const uid = await uidOf(email)
    const now = new Date().toISOString()
    // Insert 26 closed months (2019-01 to 2021-02) with one asset item each
    for (let i = 1; i <= 26; i++) {
      const month = `${2019 + Math.floor((i - 1) / 12)}-${String(((i - 1) % 12) + 1).padStart(2, '0')}`
      await sql('INSERT INTO balance_months (user_id, month, status, updated_at) VALUES (?, ?, ?, ?)', uid, month, 'closed', now).run()
      await sql('INSERT INTO balance_items (user_id, side, category, item, tier, type, country) VALUES (?, ?, ?, ?, ?, ?, ?)',
        uid, 'asset', 'Cash', `item-${i}`, null, null, null).run()
      const itemId = (await sql('SELECT last_insert_rowid() AS id').first<{ id: number }>())!.id
      await sql('INSERT INTO balance_entries (user_id, month, item_id, thb, updated_at) VALUES (?, ?, ?, ?, ?)', uid, month, itemId, i, now).run()
    }
    const o = await get(cookie)
    expect(o.netHistory).toHaveLength(24)
    expect(o.netHistory[0].month).toBe('2021-02')
    expect(o.netHistory[23].month).toBe('2019-03')
    // Months 2019-01 and 2019-02 should not be in history
    expect(o.netHistory.map((h) => h.month)).not.toContain('2019-01')
    expect(o.netHistory.map((h) => h.month)).not.toContain('2019-02')
  })
})
