import type { MoneyFlow } from './sankey'

export interface FlowGroup {
  id: 'expense' | 'saving' | 'invest' | 'left'
  label: string
  thb: number
  share: number                                   // of total income
  color: string
  items: { label: string; thb: number; note?: string }[]
}

const ORDER = ['g:expense', 'g:saving', 'g:invest', 'left'] as const

/** The Sankey's numbers as a list for narrow screens: expense / saving / investing / unallocated (legend order), each with its children */
export function flowSummary(flow: MoneyFlow): FlowGroup[] {
  const node = new Map(flow.nodes.map((n) => [n.id, n]))
  return ORDER.flatMap((gid) => {
    const n = node.get(gid)
    const into = flow.links.find((l) => l.source === 'income' && l.target === gid)
    if (!n || !into) return []
    const items = flow.links.filter((l) => l.source === gid).map((l) => {
      const child = node.get(l.target)!
      return { label: child.label, thb: l.value, note: child.note }
    })
    return [{ id: gid.replace('g:', '') as FlowGroup['id'], label: n.label, thb: into.value, share: into.value / flow.income, color: n.color, items }]
  })
}
