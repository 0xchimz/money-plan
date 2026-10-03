import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { Overview } from '@/lib/api'
import { CATEGORY_TH } from '@/lib/categories'
import { pct, thb } from '@/lib/format'
import { cn } from '@/lib/utils'
import { flowSummary } from '@shared/flow-summary'
import type { MoneyFlow } from '@shared/sankey'

const th = (c: string) => CATEGORY_TH[c] ?? c

/** "Where the salary goes" on a phone: one stacked bar + the groups; tap a group for its categories / lines */
export function FlowBars({ flow }: { flow: MoneyFlow }) {
  const groups = flowSummary(flow)
  const [open, setOpen] = useState<string | null>(null)
  const barBase = Math.max(1, groups.reduce((s, g) => s + g.share, 0))
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded-md" role="img" aria-label={groups.map((g) => `${g.label} ${pct(g.share)}`).join(', ')}>
        {groups.map((g) => <div key={g.id} className="h-full" style={{ width: `${(g.share / barBase) * 100}%`, background: g.color }} />)}
      </div>
      <ul className="flex flex-col divide-y">
        {groups.map((g) => (
          <li key={g.id}>
            <button type="button" disabled={!g.items.length} aria-expanded={open === g.id} onClick={() => setOpen(open === g.id ? null : g.id)}
              className="flex min-h-11 w-full items-center gap-2.5 py-2 text-left text-sm">
              <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: g.color }} aria-hidden />
              <span className="flex-1">{g.label}</span>
              <span className="tabular text-xs text-muted-foreground">{pct(g.share, 0)}</span>
              <span className="tabular w-28 text-right font-medium">{thb(g.thb)}</span>
              {g.items.length
                ? <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open === g.id && 'rotate-180')} aria-hidden />
                : <span className="w-4 shrink-0" />}
            </button>
            {open === g.id && (
              <ul className="mb-2 ml-5 flex flex-col gap-1.5 text-sm">
                {g.items.map((i, n) => (
                  <li key={`${i.label}-${n}`} className="flex flex-col">
                    <span className="flex justify-between gap-3"><span className="truncate">{i.label}</span><span className="tabular shrink-0">{thb(i.thb)}</span></span>
                    {i.note && <span className="text-xs text-muted-foreground">{i.note}</span>}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Balance sheet as folding lists: assets open (top 3 categories, then "ดูทั้งหมด"), debts folded, net worth at the end */
export function BalanceSheetList({ o }: { o: Overview }) {
  return (
    <div className="flex flex-col divide-y">
      <Side title="สินทรัพย์" groups={o.balance.assets} total={o.totalAssets} defaultOpen />
      <Side title="หนี้สิน" groups={o.balance.liabilities} total={o.totalLiabilities} />
      <div className="flex min-h-12 items-center justify-between py-2">
        <span className="font-semibold">ความมั่งคั่งสุทธิ</span>
        <span className="tabular font-semibold">{thb(o.netWorth)}</span>
      </div>
    </div>
  )
}

function Side({ title, groups, total, defaultOpen = false }: { title: string; groups: Overview['balance']['assets']; total: number; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const [all, setAll] = useState(false)
  const [cat, setCat] = useState<string | null>(null)
  const shown = all ? groups : groups.slice(0, 3)
  return (
    <div>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-h-12 w-full items-center gap-2 py-2 text-left">
        <ChevronRight className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} aria-hidden />
        <span className="flex-1 font-semibold">{title}</span>
        <span className="tabular font-semibold">{thb(total)}</span>
      </button>
      {open && (
        <ul className="mb-2 ml-6 flex flex-col">
          {shown.map((g) => (
            <li key={g.category}>
              <button type="button" disabled={g.items.length < 2} aria-expanded={cat === g.category} onClick={() => setCat(cat === g.category ? null : g.category)}
                className="flex min-h-11 w-full items-center justify-between gap-3 py-1.5 text-left text-sm">
                <span className="truncate">{th(g.category)}{g.items.length > 1 && <span className="text-muted-foreground"> · {g.items.length}</span>}</span>
                <span className="tabular shrink-0">{thb(g.thb)}</span>
              </button>
              {cat === g.category && (
                <ul className="mb-1 ml-3 flex flex-col gap-1 text-sm text-muted-foreground">
                  {g.items.map((i) => <li key={i.item} className="flex justify-between gap-3"><span className="truncate">{i.item}</span><span className="tabular shrink-0">{thb(i.thb)}</span></li>)}
                </ul>
              )}
            </li>
          ))}
          {groups.length > 3 && !all && (
            <li><button type="button" onClick={() => setAll(true)} className="min-h-11 text-sm text-muted-foreground underline underline-offset-2">ดูทั้งหมด ({groups.length} หมวด)</button></li>
          )}
        </ul>
      )}
    </div>
  )
}
