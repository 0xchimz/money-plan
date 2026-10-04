import type { BudgetLineRow, EfTarget } from './types'

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
export const EF_MONTHS_MAX = 60
export const DEFAULT_EF_TARGET: EfTarget = { mode: 'plan', months: EF_MONTHS, monthly: null, expr: null }
export interface EfStatus { thb: number; target: number | null; months: number | null; netMonths: number | null }

/** The monthly amount the target multiplies: the job-loss scenario's expenses, or the typed one; null when there is none yet */
export function efMonthly(em: Totals | null, t: EfTarget = DEFAULT_EF_TARGET): number | null {
  const v = t.mode === 'custom' ? t.monthly : em?.expense
  return v != null && v > 0 ? v : null
}

/**
 * Emergency fund against its target: target = months × the monthly amount, months = fund ÷ that amount.
 * With the job-loss scenario, netMonths = fund ÷ (expenses − income that keeps coming, e.g. rent); null when that
 * income covers the expenses, and for a typed amount.
 */
export function efStatus(thb: number, em: Totals | null, t: EfTarget = DEFAULT_EF_TARGET): EfStatus {
  const monthly = efMonthly(em, t)
  if (monthly == null) return { thb, target: null, months: null, netMonths: null }
  return {
    thb,
    target: t.months * monthly,
    months: thb / monthly,
    netMonths: t.mode === 'plan' && em && em.expense > em.income ? thb / (em.expense - em.income) : null,
  }
}
