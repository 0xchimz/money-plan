import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Circle, CircleCheck, Ellipsis, EyeOff, Lock, Plus, Tags, Trash, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { CategoryIcon } from '@/components/category-icon'
import { DivergingList, NetWorthChart } from '@/components/charts'
import { Legend } from '@/components/chart-card'
import { Chips } from '@/components/chips'
import { PageState } from '@/components/layout'
import { MoneyInput } from '@/components/money-input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { api, TIERS, type Balance, type BalanceRow, type BalanceSide, type BalanceTransfers, type MonthStatus, type NewBalanceItem, type Tier } from '@/lib/api'
import { CATEGORY_TH } from '@/lib/categories'
import { money, pct, thb, thbCompact, thMonth } from '@/lib/format'
import { cn } from '@/lib/utils'
import { BALANCE_CATEGORIES, COUNTRIES, INVEST_TYPES, TIER_INFO, unusedChips } from '@shared/categories'

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))
const SIDE_TH: Record<BalanceSide, string> = { asset: 'สินทรัพย์', liability: 'หนี้สิน' }

type Group = { side: BalanceSide; category: string; rows: BalanceRow[] }

export function BalancePage() {
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState<Balance | null>(null)
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState<string | null>(null)
  const seq = useRef(0)
  const wanted = params.get('month')

  useEffect(() => {
    api.balance(wanted).then(setData, setError)
  }, [wanted])

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

  async function step(label: string, fn: () => Promise<unknown>) {
    setBusy(label)
    try { await fn() } finally { setBusy(null) }
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
  const efTarget = data.targets['Emergency Funds'] ?? null
  const unconfirmed = data.rows.filter((r) => !r.confirmed)
  const idx = data.months.findIndex((m) => m.month === month)
  const newer = data.months[idx - 1]?.month, older = data.months[idx + 1]?.month
  const canStartNext = data.next && idx === 0

  // what moved net worth: each category's change, debts counted against it
  const contrib = groups.map((g) => {
    const d = g.rows.reduce((s, r) => s + r.thb - (r.prev ?? 0), 0)
    return { label: g.category, value: g.side === 'asset' ? d : -d, sub: CATEGORY_TH[g.category] }
  }).filter((c) => Math.abs(c.value) >= 1).sort((a, b) => Math.abs(b.value) - Math.abs(a.value))

  const setEntry = (r: BalanceRow, v: number, expr: string | null) => {
    setData((d) => d && { ...d, rows: d.rows.map((x) => (x.id === r.id ? { ...x, thb: v, expr, confirmed: true } : x)) })
    return mutate(api.setEntry(month, r.id, v, expr))
  }
  const confirm = (ids: number[]) => {
    setData((d) => d && { ...d, rows: d.rows.map((x) => (ids.includes(x.id) ? { ...x, confirmed: true } : x)) })
    return mutate(api.confirmRows(month, ids))
  }

  const hist = data.history.map((h) => ({ month: h.month, label: thMonth(h.month).replace(/ 20(\d\d)$/, " '$1"), assets: h.assets, liabilities: h.liabilities, net: h.net, live: h.draft }))

  return (
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
        <div className="flex flex-wrap items-center gap-2">
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
          transfers={data.transfers ? { done: data.transfers.banks.filter((b) => b.doneAt).length, total: data.transfers.banks.length } : null}
          busy={busy}
          onClose={() => step('close', () => mutate(api.closeMonth(month), `ปิดเดือน ${thMonth(month)} แล้ว — Overview ใช้ตัวเลขเดือนนี้`))}
          onDiscard={() => step('discard', () => mutate(api.discardDraft(month), `ลบร่าง ${thMonth(month)} แล้ว`).then((ok) => ok && go('')))}
        />
      )}

      {/* Net worth + key tiles */}
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Card className="finance-hero xl:col-span-7">
          <CardContent className="flex h-full flex-col justify-between gap-6 py-2">
            <div className="flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">ความมั่งคั่งสุทธิ · Net worth</span>
              <span className="text-4xl font-semibold tracking-tight sm:text-6xl">{thb(net)}</span>
              {change != null && (
                <span className="flex flex-wrap items-center gap-x-2 text-sm">
                  <Change value={change} />
                  <span className="text-muted-foreground">{prevHist!.net && Math.abs(change) >= 0.005 ? `(${change >= 0 ? '+' : '−'}${pct(Math.abs(change / prevHist!.net))}) ` : ''}จาก {thMonth(data.prevMonth!)}</span>
                </span>
              )}
            </div>
            <AssetsVsDebts assets={assets} liabilities={liabilities} />
          </CardContent>
        </Card>
        <div className="grid gap-4 sm:grid-cols-2 xl:col-span-5 xl:grid-cols-1">
          <Card size="sm">
            <CardContent className="flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">พอร์ตลงทุน · Investments</span>
              <span className="text-2xl font-semibold tracking-tight">{thb(invest)}</span>
              <span className="text-sm text-muted-foreground">
                {investPrev ? <><Change value={invest - investPrev} compact /> จาก {thMonth(data.prevMonth!)} · </> : null}ไม่รวมบ้าน ประกัน และหนี้
              </span>
            </CardContent>
          </Card>
          {efTarget != null ? <EmergencyMeter value={ef} target={efTarget} /> : <EfHint />}
        </div>
      </section>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-12 xl:grid-rows-[auto_1fr]">
        {draft && data.transfers && (
          <TransferCard
            className="xl:col-span-4 xl:col-start-9 xl:row-start-1"
            t={data.transfers}
            onToggle={(bank, done) => {
              setData((d) => d && d.transfers && { ...d, transfers: { ...d.transfers, banks: d.transfers.banks.map((b) => (b.bank === bank ? { ...b, doneAt: done ? new Date().toISOString() : null } : b)) } })
              mutate(api.setTransfer(month, bank, done))
            }}
          />
        )}
        <div className="flex min-w-0 flex-col gap-8 xl:col-span-8 xl:col-start-1 xl:row-span-2 xl:row-start-1">
          {(['asset', 'liability'] as const).map((side) => {
            const gs = groups.filter((g) => g.side === side)
            const defs = BALANCE_CATEGORIES.filter((d) => d.side === side)
            // the usual categories in their fixed order, then any category the user made up
            const order = [...defs.map((d) => d.category), ...gs.map((g) => g.category).filter((c) => !defs.some((d) => d.category === c))]
            const total = side === 'asset' ? assets : liabilities
            const add = (item: NewBalanceItem) => mutate(api.addBalanceItem(month, item), `เพิ่ม ${item.item} แล้ว`)
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
                        onSet={setEntry} onConfirm={confirm}
                        onRemove={(r) => mutate(api.removeEntry(month, r.id), `ซ่อน ${r.item} แล้ว`)}
                        onClassify={(r, c) => mutate(api.classifyItem(month, r.id, c), `จัดกลุ่ม ${r.item} แล้ว`)}
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
          {contrib.length > 0 && data.prevMonth && (
            <Card>
              <CardHeader>
                <CardTitle>เดือนนี้เปลี่ยนเพราะอะไร</CardTitle>
                <CardDescription>ผลต่อความมั่งคั่งสุทธิ แยกหมวด เทียบ {thMonth(data.prevMonth)} · หนี้ลด = บวก</CardDescription>
              </CardHeader>
              <CardContent>
                <DivergingList rows={contrib} format={thbCompact} posLabel="เพิ่ม" negLabel="ลด" />
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>ความมั่งคั่ง {hist.length} เดือน</CardTitle>
              <CardDescription>ใหม่สุดอยู่ซ้าย{draft ? ' · * = ร่าง' : ''}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Legend items={[
                { label: 'สินทรัพย์', color: 'var(--chart-1)' },
                { label: 'หนี้สิน', color: 'var(--chart-2)' },
                { label: 'สุทธิ', color: 'var(--chart-3)', line: true },
              ]} />
              <NetWorthChart data={hist} />
            </CardContent>
          </Card>
          {draft && data.hidden.length > 0 && (
            <Card size="sm">
              <CardHeader>
                <CardTitle>รายการที่ซ่อนอยู่</CardTitle>
                <CardDescription>ไม่อยู่ในเดือนนี้ — กดเพื่อเอากลับมา</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col">
                  {data.hidden.map((h) => (
                    <li key={h.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                      <span className="min-w-0 truncate">{h.item} <span className="text-muted-foreground">· {h.category}</span></span>
                      <Button variant="ghost" size="xs" onClick={() => mutate(api.restoreEntry(month, h.id), `เอา ${h.item} กลับมาแล้ว`)}>
                        <Undo2 /> เอากลับ
                      </Button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: MonthStatus }) {
  if (status === 'draft') return <Badge variant="outline" className="gap-1.5"><span className="size-1.5 rounded-full bg-warning" aria-hidden />ร่าง</Badge>
  return <Badge variant="outline" className="gap-1"><Lock className="text-good" />ปิดเดือนแล้ว</Badge>
}

function Change({ value, compact }: { value: number; compact?: boolean }) {
  if (Math.abs(value) < 0.005) return <span className="text-muted-foreground">ไม่เปลี่ยน</span>
  const up = value > 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className={cn('tabular inline-flex items-center gap-0.5 font-medium', up ? 'text-good' : 'text-critical')}>
      <Icon className="size-4" aria-hidden />{up ? '+' : '−'}{compact ? thbCompact(Math.abs(value)) : thb(Math.abs(value))}
    </span>
  )
}

/** Assets and debts on one scale — how much of what I own is really mine */
function AssetsVsDebts({ assets, liabilities }: { assets: number; liabilities: number }) {
  const max = Math.max(assets, liabilities, 1)
  const rows = [
    { label: 'สินทรัพย์', value: assets, color: 'var(--chart-1)', sub: null },
    { label: 'หนี้สิน', value: liabilities, color: 'var(--chart-2)', sub: assets ? `${pct(liabilities / assets)} ของสินทรัพย์` : null },
  ]
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[4.5rem_1fr] items-center gap-3 text-sm">
          <span className="text-muted-foreground">{r.label}</span>
          <div className="flex min-w-0 items-center gap-3">
            <div className="h-3 rounded-r-[4px]" style={{ width: `${Math.max((r.value / max) * 62, 0.5)}%`, background: r.color }} role="img" aria-label={`${r.label} ${thb(r.value)}`} />
            <span className="tabular shrink-0 font-medium">{thbCompact(r.value)}</span>
            {r.sub && <span className="hidden shrink-0 text-muted-foreground sm:inline">{r.sub}</span>}
          </div>
        </li>
      ))}
    </ul>
  )
}

function EmergencyMeter({ value, target }: { value: number; target: number }) {
  const share = value / target
  const short = target - value
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-2">
        <span className="text-sm text-muted-foreground">เงินสำรองฉุกเฉิน · Emergency fund</span>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-2xl font-semibold tracking-tight">{thb(value)}</span>
          <span className="text-sm text-muted-foreground">เป้า {thb(target)}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full" style={{ background: 'color-mix(in oklch, var(--chart-1) 16%, transparent)' }}
          role="progressbar" aria-valuenow={Math.round(share * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="เงินสำรองฉุกเฉินเทียบเป้า">
          <div className="h-full rounded-full bg-chart-1" style={{ width: `${Math.min(share, 1) * 100}%` }} />
        </div>
        <span className="text-sm">
          {short > 0
            ? <><span className="font-medium">{pct(share)}</span> <span className="text-muted-foreground">· ขาดอีก {thb(short)}</span></>
            : <span className="inline-flex items-center gap-1 text-good"><CircleCheck className="size-4" aria-hidden />ครบเป้าแล้ว ({pct(share)})</span>}
        </span>
      </CardContent>
    </Card>
  )
}

/** A new user picks the month of their first balance sheet (this month or up to 11 before, Bangkok time) */
function StartCard({ months, busy, onStart }: { months: string[]; busy: boolean; onStart: (m: string) => void }) {
  const [month, setMonth] = useState(months[0] ?? '')
  return (
    <Card className="mx-auto mt-12 max-w-lg">
      <CardHeader>
        <CardTitle>ยังไม่มีงบดุล</CardTitle>
        <CardDescription>เลือกเดือนที่จะเริ่ม แล้วกรอกยอด ณ สิ้นเดือนนั้น</CardDescription>
      </CardHeader>
      <CardContent className="flex gap-2">
        <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="เดือนแรก"
          className="h-9 flex-1 rounded-lg border border-input bg-background px-2 text-sm text-foreground">
          {months.map((m) => <option key={m} value={m}>{thMonth(m, true)}</option>)}
        </select>
        <Button disabled={busy || !month} onClick={() => onStart(month)}><Plus /> เริ่มกรอกเดือนแรก</Button>
      </CardContent>
    </Card>
  )
}

/** Sticky checklist bar while a month is a draft: progress, close */
function DraftBar({ month, total, unconfirmed, transfers, busy, onClose, onDiscard }: {
  month: string
  total: number
  unconfirmed: number
  transfers: { done: number; total: number } | null
  busy: string | null
  onClose: () => void
  onDiscard: () => void
}) {
  const [asking, setAsking] = useState(false)
  const done = total - unconfirmed
  const untransferred = transfers ? transfers.total - transfers.done : 0
  const ready = unconfirmed === 0 && untransferred === 0
  const pending = [
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
          <Button size="sm" onClick={() => (ready ? onClose() : setAsking(true))} disabled={!!busy}>
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

/** No emergency-fund target until the ตกงาน plan has expenses */
function EfHint() {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">เงินสำรองฉุกเฉิน · Emergency fund</span>
        <span className="text-sm">ตั้งชุด "ตกงาน" ใน <Link to="/planning" className="underline underline-offset-2">Planning</Link> แล้วจะเห็นเป้า (6 เดือน × รายจ่าย)</span>
      </CardContent>
    </Card>
  )
}

/** Month-close checklist: how much of the salary goes to which bank (budget account column, bank/sub-account), ticked per bank */
function TransferCard({ t, onToggle, className }: { t: BalanceTransfers; onToggle: (bank: string, done: boolean) => void; className?: string }) {
  const total = t.banks.reduce((s, b) => s + b.thb, 0)
  const sent = t.banks.filter((b) => b.doneAt).reduce((s, b) => s + b.thb, 0)
  const done = t.banks.filter((b) => b.doneAt).length
  const copy = (v: number) => {
    navigator.clipboard?.writeText(v.toFixed(2)).then(() => toast.success(`คัดลอก ${money(v)} THB แล้ว`), () => toast.error('คัดลอกไม่ได้'))
  }
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>โอนเงินเดือนนี้</CardTitle>
        <CardDescription>จากงบชุดปัจจุบัน · ติ๊กเมื่อโอนแล้ว · กดยอดเพื่อคัดลอก</CardDescription>
        <CardAction><span className="tabular text-sm font-medium">{done} / {t.banks.length}</span></CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="flex flex-col gap-1">
          {t.banks.map((b) => {
            const plain = b.subs.length === 1 && !b.subs[0].sub
            return (
              <li key={b.bank} className={cn('rounded-xl px-2 py-2 transition-colors', b.doneAt && 'bg-muted/60')}>
                <div className="flex items-center gap-2.5">
                  <button type="button" role="checkbox" aria-checked={!!b.doneAt} aria-label={`โอนเข้า ${b.bank} แล้ว`} onClick={() => onToggle(b.bank, !b.doneAt)}
                    className="rounded-full text-muted-foreground/70 hover:text-foreground">
                    {b.doneAt ? <CircleCheck className="size-5 text-good" /> : <Circle className="size-5" />}
                  </button>
                  <span className={cn('flex-1 font-medium', b.doneAt && 'text-muted-foreground line-through decoration-muted-foreground/50')}>{b.bank}</span>
                  <button type="button" onClick={() => copy(b.thb)} title="คัดลอกยอด" className="tabular rounded-md px-1 font-semibold hover:bg-muted">
                    {money(b.thb)} <span className="text-xs font-normal text-muted-foreground">THB</span>
                  </button>
                </div>
                {plain
                  ? <p className="mt-0.5 ml-8 text-xs text-muted-foreground">{b.subs[0].items.join(', ')}</p>
                  : (
                    <ul className="mt-1 ml-8 flex flex-col gap-0.5 text-xs text-muted-foreground">
                      {b.subs.map((s) => (
                        <li key={s.sub ?? '-'} className="flex justify-between gap-3" title={[s.items.join(', '), ...s.notes].join(' · ')}>
                          <span className="truncate">{s.sub ?? 'บัญชีหลัก'}{s.notes.length ? <span className="text-muted-foreground/70"> · {s.notes.join(', ')}</span> : null}</span>
                          <button type="button" onClick={() => copy(s.thb)} className="tabular shrink-0 rounded px-0.5 hover:bg-muted hover:text-foreground">{money(s.thb)}</button>
                        </li>
                      ))}
                    </ul>
                  )}
              </li>
            )
          })}
        </ul>
        <div className="flex flex-col gap-1.5 border-t pt-3">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium">รวมต้องโอน</span>
            <span className="tabular font-semibold">{money(total)} THB</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round((sent / Math.max(total, 1)) * 100)} aria-valuemax={100} aria-label="โอนแล้ว">
            <div className="h-full rounded-full bg-good transition-[width]" style={{ width: `${(sent / Math.max(total, 1)) * 100}%` }} />
          </div>
          <span className="tabular text-xs text-muted-foreground">โอนแล้ว {money(sent)} THB · เหลือ {money(total - sent)} THB</span>
        </div>
        {(t.skipped.length > 0 || t.fromIncome.length > 0) && (
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t.skipped.length > 0 && <p>ไม่ต้องโอน (ไม่ได้ระบุบัญชีในงบ): {t.skipped.map((x) => `${x.item} ${money(x.thb)}`).join(' · ')}</p>}
            {t.fromIncome.map((x) => (
              <p key={x.item}>จ่ายจากรายรับ {x.source}{x.note ? ` (${x.note})` : ''}: {x.item} {money(x.thb)}</p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function CategoryCard({ group, chips, draft, prevMonth, target, onSet, onConfirm, onRemove, onClassify, onAdd }: {
  group: Group
  chips: string[]
  draft: boolean
  prevMonth: string | null
  target: number | null
  onSet: (r: BalanceRow, v: number, expr: string | null) => void
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
            onSet={onSet} onConfirm={onConfirm} onRemove={onRemove} onClassify={onClassify} />
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

function TargetBar({ value, target }: { value: number; target: number }) {
  const share = value / target
  return (
    <div className="flex w-full items-center gap-3 text-xs text-muted-foreground">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'color-mix(in oklch, var(--chart-1) 16%, transparent)' }}
        role="progressbar" aria-valuenow={Math.round(share * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="เทียบเป้า">
        <div className="h-full rounded-full bg-chart-1" style={{ width: `${Math.min(share, 1) * 100}%` }} />
      </div>
      <span className="tabular shrink-0">{pct(share)} ของเป้า {thbCompact(target)}</span>
    </div>
  )
}

const ROW_GRID = 'grid grid-cols-[1.75rem_minmax(0,1fr)_minmax(8rem,10rem)_1.75rem] items-center gap-x-2 md:grid-cols-[1.75rem_minmax(0,1fr)_7.5rem_minmax(9rem,10.5rem)_7rem_1.75rem]'

function RowItem({ row: r, draft, prevMonth, siblingsInvested, onSet, onConfirm, onRemove, onClassify }: {
  row: BalanceRow
  draft: boolean
  prevMonth: string | null
  siblingsInvested: boolean
  onSet: (r: BalanceRow, v: number, expr: string | null) => void
  onConfirm: (ids: number[]) => void
  onRemove: (r: BalanceRow) => void
  onClassify: (r: BalanceRow, c: Pick<NewBalanceItem, 'tier' | 'type' | 'country'>) => void
}) {
  const [classifying, setClassifying] = useState(false)
  const diff = r.prev != null ? r.thb - r.prev : null
  const good = diff != null && (r.side === 'asset' ? diff > 0 : diff < 0)
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
            {flagged && (
              <button type="button" className="inline-flex items-center gap-1 text-foreground underline decoration-dotted underline-offset-2" onClick={() => setClassifying(true)}>
                <span className="size-1.5 rounded-full bg-warning" aria-hidden />ไม่ได้นับในพอร์ต — จัดกลุ่ม
              </button>
            )}
            {diff != null && Math.abs(diff) >= 0.005 && <span className={cn('md:hidden', good ? 'text-good' : 'text-critical')}>{signedMoney(diff)}</span>}
          </span>
        </div>
        <span className="tabular hidden text-right text-xs text-muted-foreground md:block" title={prevMonth ? `ยอด ${thMonth(prevMonth)}` : undefined}>
          {r.prev != null ? money(r.prev) : '—'}
        </span>
        <MoneyInput value={r.thb} expr={r.expr} label={`ยอด ${r.item}`} onCommit={(v, e) => onSet(r, v, e)} onConfirm={() => !r.confirmed && onConfirm([r.id])} />
        <span className={cn('tabular hidden text-right text-xs md:block', diff == null || Math.abs(diff) < 0.005 ? 'text-muted-foreground' : good ? 'text-good' : 'text-critical')}>
          {diff == null ? 'ใหม่' : Math.abs(diff) < 0.005 ? '—' : signedMoney(diff)}
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

/** "Counts in the portfolio" switch, then tier (with a one-line meaning), type and country — all optional */
function InvestFields({ tier, type, country, onChange }: {
  tier: Tier | null
  type: string
  country: string
  onChange: (p: { tier?: Tier | null; type?: string; country?: string }) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={tier != null} onChange={(e) => onChange({ tier: e.target.checked ? 'Core' : null })} />
        นับเป็นพอร์ตลงทุน
      </label>
      {tier && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
            กลุ่ม
            <div className="inline-flex overflow-hidden rounded-lg border" role="radiogroup" aria-label="กลุ่มพอร์ต">
              {TIERS.map((t) => (
                <button key={t} type="button" role="radio" aria-checked={t === tier} onClick={() => onChange({ tier: t })}
                  className={cn('border-r px-2.5 py-1 text-xs last:border-r-0', t === tier ? 'bg-primary font-medium text-primary-foreground' : 'text-foreground hover:bg-muted')}>
                  {t}
                </button>
              ))}
            </div>
            <span>{tier} = {TIER_INFO[tier]}</span>
          </div>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            ประเภท
            <Input list="invest-types" value={type} onChange={(e) => onChange({ type: e.target.value })} className="w-32" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            ประเทศ
            <Input list="invest-countries" value={country} onChange={(e) => onChange({ country: e.target.value })} className="w-36" />
          </label>
          <datalist id="invest-types">{INVEST_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
          <datalist id="invest-countries">{COUNTRIES.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
      )}
    </div>
  )
}

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

/** Guess a new row's classification from its category neighbours */
function guess(rows: BalanceRow[], category: string) {
  const sib = rows.filter((r) => r.category === category && r.tier)
  const top = <K extends 'tier' | 'type' | 'country'>(k: K) => {
    const n = new Map<string, number>()
    for (const r of sib) if (r[k]) n.set(r[k]!, (n.get(r[k]!) ?? 0) + 1)
    return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  }
  return { tier: top('tier') as Tier | null, type: top('type') ?? 'Equity', country: top('country') ?? 'Thailand' }
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
  const [amount, setAmount] = useState<{ thb: number; expr: string | null } | null>(null)
  const [cls, setCls] = useState(() => guess(rows, fixed ?? ''))
  const ok = item.trim() && category.trim()
  const submit = () => ok && onAdd({
    side,
    category: category.trim(),
    item: item.trim(),
    ...(side === 'asset' ? cls : { tier: null, type: null, country: null }),
    ...(amount ? { thb: amount.thb, expr: amount.expr } : {}),
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
          ยอด (THB)
          <MoneyInput value={amount?.thb ?? null} expr={amount?.expr} label="ยอด" className="w-40 rounded-lg border border-input" onCommit={(thb, expr) => setAmount({ thb, expr })} />
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
