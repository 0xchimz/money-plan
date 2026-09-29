import { monthLabel } from './month'
import { TIERS, type BalanceGroup, type BalanceSide, type Overview, type Tier } from './types'

export interface OverviewEntry {
  month: string
  side: BalanceSide
  category: string
  item: string
  tier: Tier | null
  type: string | null
  country: string | null
  thb: number
}
export interface OverviewInput {
  closedMonths: string[]
  entries: OverviewEntry[]                       // rows of closed months only
  targets: Partial<Record<Tier, number>>
  checklist: { planning: boolean; balanceStarted: boolean }
}

const HISTORY = 24
const sum = (xs: { thb: number }[]) => xs.reduce((s, x) => s + x.thb, 0)

function groups(rows: OverviewEntry[], side: BalanceSide): BalanceGroup[] {
  const cats = new Map<string, BalanceGroup>()
  for (const r of rows.filter((x) => x.side === side && x.thb !== 0)) {
    const g = cats.get(r.category) ?? { category: r.category, thb: 0, items: [] }
    g.thb += r.thb
    g.items.push({ item: r.item, thb: r.thb })
    cats.set(r.category, g)
  }
  return [...cats.values()].map((g) => ({ ...g, items: g.items.sort((a, b) => b.thb - a.thb) })).sort((a, b) => b.thb - a.thb)
}

/** What moved net worth since the previous closed month, per category; a debt going down counts as a gain */
function contributionsOf(latest: OverviewEntry[], before: OverviewEntry[]) {
  const d = new Map<string, { label: string; value: number }>()
  const add = (r: OverviewEntry, sign: number) => {
    const k = `${r.side}|${r.category}`
    const c = d.get(k) ?? { label: r.category, value: 0 }
    c.value += sign * (r.side === 'asset' ? r.thb : -r.thb)
    d.set(k, c)
  }
  for (const r of latest) add(r, 1)
  for (const r of before) add(r, -1)
  return [...d.values()].filter((c) => Math.abs(c.value) >= 1).sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
}

export function buildOverview(input: OverviewInput): Overview {
  const months = [...new Set(input.closedMonths)].sort((a, b) => b.localeCompare(a)).slice(0, HISTORY) // newest first
  const checklist = { ...input.checklist, closed: months.length > 0 }
  if (!months.length) {
    return { checklist, month: null, netWorth: 0, totalAssets: 0, totalLiabilities: 0, prev: null, netHistory: [], balance: { assets: [], liabilities: [] },
      categoryHistory: [], contributions: [], investTotal: 0, tiers: [], investments: [], ef: 0 }
  }
  const byMonth = new Map(months.map((m) => [m, input.entries.filter((e) => e.month === m)]))
  const latest = months[0]
  const rows = byMonth.get(latest)!
  const assets = groups(rows, 'asset')
  const liabilities = groups(rows, 'liability')
  const totalAssets = sum(assets)
  const totalLiabilities = sum(liabilities)

  const netHistory = months.map((m) => {
    const r = byMonth.get(m)!
    const a = sum(r.filter((x) => x.side === 'asset'))
    const l = sum(r.filter((x) => x.side === 'liability'))
    return { month: m, label: monthLabel(m), assets: a, liabilities: l, net: a - l, live: false }
  })
  const categoryHistory = months.map((m) => {
    const values: Record<string, number> = {}
    for (const r of byMonth.get(m)!.filter((x) => x.side === 'asset')) values[r.category] = (values[r.category] ?? 0) + r.thb
    return { month: m, label: monthLabel(m), live: false, values }
  })
  const prevMonth = months[1] ?? null

  const investments = rows.filter((r) => r.side === 'asset' && r.tier && r.thb > 0)
    .map((r) => ({ symbol: r.item, tier: r.tier!, type: r.type ?? 'Cash', country: r.country ?? 'Thailand', thb: r.thb }))
    .sort((a, b) => b.thb - a.thb)
  const investTotal = sum(investments)
  const tiers = TIERS.map((tier) => {
    const thb = sum(investments.filter((x) => x.tier === tier))
    const target = input.targets[tier] ?? 0
    return { tier, thb, pct: investTotal ? thb / investTotal : 0, target, gap: target * investTotal - thb }
  })

  return {
    checklist,
    month: latest,
    netWorth: totalAssets - totalLiabilities,
    totalAssets,
    totalLiabilities,
    prev: prevMonth ? { month: prevMonth, netWorth: netHistory[1].net } : null,
    netHistory,
    balance: { assets, liabilities },
    categoryHistory,
    contributions: prevMonth ? contributionsOf(rows, byMonth.get(prevMonth)!) : [],
    investTotal,
    tiers,
    investments,
    ef: sum(rows.filter((r) => r.side === 'asset' && r.category === 'Emergency Funds')),
  }
}
