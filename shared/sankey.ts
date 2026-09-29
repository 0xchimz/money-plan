import { partOf, totals, type Part } from './planning'
import type { BudgetLineRow, SankeyLink, SankeyNode } from './types'

// Money coming in stays neutral; the three uses keep the Planning page colours; unallocated is baseline grey
export const FLOW_COLOR = {
  income: 'var(--muted-foreground)',
  expense: 'var(--chart-2)',
  saving: 'var(--chart-1)',
  invest: 'var(--chart-3)',
  left: 'var(--baseline)',
} as const

const GROUPS: { id: Part; label: string }[] = [
  { id: 'expense', label: 'รายจ่าย' },
  { id: 'saving', label: 'ออม' },
  { id: 'invest', label: 'ลงทุน' },
]

type Line = Pick<BudgetLineRow, 'id' | 'type' | 'category' | 'item' | 'thb'>
export interface MoneyFlow { nodes: SankeyNode[]; links: SankeyLink[]; income: number; left: number }

const sumOf = (ls: Line[]) => ls.reduce((s, l) => s + l.thb, 0)
const whole = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 0 })

/**
 * "Where the salary goes" for one scenario: each income line → total income → expense / saving / investing / unallocated
 * → expenses by category (note lists the lines), saving and investing by line. Null when the scenario has no income.
 */
export function moneyFlow(lines: Line[], categoryLabel: (c: string) => string = (c) => c): MoneyFlow | null {
  const live = lines.filter((l) => l.thb > 0)
  const t = totals(live)
  if (t.income <= 0) return null
  const share = (v: number) => `${Math.round((v / t.income) * 100)}% ของรายรับ`
  const nodes: SankeyNode[] = []
  const links: SankeyLink[] = []

  for (const l of live.filter((x) => x.type === 'Income')) {
    nodes.push({ id: `i:${l.id}`, label: l.item, column: 0, color: FLOW_COLOR.income })
    links.push({ source: `i:${l.id}`, target: 'income', value: l.thb })
  }
  nodes.push({ id: 'income', label: 'รายรับ', column: 1, color: FLOW_COLOR.income })

  for (const g of GROUPS) {
    const gl = live.filter((l) => partOf(l) === g.id)
    const total = sumOf(gl)
    if (!total) continue
    nodes.push({ id: `g:${g.id}`, label: g.label, column: 2, color: FLOW_COLOR[g.id], note: share(total) })
    links.push({ source: 'income', target: `g:${g.id}`, value: total })
    if (g.id === 'expense') {
      const cats = new Map<string, Line[]>()
      for (const l of gl) cats.set(l.category, [...(cats.get(l.category) ?? []), l])
      for (const [c, cl] of [...cats].sort((a, b) => sumOf(b[1]) - sumOf(a[1]))) {
        nodes.push({ id: `c:${c}`, label: categoryLabel(c), column: 3, color: FLOW_COLOR.expense, note: cl.map((l) => `${l.item} ${whole(l.thb)}`).join(' · ') })
        links.push({ source: 'g:expense', target: `c:${c}`, value: sumOf(cl) })
      }
    } else {
      for (const l of [...gl].sort((a, b) => b.thb - a.thb)) {
        nodes.push({ id: `l:${l.id}`, label: l.item, column: 3, color: FLOW_COLOR[g.id] })
        links.push({ source: `g:${g.id}`, target: `l:${l.id}`, value: l.thb })
      }
    }
  }
  // over-allocated plans get a warning on the page instead of a negative band
  if (t.left >= 0.5) {
    nodes.push({ id: 'left', label: 'ยังไม่จัดสรร', column: 2, color: FLOW_COLOR.left, note: share(t.left) })
    links.push({ source: 'income', target: 'left', value: t.left })
  }
  return { nodes, links, income: t.income, left: t.left }
}
