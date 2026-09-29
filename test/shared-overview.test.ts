import { describe, expect, it } from 'vitest'
import { buildOverview, type OverviewEntry } from '../shared/overview'

const E = (month: string, side: 'asset' | 'liability', category: string, item: string, thb: number, tier: OverviewEntry['tier'] = null): OverviewEntry =>
  ({ month, side, category, item, thb, tier, type: tier ? 'Fund' : null, country: tier ? 'Global' : null })
const checklist = { planning: true, balanceStarted: true }
const targets = { Foundation: 0.1, Core: 0.4, Growth: 0.35, 'High Risk': 0.15 }

describe('buildOverview', () => {
  it('shows the checklist before any closed month', () => {
    const o = buildOverview({ closedMonths: [], entries: [], targets, checklist: { planning: false, balanceStarted: true } })
    expect(o.month).toBeNull()
    expect(o.checklist).toEqual({ planning: false, balanceStarted: true, closed: false })
  })

  it('has no comparison with a single month', () => {
    const o = buildOverview({ closedMonths: ['2026-09'], entries: [E('2026-09', 'asset', 'Cash', 'SCB', 1000)], targets, checklist })
    expect(o).toMatchObject({ month: '2026-09', netWorth: 1000, prev: null, contributions: [] })
    expect(o.netHistory).toHaveLength(1)
  })

  it('aggregates the latest month and compares it with the one before', () => {
    const o = buildOverview({
      closedMonths: ['2026-08', '2026-09'],
      entries: [
        E('2026-08', 'asset', 'Cash', 'SCB', 100000), E('2026-08', 'asset', 'PVD', 'PVD', 300000, 'Foundation'),
        E('2026-08', 'liability', 'Mortgage', 'บ้าน', 1_000_000), E('2026-08', 'asset', 'Real Estate', 'บ้าน', 2_000_000),
        E('2026-09', 'asset', 'Cash', 'SCB', 90000), E('2026-09', 'asset', 'PVD', 'PVD', 310000, 'Foundation'),
        E('2026-09', 'asset', 'Equity', 'RMF', 100000, 'Core'), E('2026-09', 'asset', 'Equity', 'RMF-zero', 0, 'Growth'),
        E('2026-09', 'asset', 'Emergency Funds', 'EF', 50000),
        E('2026-09', 'liability', 'Mortgage', 'บ้าน', 990_000), E('2026-09', 'asset', 'Real Estate', 'บ้าน', 2_000_000),
      ],
      targets,
      checklist,
    })
    expect(o.month).toBe('2026-09')
    expect(o.totalAssets).toBe(2_550_000)
    expect(o.totalLiabilities).toBe(990_000)
    expect(o.netWorth).toBe(1_560_000)
    expect(o.prev).toEqual({ month: '2026-08', netWorth: 1_400_000 })
    expect(o.netHistory.map((h) => [h.month, h.label, h.net])).toEqual([['2026-09', "ก.ย. '26", 1_560_000], ['2026-08', "ส.ค. '26", 1_400_000]])
    // biggest change first; equal sizes keep the order categories appear in the latest month
    expect(o.contributions).toEqual([
      { label: 'Equity', value: 100000 }, { label: 'Emergency Funds', value: 50000 },
      { label: 'Cash', value: -10000 }, { label: 'PVD', value: 10000 }, { label: 'Mortgage', value: 10000 },
    ])
    expect(o.investments.map((i) => [i.symbol, i.tier, i.thb])).toEqual([['PVD', 'Foundation', 310000], ['RMF', 'Core', 100000]])
    expect(o.investTotal).toBe(410000)
    const core = o.tiers.find((t) => t.tier === 'Core')!
    expect(core.pct).toBeCloseTo(100000 / 410000)
    expect(core.gap).toBeCloseTo(0.4 * 410000 - 100000)
    expect(o.ef).toBe(50000)
    expect(o.balance.assets[0]).toEqual({ category: 'Real Estate', thb: 2_000_000, items: [{ item: 'บ้าน', thb: 2_000_000 }] })
    expect(o.categoryHistory[0].values).toEqual({ Cash: 90000, PVD: 310000, Equity: 100000, 'Emergency Funds': 50000, 'Real Estate': 2_000_000 })
  })
})
