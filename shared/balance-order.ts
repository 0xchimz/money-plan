import { BALANCE_CATEGORIES } from './categories'
import type { BalanceRow, BalanceSide } from './types'

type Placed = Pick<BalanceRow, 'id' | 'side' | 'category'>

export const SIDES: BalanceSide[] = ['asset', 'liability']

/** Categories of one side as the Balance page lists them: the usual ones in their fixed order, then any the user made up (first seen first) */
export function categoryOrder(rows: Pick<BalanceRow, 'side' | 'category'>[], side: BalanceSide): string[] {
  const usual = BALANCE_CATEGORIES.filter((d) => d.side === side).map((d) => d.category)
  const own: string[] = []
  for (const r of rows) if (r.side === side && !usual.includes(r.category) && !own.includes(r.category)) own.push(r.category)
  return [...usual, ...own]
}

/** Rows in page order: assets then liabilities, categories as above, rows keep their order inside a category */
export function pageOrder<T extends Placed>(rows: T[]): T[] {
  return SIDES.flatMap((side) => categoryOrder(rows, side).flatMap((c) => rows.filter((r) => r.side === side && r.category === c)))
}

/** The next row still to check after `currentId` in page order, wrapping to the top; null when no other row is left */
export function nextUnconfirmed<T extends Placed & Pick<BalanceRow, 'confirmed'>>(rows: T[], currentId: number | null): number | null {
  const order = pageOrder(rows)
  const at = currentId == null ? -1 : order.findIndex((r) => r.id === currentId)
  const after = [...order.slice(at + 1), ...order.slice(0, Math.max(at, 0))]
  return after.find((r) => !r.confirmed && r.id !== currentId)?.id ?? null
}
