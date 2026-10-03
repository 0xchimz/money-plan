import { describe, expect, it } from 'vitest'
import { flowSummary } from '../shared/flow-summary'
import { moneyFlow } from '../shared/sankey'
import type { BudgetType } from '../shared/types'

const L = (id: number, type: BudgetType, category: string, item: string, thb: number) => ({ id, type, category, item, thb })

describe('flowSummary', () => {
  it('lists expense / saving / investing / unallocated with the Sankey numbers', () => {
    const f = moneyFlow([
      L(1, 'Income', 'Salary', 'เงินเดือน', 60000), L(2, 'Income', 'Others', 'รายได้เสริม', 5000),
      L(3, 'Expense', 'Mortgage', 'ผ่อนคอนโด', 18000), L(4, 'Expense', 'Daily Living', 'อาหาร', 9000), L(5, 'Expense', 'Daily Living', 'เดินทาง', 3000),
      L(6, 'Saving', 'Saving', 'เงินออม', 8000), L(7, 'Saving', 'Investment', 'RMF', 10000), L(8, 'Saving', 'Investment', 'PVD', 4000),
    ], (c) => `TH:${c}`)!
    const g = flowSummary(f)
    expect(g.map((x) => [x.id, x.thb])).toEqual([['expense', 30000], ['saving', 8000], ['invest', 14000], ['left', 13000]])
    expect(g[0].items).toEqual([
      { label: 'TH:Mortgage', thb: 18000, note: 'ผ่อนคอนโด 18,000' },
      { label: 'TH:Daily Living', thb: 12000, note: 'อาหาร 9,000 · เดินทาง 3,000' },
    ])
    expect(g[2].items.map((i) => [i.label, i.thb])).toEqual([['RMF', 10000], ['PVD', 4000]])
    expect(g[3].items).toEqual([])
    expect(g.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1)
  })

  it('has no unallocated group when the plan spends more than the income (over-allocated)', () => {
    const f = moneyFlow([L(1, 'Income', 'Salary', 'เงินเดือน', 10000), L(2, 'Expense', 'Housing', 'ค่าเช่า', 12000)])!
    expect(flowSummary(f).map((x) => x.id)).toEqual(['expense'])
    expect(f.left).toBe(-2000)
  })
})
