import { describe, expect, it } from 'vitest'
import { moneyFlow } from '../shared/sankey'
import type { BudgetType } from '../shared/types'

const L = (id: number, type: BudgetType, category: string, item: string, thb: number) => ({ id, type, category, item, thb })

describe('moneyFlow', () => {
  it('is null without income', () => {
    expect(moneyFlow([L(1, 'Expense', 'Housing', 'ค่าเช่า', 100)])).toBeNull()
  })

  it('runs income → total → expense / saving / investing / unallocated → categories and items', () => {
    const f = moneyFlow([
      L(1, 'Income', 'Salary', 'เงินเดือน', 60000), L(2, 'Income', 'Others', 'รายได้เสริม', 5000),
      L(3, 'Expense', 'Mortgage', 'ผ่อนคอนโด', 18000), L(4, 'Expense', 'Daily Living', 'อาหาร', 9000), L(5, 'Expense', 'Daily Living', 'เดินทาง', 3000),
      L(6, 'Saving', 'Saving', 'เงินออม', 8000), L(7, 'Saving', 'Investment', 'RMF', 10000), L(8, 'Expense', 'Travel', 'ทริป', 0),
    ], (c) => `TH:${c}`)!
    expect(f.income).toBe(65000)
    expect(f.left).toBe(17000)
    expect(f.nodes.filter((n) => n.column === 0).map((n) => n.label)).toEqual(['เงินเดือน', 'รายได้เสริม'])
    expect(f.nodes.filter((n) => n.column === 2).map((n) => [n.id, n.label])).toEqual([['g:expense', 'รายจ่าย'], ['g:saving', 'ออม'], ['g:invest', 'ลงทุน'], ['left', 'ยังไม่จัดสรร']])
    expect(f.nodes.filter((n) => n.column === 3).map((n) => n.label)).toEqual(['TH:Mortgage', 'TH:Daily Living', 'เงินออม', 'RMF'])
    const into = (id: string) => f.links.filter((l) => l.target === id).reduce((s, l) => s + l.value, 0)
    expect(into('income')).toBe(65000)
    expect(into('g:expense')).toBe(30000)
    expect(into('c:Daily Living')).toBe(12000)
    expect(into('left')).toBe(17000)
    expect(f.nodes.find((n) => n.id === 'c:Daily Living')!.note).toBe('อาหาร 9,000 · เดินทาง 3,000')
    expect(f.nodes.find((n) => n.id === 'g:expense')!.note).toBe('46% ของรายรับ')
    expect(f.links.every((l) => l.value > 0)).toBe(true)
  })

  it('has no unallocated node or negative band when over-allocated', () => {
    const f = moneyFlow([L(1, 'Income', 'Salary', 'เงินเดือน', 10000), L(2, 'Expense', 'Housing', 'ค่าเช่า', 12000)])!
    expect(f.left).toBe(-2000)
    expect(f.nodes.some((n) => n.id === 'left')).toBe(false)
    expect(f.links.every((l) => l.value > 0)).toBe(true)
  })
})
