import { describe, expect, it } from 'vitest'
import { debtOf, efStatus, partOf, totals } from '../shared/planning'
import type { BudgetType } from '../shared/types'

const L = (type: BudgetType, category: string, thb: number) => ({ type, category, thb })

describe('planning math', () => {
  it('splits saving from investing', () => {
    expect(partOf(L('Saving', 'Investment', 1))).toBe('invest')
    expect(partOf(L('Saving', 'Saving', 1))).toBe('saving')
    expect(partOf(L('Expense', 'Housing', 1))).toBe('expense')
    expect(partOf(L('Income', 'Salary', 1))).toBeNull()
  })

  it('totals a scenario', () => {
    const t = totals([L('Income', 'Salary', 60000), L('Income', 'Others', 5000), L('Saving', 'Saving', 8000), L('Saving', 'Investment', 10000), L('Expense', 'Housing', 41000)])
    expect(t).toEqual({ income: 65000, expense: 41000, saving: 8000, invest: 10000, left: 6000 })
  })

  it('lets left go negative when the plan spends more than the income', () => {
    expect(totals([L('Income', 'Salary', 10000), L('Expense', 'Housing', 12000)]).left).toBe(-2000)
  })

  it('counts only mortgage and instalments as debt', () => {
    expect(debtOf([L('Expense', 'Mortgage', 18000), L('Expense', 'Debt', 2000), L('Expense', 'Housing', 9000), L('Saving', 'Debt', 500)])).toBe(20000)
  })

  it('measures the emergency fund against the job-loss scenario', () => {
    expect(efStatus(90000, null)).toEqual({ thb: 90000, target: null, months: null, netMonths: null })
    expect(efStatus(90000, totals([L('Income', 'Rental', 0)]))).toEqual({ thb: 90000, target: null, months: null, netMonths: null })
    expect(efStatus(90000, totals([L('Expense', 'Housing', 30000)]))).toEqual({ thb: 90000, target: 180000, months: 3, netMonths: 3 })
    expect(efStatus(90000, totals([L('Expense', 'Housing', 30000), L('Income', 'Rental', 12000)]))).toEqual({ thb: 90000, target: 180000, months: 3, netMonths: 5 })
    expect(efStatus(90000, totals([L('Expense', 'Housing', 30000), L('Income', 'Rental', 30000)])).netMonths).toBeNull()
  })
})
