import type { BudgetLineRow } from './types'

export type Part = 'expense' | 'saving' | 'invest'
type LineLike = Pick<BudgetLineRow, 'type' | 'category' | 'thb'>

export const partOf = (l: Pick<BudgetLineRow, 'type' | 'category'>): Part | null =>
  l.type === 'Expense' ? 'expense' : l.type === 'Saving' ? (l.category === 'Investment' ? 'invest' : 'saving') : null

export interface Totals { income: number; expense: number; saving: number; invest: number; left: number }

export function totals(lines: LineLike[]): Totals {
  const t = { income: 0, expense: 0, saving: 0, invest: 0 }
  for (const l of lines) {
    if (l.type === 'Income') t.income += l.thb
    else {
      const p = partOf(l)
      if (p) t[p] += l.thb
    }
  }
  return { ...t, left: t.income - t.expense - t.saving - t.invest }
}

/** Mortgage + instalments per month: the numerator of the debt-service ratio */
export const debtOf = (lines: LineLike[]) =>
  lines.filter((l) => l.type === 'Expense' && (l.category === 'Mortgage' || l.category === 'Debt')).reduce((s, l) => s + l.thb, 0)

export const EF_MONTHS = 6
export interface EfStatus { thb: number; target: number | null; months: number | null; netMonths: number | null }

/**
 * Emergency fund against the job-loss scenario: target = 6 × its expenses, months = fund ÷ expenses,
 * netMonths = fund ÷ (expenses − income that keeps coming, e.g. rent); null when that income covers the expenses.
 */
export function efStatus(thb: number, em: Totals | null): EfStatus {
  if (!em || em.expense <= 0) return { thb, target: null, months: null, netMonths: null }
  return {
    thb,
    target: EF_MONTHS * em.expense,
    months: thb / em.expense,
    netMonths: em.expense > em.income ? thb / (em.expense - em.income) : null,
  }
}
