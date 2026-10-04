import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ChevronLeft, ChevronRight, Circle, CircleCheck, Ellipsis, EyeOff, Lock, Plus, Tags, Trash } from 'lucide-react'
import { toast } from 'sonner'
import { CategoryIcon } from '@/components/category-icon'
import { Chips } from '@/components/chips'
import { PageState } from '@/components/layout'
import { MoneyInput } from '@/components/money-input'
import { useIsMobile } from '@/lib/use-is-mobile'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { usePageRefresh } from '@/components/mobile/pull-to-refresh'
import { api, type Balance, type BalanceRow, type BalanceSide, type Currency, type FxQuote, type NewBalanceItem } from '@/lib/api'
import { CATEGORY_TH } from '@/lib/categories'
import { money, thb, thMonth } from '@/lib/format'
import { cn } from '@/lib/utils'
import { BALANCE_CATEGORIES, unusedChips } from '@shared/categories'
import { BalanceMobile } from './balance-mobile'
import {
  askRate, Change, ContribCard, CurrencyToggle, EfCard, errMsg, FxRate, FxRateContext, guess, guessCurrency,
  HiddenCard, HistoryCard, InvestCard, InvestFields, NetWorthCard, round2, SIDE_TH, StartCard, StatusBadge, TargetBar, TransferCard, type Group,
} from './balance-parts'

export function BalancePage() {
  const mobile = useIsMobile()
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState<Balance | null>(null)
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState<string | null>(null)
  const [ecb, setEcb] = useState<{ month: string; quote: FxQuote | null } | null>(null)
  const seq = useRef(0)
  const wanted = params.get('month')

  useEffect(() => {
    api.balance(wanted).then(setData, setError)
  }, [wanted])
  // reload the month on screen; an answer that arrives after a newer write is dropped, like mutate's
  usePageRefresh(() => { const n = ++seq.current; return api.balance(data?.month ?? wanted).then((d) => { if (n === seq.current) setData(d) }) })

  // ECB reference rate for the draft on screen, offered next to the month's own rate
  const shownMonth = data?.month ?? null, shownDraft = data?.status === 'draft'
  useEffect(() => {
    if (!shownMonth || !shownDraft) return
    let live = true
    api.ecbRate(shownMonth).then((quote) => live && setEcb({ month: shownMonth, quote }), () => {})
    return () => { live = false }
  }, [shownMonth, shownDraft])
  const quote = ecb?.month === shownMonth ? ecb.quote : null

  /** Every write answers with the fresh month; an answer that arrives after a newer write is dropped */
  async function mutate(call: Promise<Balance>, done?: string) {
    const n = ++seq.current
    try {
      const next = await call
      if (n === seq.current) setData(next)
      if (done) toast.success(done)
      return true
    } catch (e) {
      toast.error('บันทึกไม่ได้', { description: errMsg(e) })
      if (data?.month) api.balance(data.month).then((d) => n === seq.current && setData(d))
      return false
    }
  }

  async function step<T>(label: string, fn: () => Promise<T>): Promise<T> {
    setBusy(label)
    try { return await fn() } finally { setBusy(null) }
  }

  const groups = useMemo(() => {
    const out: Group[] = []
    for (const r of data?.rows ?? []) {
      const g = out.find((x) => x.side === r.side && x.category === r.category)
      if (g) g.rows.push(r)
      else out.push({ side: r.side, category: r.category, rows: [r] })
    }
    return out
  }, [data])

  if (!data) return <PageState error={error} />
  const month = data.month
  const go = (m: string) => setParams(m ? { month: m } : {})

  if (!month) {
    return <StartCard months={data.firstMonths} busy={!!busy} onStart={(m) => step('start', () => mutate(api.startMonth(m), `เริ่มงบดุล ${thMonth(m)} แล้ว`).then((ok) => ok && go(m)))} />
  }

  const draft = data.status === 'draft'
  const sum = (side: BalanceSide, key: 'thb' | 'prev' = 'thb') => data.rows.filter((r) => r.side === side).reduce((s, r) => s + (r[key] ?? 0), 0)
  const assets = sum('asset'), liabilities = sum('liability'), net = assets - liabilities
  const prevHist = data.history.find((h) => h.month === data.prevMonth)
  const change = prevHist ? net - prevHist.net : null
  const invest = data.rows.filter((r) => r.side === 'asset' && r.tier).reduce((s, r) => s + r.thb, 0)
  const investPrev = data.rows.filter((r) => r.side === 'asset' && r.tier).reduce((s, r) => s + (r.prev ?? 0), 0)
  const ef = data.rows.filter((r) => r.category === 'Emergency Funds').reduce((s, r) => s + r.thb, 0)
  const reload = () => { mutate(api.balance(month)) }
  const unconfirmed = data.rows.filter((r) => !r.confirmed)
  const usdRows = data.rows.filter((r) => r.usd != null).length
  const fxStale = draft && !data.fx.confirmed && data.fx.usdThb != null && usdRows > 0
  const idx = data.months.findIndex((m) => m.month === month)
  const newer = data.months[idx - 1]?.month, older = data.months[idx + 1]?.month
  const canStartNext = data.next && idx === 0

  // what moved net worth: each category's change, debts counted against it
  const contrib = groups.map((g) => {
    const d = g.rows.reduce((s, r) => s + r.thb - (r.prev ?? 0), 0)
    return { label: g.category, value: g.side === 'asset' ? d : -d, sub: CATEGORY_TH[g.category] }
  }).filter((c) => Math.abs(c.value) >= 1).sort((a, b) => Math.abs(b.value) - Math.abs(a.value))

  // a row keeps its currency when its amount is typed; the ฿/$ toggle is what switches it
  const setEntry = (r: BalanceRow, v: number, expr: string | null) => {
    const usd = r.usd != null
    setData((d) => d && { ...d, rows: d.rows.map((x) => (x.id === r.id ? { ...x, ...(usd ? { usd: v, thb: round2(v * (d.fx.usdThb ?? 0)) } : { thb: v }), expr, confirmed: true } : x)) })
    return mutate(api.setEntry(month, r.id, usd ? { usd: v } : { thb: v }, expr))
  }
  const setCurrency = (r: BalanceRow, c: Currency) => {
    const rate = data.fx.usdThb
    if (c === 'USD' && rate == null) return askRate()
    setData((d) => d && { ...d, rows: d.rows.map((x) => {
      if (x.id !== r.id) return x
      if (c === 'THB') return { ...x, usd: null, expr: null }
      const usd = Math.round((x.thb / rate!) * 1e6) / 1e6 // 6 decimals, like the server: ฿→$→฿ keeps the satang
      return { ...x, usd, thb: round2(usd * rate!), expr: null }
    }) })
    return mutate(api.setCurrency(month, r.id, c))
  }
  const setRate = (v: number) => {
    setData((d) => d && { ...d, fx: { ...d.fx, usdThb: v, confirmed: true }, rows: d.rows.map((x) => (x.usd != null ? { ...x, thb: round2(x.usd * v) } : x)) })
    return mutate(api.setRate(month, v))
  }
  const confirm = (ids: number[]) => {
    setData((d) => d && { ...d, rows: d.rows.map((x) => (ids.includes(x.id) ? { ...x, confirmed: true } : x)) })
    return mutate(api.confirmRows(month, ids))
  }

  const remove = (r: BalanceRow) => mutate(api.removeEntry(month, r.id), `ซ่อน ${r.item} แล้ว`)
  const restore = (h: Balance['hidden'][number]) => mutate(api.restoreEntry(month, h.id), `เอา ${h.item} กลับมาแล้ว`)
  const classify = (r: BalanceRow, c: Pick<NewBalanceItem, 'tier' | 'type' | 'country'>) => mutate(api.classifyItem(month, r.id, c), `จัดกลุ่ม ${r.item} แล้ว`)
  const add = (item: NewBalanceItem) => mutate(api.addBalanceItem(month, item), `เพิ่ม ${item.item} แล้ว`)
  const toggleTransfer = (bank: string, done: boolean) => {
    setData((d) => d && d.transfers && { ...d, transfers: { ...d.transfers, banks: d.transfers.banks.map((b) => (b.bank === bank ? { ...b, doneAt: done ? new Date().toISOString() : null } : b)) } })
    mutate(api.setTransfer(month, bank, done))
  }
  const startNext = () => step('start', () => mutate(api.startMonth(data.next!), `เริ่มร่าง ${thMonth(data.next!)} แล้ว`).then((ok) => ok && go(data.next!)))
  const closeMonth = () => step('close', () => mutate(api.closeMonth(month), `ปิดเดือน ${thMonth(month)} แล้ว — Overview ใช้ตัวเลขเดือนนี้`))
  const discard = () => step('discard', () => mutate(api.discardDraft(month), `ลบร่าง ${thMonth(month)} แล้ว`).then((ok) => { if (ok) go(''); return ok }))

  const hist = data.history.map((h) => ({ month: h.month, label: thMonth(h.month).replace(/ 20(\d\d)$/, " '$1"), assets: h.assets, liabilities: h.liabilities, net: h.net, live: h.draft }))

  if (mobile) {
    return (
      <FxRateContext value={data.fx.usdThb}>
        <BalanceMobile
          data={data} month={month} draft={draft} busy={busy} quote={quote} fxStale={fxStale} usdRows={usdRows}
          nav={{ newer, older, canStartNext: !!canStartNext, openDraft: data.months.find((m) => m.status === 'draft')?.month ?? null }}
          summary={{ net, change, prevNet: prevHist?.net ?? null, assets, liabilities, invest, investPrev, ef, contrib, hist }}
          actions={{ go, setEntry, setCurrency, setRate, confirm, remove, restore, classify, add, toggleTransfer, startNext, closeMonth, discard, reload }}
        />
      </FxRateContext>
    )
  }

  return (
    <FxRateContext value={data.fx.usdThb}>
    <div className="flex flex-col gap-6">
      {/* Month header */}
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">Balance Sheet · งบดุลส่วนตัว</span>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="icon" aria-label="เดือนก่อน" disabled={!older} onClick={() => older && go(older)}><ChevronLeft /></Button>
            <h1 className="min-w-44 text-center text-3xl font-semibold tracking-tight">{thMonth(month, true)}</h1>
            <Button variant="ghost" size="icon" aria-label="เดือนถัดไป" disabled={!newer} onClick={() => newer && go(newer)}><ChevronRight /></Button>
            <StatusBadge status={data.status!} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <FxRate fx={data.fx} draft={draft} stale={fxStale} prevMonth={data.prevMonth} quote={quote} usdRows={usdRows} onSet={setRate} />
          {canStartNext && (
            <Button onClick={() => step('start', () => mutate(api.startMonth(data.next!), `เริ่มร่าง ${thMonth(data.next!)} แล้ว`).then((ok) => ok && go(data.next!)))} disabled={!!busy}>
              <Plus /> เริ่มปิดบัญชี {thMonth(data.next!)}
            </Button>
          )}
          {!draft && !canStartNext && data.months.some((m) => m.status === 'draft') && (
            <Button variant="outline" onClick={() => go(data.months.find((m) => m.status === 'draft')!.month)}>ไปที่ร่างที่เปิดอยู่</Button>
          )}
        </div>
      </section>

      {draft && (
        <DraftBar
          month={month}
          total={data.rows.length}
          unconfirmed={unconfirmed.length}
          fxStale={fxStale}
          transfers={data.transfers ? { done: data.transfers.banks.filter((b) => b.doneAt).length, total: data.transfers.banks.length } : null}
          busy={busy}
          onClose={closeMonth}
          onDiscard={discard}
        />
      )}

      {/* Net worth + key tiles */}
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <NetWorthCard className="xl:col-span-7" net={net} change={change} prevNet={prevHist?.net ?? null} prevMonth={data.prevMonth} assets={assets} liabilities={liabilities} />
        <div className="grid gap-4 sm:grid-cols-2 xl:col-span-5 xl:grid-cols-1">
          <InvestCard invest={invest} investPrev={investPrev} prevMonth={data.prevMonth} />
          <EfCard value={ef} data={data} onSaved={reload} />
        </div>
      </section>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-12 xl:grid-rows-[auto_1fr]">
        {draft && data.transfers && (
          <TransferCard
            className="xl:col-span-4 xl:col-start-9 xl:row-start-1"
            t={data.transfers}
            onToggle={toggleTransfer}
          />
        )}
        <div className="flex min-w-0 flex-col gap-8 xl:col-span-8 xl:col-start-1 xl:row-span-2 xl:row-start-1">
          {(['asset', 'liability'] as const).map((side) => {
            const gs = groups.filter((g) => g.side === side)
            const defs = BALANCE_CATEGORIES.filter((d) => d.side === side)
            // the usual categories in their fixed order, then any category the user made up
            const order = [...defs.map((d) => d.category), ...gs.map((g) => g.category).filter((c) => !defs.some((d) => d.category === c))]
            const total = side === 'asset' ? assets : liabilities
            return (
              <section key={side} className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between px-1">
                  <h2 className="text-xl font-semibold tracking-tight">{SIDE_TH[side]}</h2>
                  <span className="tabular font-medium">{thb(total)}</span>
                </div>
                {order.map((cat) => {
                  const g = gs.find((x) => x.category === cat)
                  const chips = unusedChips(defs.find((d) => d.category === cat)?.chips ?? [], g?.rows.map((r) => r.item) ?? [])
                  return g
                    ? (
                      <CategoryCard key={`${month}:${cat}`} group={g} chips={chips} draft={draft} prevMonth={data.prevMonth} target={data.targets[cat] ?? null}
                        onSet={setEntry} onCurrency={setCurrency} onConfirm={confirm}
                        onRemove={remove}
                        onClassify={classify}
                        onAdd={add} />
                    )
                    : <EmptyCategory key={`${month}:${cat}`} side={side} category={cat} chips={chips} expanded={!data.hasClosed} rows={data.rows} onAdd={add} />
                })}
                <AddItem side={side} categories={order} rows={data.rows} onAdd={add} />
              </section>
            )
          })}
        </div>

        <aside className={cn('flex min-w-0 flex-col gap-6 xl:sticky xl:top-36 xl:col-span-4 xl:col-start-9', draft && data.transfers ? 'xl:row-start-2' : 'xl:row-start-1')}>
          {contrib.length > 0 && data.prevMonth && <ContribCard rows={contrib} prevMonth={data.prevMonth} />}
          <HistoryCard hist={hist} draft={draft} />
          {draft && data.hidden.length > 0 && <HiddenCard hidden={data.hidden} onRestore={restore} />}
        </aside>
      </div>
    </div>
    </FxRateContext>
  )
}




/** Sticky checklist bar while a month is a draft: progress, close */
function DraftBar({ month, total, unconfirmed, fxStale, transfers, busy, onClose, onDiscard }: {
  month: string
  total: number
  unconfirmed: number
  fxStale: boolean
  transfers: { done: number; total: number } | null
  busy: string | null
  onClose: () => void
  onDiscard: () => void
}) {
  const [asking, setAsking] = useState(false)
  const done = total - unconfirmed
  const untransferred = transfers ? transfers.total - transfers.done : 0
  const ready = unconfirmed === 0 && untransferred === 0 && !fxStale
  const empty = total === 0
  const pending = [
    fxStale && 'เรท USD/THB ยังเป็นของเดือนก่อน',
    unconfirmed && `${unconfirmed} รายการที่ยังใช้ยอดเดือนก่อน`,
    untransferred && `ยังไม่ได้ติ๊กโอนเงิน ${untransferred} บัญชี`,
  ].filter(Boolean)
  return (
    <div className="sticky top-16 z-[5] rounded-2xl border bg-card/90 p-4 shadow-[var(--card-shadow)] backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
            <span className="font-medium">ร่าง {thMonth(month)} · เช็กยอด {done} / {total}{transfers ? ` · โอนเงิน ${transfers.done} / ${transfers.total}` : ''}</span>
            <span className="text-muted-foreground">Overview ยังใช้เดือนก่อนจนกว่าจะปิดเดือน</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={done} aria-valuemax={total} aria-label="ความคืบหน้าการปิดเดือน">
            <div className="h-full rounded-full bg-good transition-[width]" style={{ width: `${(done / Math.max(total, 1)) * 100}%` }} />
          </div>
          <span className="text-xs text-muted-foreground">Enter = บันทึกแล้วไปช่องถัดไป · พิมพ์สูตรได้ เช่น 120000+5000</span>
        </div>
        <div className="flex items-center gap-2">
          {empty && <span className="text-xs text-muted-foreground">เพิ่มอย่างน้อย 1 รายการก่อนปิดเดือน</span>}
          <Button size="sm" onClick={() => (ready ? onClose() : setAsking(true))} disabled={!!busy || empty}>
            <Lock /> ปิดเดือน
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="ตัวเลือกร่าง" />}><Ellipsis /></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem variant="destructive" onClick={onDiscard}><Trash /> ลบร่างเดือนนี้</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {asking && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-muted/60 p-3 text-sm">
          <span>ยังมี {pending.join(' · ')} — ปิดเดือนเลยไหม?</span>
          <span className="flex shrink-0 gap-2">
            <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>กลับไปเช็ก</Button>
            <Button size="sm" onClick={() => { setAsking(false); onClose() }}>ปิดเดือนเลย</Button>
          </span>
        </div>
      )}
    </div>
  )
}



function CategoryCard({ group, chips, draft, prevMonth, target, onSet, onCurrency, onConfirm, onRemove, onClassify, onAdd }: {
  group: Group
  chips: string[]
  draft: boolean
  prevMonth: string | null
  target: number | null
  onSet: (r: BalanceRow, v: number, expr: string | null) => void
  onCurrency: (r: BalanceRow, c: Currency) => void
  onConfirm: (ids: number[]) => void
  onRemove: (r: BalanceRow) => void
  onClassify: (r: BalanceRow, c: Pick<NewBalanceItem, 'tier' | 'type' | 'country'>) => void
  onAdd: (item: NewBalanceItem) => void
}) {
  const [preset, setPreset] = useState<string | null>(null)
  const total = group.rows.reduce((s, r) => s + r.thb, 0)
  const prev = group.rows.reduce((s, r) => s + (r.prev ?? 0), 0)
  const open = group.rows.filter((r) => !r.confirmed)
  const invested = group.rows.some((r) => r.tier)
  const change = (group.side === 'asset' ? 1 : -1) * (total - prev)
  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-wrap items-center gap-3 border-b border-border/70 px-4 py-3.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-muted text-foreground" aria-hidden><CategoryIcon category={group.category} className="size-5" /></span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium">{CATEGORY_TH[group.category] ?? group.category}</span>
          <span className="text-xs text-muted-foreground">{group.category} · {group.rows.length} รายการ</span>
        </div>
        {draft && open.length > 1 && (
          <Button variant="ghost" size="xs" onClick={() => onConfirm(open.map((r) => r.id))} title="ยอดทุกบัญชีในหมวดนี้ไม่เปลี่ยน">
            <CircleCheck /> ยืนยันทั้งหมวด ({open.length})
          </Button>
        )}
        <div className="flex flex-col items-end">
          <span className="tabular font-semibold">{money(total)}</span>
          {prevMonth && <span className="text-xs"><Change value={change} compact /></span>}
        </div>
        {target != null && <TargetBar value={total} target={target} />}
      </div>
      <ul className="flex flex-col py-1">
        {group.rows.map((r) => (
          <RowItem key={r.id} row={r} draft={draft} prevMonth={prevMonth} siblingsInvested={invested}
            onSet={onSet} onCurrency={onCurrency} onConfirm={onConfirm} onRemove={onRemove} onClassify={onClassify} />
        ))}
      </ul>
      <div className="border-t px-2 py-1.5">
        {preset != null
          ? <AddItemForm side={group.side} category={group.category} initialItem={preset} rows={group.rows} onCancel={() => setPreset(null)} onAdd={(i) => { onAdd(i); setPreset(null) }} />
          : <Chips chips={chips} onPick={setPreset} className="px-2 py-1" />}
      </div>
    </Card>
  )
}

/** A usual category with nothing in it yet: open with chips until the first month is closed, a one-line button after that */
function EmptyCategory({ side, category, chips, expanded, rows, onAdd }: {
  side: BalanceSide
  category: string
  chips: string[]
  expanded: boolean
  rows: BalanceRow[]
  onAdd: (item: NewBalanceItem) => void
}) {
  const [open, setOpen] = useState(expanded)
  const [preset, setPreset] = useState<string | null>(null)
  if (!open) {
    return (
      <Button variant="ghost" size="sm" className="self-start text-muted-foreground" onClick={() => setOpen(true)}>
        <Plus /> เพิ่มใน {CATEGORY_TH[category] ?? category}
      </Button>
    )
  }
  return (
    <Card className="gap-0 py-0">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-muted text-muted-foreground" aria-hidden><CategoryIcon category={category} className="size-5" /></span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium">{CATEGORY_TH[category] ?? category}</span>
          <span className="text-xs text-muted-foreground">{category} · ยังไม่มีรายการ</span>
        </div>
        <span className="tabular text-muted-foreground">–</span>
      </div>
      <div className="border-t px-2 py-1.5">
        {preset != null
          ? <AddItemForm side={side} category={category} initialItem={preset} rows={rows} onCancel={() => setPreset(null)} onAdd={(i) => { onAdd(i); setPreset(null) }} />
          : <Chips chips={chips} onPick={setPreset} className="px-2 py-1" />}
      </div>
    </Card>
  )
}


const ROW_GRID = 'grid grid-cols-[1.75rem_minmax(0,1fr)_minmax(9rem,10.5rem)_1.75rem] items-center gap-x-2 md:grid-cols-[1.75rem_minmax(0,1fr)_7.5rem_minmax(11rem,12.5rem)_7rem_1.75rem]'

function RowItem({ row: r, draft, prevMonth, siblingsInvested, onSet, onCurrency, onConfirm, onRemove, onClassify }: {
  row: BalanceRow
  draft: boolean
  prevMonth: string | null
  siblingsInvested: boolean
  onSet: (r: BalanceRow, v: number, expr: string | null) => void
  onCurrency: (r: BalanceRow, c: Currency) => void
  onConfirm: (ids: number[]) => void
  onRemove: (r: BalanceRow) => void
  onClassify: (r: BalanceRow, c: Pick<NewBalanceItem, 'tier' | 'type' | 'country'>) => void
}) {
  const [classifying, setClassifying] = useState(false)
  // a USD row that was USD last month too is compared in USD (what is really held); otherwise in THB
  const inUsd = r.usd != null && r.prevUsd != null
  const diff = inUsd ? r.usd! - r.prevUsd! : r.prev != null ? r.thb - r.prev : null
  const good = diff != null && (r.side === 'asset' ? diff > 0 : diff < 0)
  // a USD row compared in THB says ฿, so its numbers never pass for dollars
  const signed = (v: number) => (inUsd || r.usd != null ? `${v >= 0 ? '+' : '−'}${inUsd ? '$' : '฿'}${money(Math.abs(v))}` : signedMoney(v))
  const prevText = r.prev == null ? '—' : inUsd ? `$${money(r.prevUsd!)}` : r.usd != null ? `฿${money(r.prev)}` : money(r.prev)
  const flagged = r.side === 'asset' && !r.tier && siblingsInvested
  return (
    <li className="group/row px-2">
      <div className={cn(ROW_GRID, 'rounded-lg px-1 py-1 transition-colors hover:bg-muted/40')}>
        <span className="flex justify-center">
          {draft && (r.confirmed
            ? <CircleCheck className="size-4.5 text-good" aria-label="เช็กแล้ว" />
            : (
              <button type="button" onClick={() => onConfirm([r.id])} className="rounded-full text-muted-foreground/60 hover:text-foreground" title="ยอดไม่เปลี่ยน — ยืนยัน" aria-label={`ยืนยัน ${r.item} ยอดไม่เปลี่ยน`}>
                <Circle className="size-4.5" />
              </button>
            ))}
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium" title={r.item}>{r.item}</span>
          <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            {r.tier && <span>{r.tier}{r.type ? ` · ${r.type}` : ''}</span>}
            {r.usd != null && <span className="tabular">≈ {money(r.thb)} THB</span>}
            {flagged && (
              <button type="button" className="inline-flex items-center gap-1 text-foreground underline decoration-dotted underline-offset-2" onClick={() => setClassifying(true)}>
                <span className="size-1.5 rounded-full bg-warning" aria-hidden />ไม่ได้นับในพอร์ต — จัดกลุ่ม
              </button>
            )}
            {diff != null && Math.abs(diff) >= 0.005 && <span className={cn('md:hidden', good ? 'text-good' : 'text-critical')}>{signed(diff)}</span>}
          </span>
        </div>
        <span className="tabular hidden text-right text-xs text-muted-foreground md:block"
          title={prevMonth ? `ยอด ${thMonth(prevMonth)}${inUsd ? ` = ${money(r.prev!)} THB` : ''}` : undefined}>
          {prevText}
        </span>
        <div className="flex min-w-0 items-center gap-1">
          <CurrencyToggle value={r.usd != null ? 'USD' : 'THB'} label={r.item} onChange={(c) => onCurrency(r, c)} />
          <MoneyInput value={r.usd ?? r.thb} expr={r.expr} label={`ยอด ${r.item}${r.usd != null ? ' (USD)' : ''}`} className="min-w-0 flex-1"
            onCommit={(v, e) => onSet(r, v, e)} onConfirm={() => !r.confirmed && onConfirm([r.id])} />
        </div>
        <span className={cn('tabular hidden text-right text-xs md:block', diff == null || Math.abs(diff) < 0.005 ? 'text-muted-foreground' : good ? 'text-good' : 'text-critical')}>
          {diff == null ? 'ใหม่' : Math.abs(diff) < 0.005 ? '—' : signed(diff)}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" className="opacity-60 group-hover/row:opacity-100 focus-visible:opacity-100" aria-label={`ตัวเลือก ${r.item}`} />}>
            <Ellipsis />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {r.side === 'asset' && <DropdownMenuItem onClick={() => setClassifying(true)}><Tags /> จัดกลุ่มการลงทุน</DropdownMenuItem>}
            {r.side === 'asset' && <DropdownMenuSeparator />}
            <DropdownMenuItem variant="destructive" onClick={() => onRemove(r)}><EyeOff /> ซ่อน (ไม่ยกไปเดือนหน้า)</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {classifying && <ClassifyForm row={r} onCancel={() => setClassifying(false)} onSave={(c) => { onClassify(r, c); setClassifying(false) }} />}
    </li>
  )
}

const signedMoney = (v: number) => `${v >= 0 ? '+' : '−'}${money(Math.abs(v))}`


function ClassifyForm({ row, onCancel, onSave }: { row: BalanceRow; onCancel: () => void; onSave: (c: Pick<NewBalanceItem, 'tier' | 'type' | 'country'>) => void }) {
  const [v, setV] = useState({ tier: row.tier, type: row.type ?? 'Equity', country: row.country ?? 'Thailand' })
  return (
    <div className="mb-2 ml-9 flex flex-wrap items-end gap-3 rounded-lg border border-dashed p-3 md:mr-9">
      <InvestFields tier={v.tier} type={v.type} country={v.country} onChange={(p) => setV((x) => ({ ...x, ...p }))} />
      <div className="ml-auto flex gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>ยกเลิก</Button>
        <Button size="sm" onClick={() => onSave(v)}>บันทึก</Button>
      </div>
    </div>
  )
}


function AddItemForm({ side, category: fixed, initialItem = '', rows, onAdd, onCancel }: {
  side: BalanceSide
  category?: string
  initialItem?: string
  rows: BalanceRow[]
  onAdd: (item: NewBalanceItem) => void
  onCancel: () => void
}) {
  const [category, setCategory] = useState(fixed ?? '')
  const [item, setItem] = useState(initialItem)
  const rate = useContext(FxRateContext)
  const [amount, setAmount] = useState<{ v: number; expr: string | null } | null>(null)
  const [cur, setCur] = useState<Currency>(() => guessCurrency(rows, fixed ?? '', rate))
  const [cls, setCls] = useState(() => guess(rows, fixed ?? ''))
  const ok = item.trim() && category.trim()
  const submit = () => ok && onAdd({
    side,
    category: category.trim(),
    item: item.trim(),
    ...(side === 'asset' ? cls : { tier: null, type: null, country: null }),
    ...(amount ? (cur === 'USD' ? { usd: amount.v, expr: amount.expr } : { thb: amount.v, expr: amount.expr }) : {}),
  })
  return (
    <form className="flex flex-col gap-3 p-2" onSubmit={(e) => { e.preventDefault(); submit() }}>
      <div className="flex flex-wrap items-end gap-3">
        {!fixed && (
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            หมวด
            <Input autoFocus value={category} onChange={(e) => { setCategory(e.target.value); setCls(guess(rows, e.target.value)) }} placeholder="เช่น Others" className="w-44" />
          </label>
        )}
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          ชื่อบัญชี / กองทุน
          <Input autoFocus={!!fixed && !initialItem} value={item} onChange={(e) => setItem(e.target.value)} placeholder="เช่น บัญชีออมทรัพย์ SCB" className="w-56" />
        </label>
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          ยอด ({cur})
          <div className="flex items-center gap-1">
            <CurrencyToggle value={cur} label="ยอด" onChange={(c) => {
              if (c === 'USD' && rate == null) return askRate()
              // a typed amount keeps its value: converted at the month's rate, not reread in the other currency
              if (amount && rate != null) setAmount({ v: round2(c === 'USD' ? amount.v / rate : amount.v * rate), expr: null })
              setCur(c)
            }} />
            <MoneyInput value={amount?.v ?? null} expr={amount?.expr} label={`ยอด (${cur})`} className="w-40 rounded-lg border border-input" onCommit={(v, expr) => setAmount({ v, expr })} />
          </div>
          {cur === 'USD' && amount && rate != null && <span className="tabular">≈ {money(round2(amount.v * rate))} THB</span>}
        </div>
      </div>
      {side === 'asset' && <InvestFields tier={cls.tier} type={cls.type} country={cls.country} onChange={(p) => setCls((x) => ({ ...x, ...p }))} />}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>ยกเลิก</Button>
        <Button type="submit" size="sm" disabled={!ok}>เพิ่ม</Button>
      </div>
    </form>
  )
}

function AddItem({ side, categories, rows, onAdd }: { side: BalanceSide; categories: string[]; rows: BalanceRow[]; onAdd: (item: NewBalanceItem) => void }) {
  const [open, setOpen] = useState(false)
  if (!open) {
    return (
      <Button variant="ghost" size="sm" className="self-start text-muted-foreground" onClick={() => setOpen(true)}>
        <Plus /> เพิ่มหมวดใหม่ใน{SIDE_TH[side]}
      </Button>
    )
  }
  return (
    <Card size="sm">
      <CardContent>
        <AddItemForm side={side} rows={rows} onCancel={() => setOpen(false)} onAdd={(i) => {
          if (categories.includes(i.category)) toast.message(`${i.category} มีอยู่แล้ว — เพิ่มเข้าไปในหมวดเดิม`)
          onAdd(i)
          setOpen(false)
        }} />
      </CardContent>
    </Card>
  )
}
