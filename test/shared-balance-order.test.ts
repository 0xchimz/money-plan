import { describe, expect, it } from 'vitest'
import { categoryOrder, nextUnconfirmed, pageOrder } from '../shared/balance-order'
import type { BalanceSide } from '../shared/types'

const R = (id: number, side: BalanceSide, category: string, confirmed = false) => ({ id, side, category, confirmed })

describe('balance page order', () => {
  const rows = [
    R(1, 'liability', 'Mortgage'), R(2, 'asset', 'Crypto'), R(3, 'asset', 'Cash'), R(4, 'asset', 'My Watches'),
    R(5, 'asset', 'Cash'), R(6, 'asset', 'Art'), R(7, 'liability', 'Family Loan'),
  ]

  it('lists the usual categories in their fixed order, then made-up ones as first seen', () => {
    const assets = categoryOrder(rows, 'asset')
    expect(assets.slice(0, 2)).toEqual(['Cash', 'Emergency Funds'])
    expect(assets.indexOf('Equity')).toBeLessThan(assets.indexOf('Crypto'))
    expect(assets.slice(-2)).toEqual(['My Watches', 'Art'])
    expect(categoryOrder(rows, 'liability').at(-1)).toBe('Family Loan')
  })

  it('puts assets before liabilities and keeps row order inside a category', () => {
    expect(pageOrder(rows).map((r) => r.id)).toEqual([3, 5, 2, 4, 6, 1, 7])
  })
})

describe('nextUnconfirmed', () => {
  // page order: Cash 3, 4 · Equity 5 · Crypto 2 · Mortgage 1
  const rows = [R(1, 'liability', 'Mortgage'), R(2, 'asset', 'Crypto', true), R(3, 'asset', 'Cash'), R(4, 'asset', 'Cash', true), R(5, 'asset', 'Equity')]

  it('goes to the next unchecked row in page order, skipping checked ones', () => {
    expect(nextUnconfirmed(rows, 3)).toBe(5)
    expect(nextUnconfirmed(rows, 5)).toBe(1)
  })

  it('wraps to the top after the last row', () => {
    expect(nextUnconfirmed(rows, 1)).toBe(3)
  })

  it('starts from the top without a current row, and when the current row is gone', () => {
    expect(nextUnconfirmed(rows, null)).toBe(3)
    expect(nextUnconfirmed(rows, 99)).toBe(3)
  })

  it('never returns the current row; null when nothing else is unchecked', () => {
    expect(nextUnconfirmed([R(1, 'asset', 'Cash'), R(2, 'asset', 'Cash', true)], 1)).toBeNull()
    expect(nextUnconfirmed([R(2, 'asset', 'Cash', true)], null)).toBeNull()
  })
})
