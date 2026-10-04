import { describe, expect, it } from 'vitest'
import { bangkokMonth } from '../shared/month'
import type { Balance, EfTarget, Planning } from '../shared/types'
import { call, login, ok } from './helpers'

const cur = bangkokMonth()
const planning = (cookie: string) => ok<Planning>(call('/api/planning', { cookie }))
const balance = (cookie: string) => ok<Balance>(call('/api/balance', { cookie }))
const put = (cookie: string, json: unknown) => call('/api/ef-target', { method: 'PUT', cookie, json })
const emExpense = (cookie: string, thb: number) =>
  call('/api/planning/em/lines', { cookie, json: { type: 'Expense', category: 'Housing', item: 'ค่าเช่า', thb, expr: null, account: null } })

describe('emergency fund target', () => {
  it('starts as 6 months × the ตกงาน plan', async () => {
    const { cookie } = await login()
    const def: EfTarget = { mode: 'plan', months: 6, monthly: null, expr: null }
    expect((await planning(cookie)).efTarget).toEqual(def)
    const b = await balance(cookie)
    expect(b.efTarget).toEqual(def)
    expect(b.emExpense).toBe(0)
    expect(b.targets).toEqual({})
  })

  it('changes the number of months of the ตกงาน plan', async () => {
    const { cookie } = await login()
    await emExpense(cookie, 30000)
    await call(`/api/balance/${cur}/start`, { cookie, json: {} })
    expect(await ok<EfTarget>(put(cookie, { mode: 'plan', months: 12 }))).toEqual({ mode: 'plan', months: 12, monthly: null, expr: null })
    const b = await balance(cookie)
    expect(b.targets).toEqual({ 'Emergency Funds': 360000 })
    expect(b.emExpense).toBe(30000)
    expect((await planning(cookie)).efTarget.months).toBe(12)
  })

  it('takes a typed monthly amount, with or without a ตกงาน plan', async () => {
    const { cookie } = await login()
    const saved = await ok<EfTarget>(put(cookie, { mode: 'custom', months: 6, monthly: 90000.004, expr: '73529.85+16470.15' }))
    expect(saved).toEqual({ mode: 'custom', months: 6, monthly: 90000, expr: '73529.85+16470.15' })
    expect((await balance(cookie)).targets).toEqual({ 'Emergency Funds': 540000 })
    await emExpense(cookie, 30000)
    expect((await balance(cookie)).targets).toEqual({ 'Emergency Funds': 540000 })
  })

  it('keeps the typed amount when switching back to the plan', async () => {
    const { cookie } = await login()
    await emExpense(cookie, 30000)
    await put(cookie, { mode: 'custom', months: 6, monthly: 90000, expr: null })
    expect(await ok<EfTarget>(put(cookie, { mode: 'plan', months: 3 }))).toEqual({ mode: 'plan', months: 3, monthly: 90000, expr: null })
    expect((await balance(cookie)).targets).toEqual({ 'Emergency Funds': 90000 })
  })

  it.each([
    ['an unknown mode', { mode: 'fixed', months: 6 }],
    ['no mode', { months: 6 }],
    ['zero months', { mode: 'plan', months: 0 }],
    ['too many months', { mode: 'plan', months: 61 }],
    ['half a month', { mode: 'plan', months: 1.5 }],
    ['months as text', { mode: 'plan', months: '6' }],
    ['a typed target without an amount', { mode: 'custom', months: 6 }],
    ['a typed amount of zero', { mode: 'custom', months: 6, monthly: 0 }],
    ['a negative typed amount', { mode: 'custom', months: 6, monthly: -1 }],
    ['a typed amount as text', { mode: 'custom', months: 6, monthly: '90000' }],
  ])('rejects %s', async (_, json) => {
    const { cookie } = await login()
    const res = await put(cookie, json)
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toEqual(expect.any(String))
    expect((await planning(cookie)).efTarget).toEqual({ mode: 'plan', months: 6, monthly: null, expr: null })
  })

  it('is each user\'s own', async () => {
    const a = await login()
    const b = await login()
    await put(a.cookie, { mode: 'custom', months: 9, monthly: 50000, expr: null })
    expect((await planning(b.cookie)).efTarget).toEqual({ mode: 'plan', months: 6, monthly: null, expr: null })
    expect((await call('/api/ef-target', { method: 'PUT', json: { mode: 'plan', months: 6 } })).status).toBe(401)
  })
})
