import { createContext, useState } from 'react'
import { Link } from 'react-router'
import { ArrowDownRight, ArrowUpRight, Circle, CircleCheck, Lock, Plus, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { DivergingList, NetWorthChart } from '@/components/charts'
import { Legend } from '@/components/chart-card'
import { MoneyInput } from '@/components/money-input'
import { ScrollX } from '@/components/mobile/scroll-x'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { TIERS, type Balance, type BalanceRow, type BalanceSide, type BalanceTransfers, type Currency, type FxQuote, type MonthStatus, type Tier } from '@/lib/api'
import { decimal, money, pct, thb, thbCompact, thDay, thMonth } from '@/lib/format'
import { cn } from '@/lib/utils'
import { COUNTRIES, INVEST_TYPES, TIER_INFO } from '@shared/categories'

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))
export const SIDE_TH: Record<BalanceSide, string> = { asset: 'สินทรัพย์', liability: 'หนี้สิน' }

export type Group = { side: BalanceSide; category: string; rows: BalanceRow[] }

export const round2 = (v: number) => Math.round(v * 100) / 100
/** The month's USD/THB rate, for rows and add forms (null = not set, no USD rows possible) */
export const FxRateContext = createContext<number | null>(null)
/** USD was picked before the month has a rate: say so and put the cursor in the rate field */
export function askRate() {
  toast.error('ใส่เรท USD/THB ของเดือนนี้ก่อน', { description: 'ช่อง "เรทเดือนนี้" ด้านบน' })
  document.getElementById('fx-rate')?.focus()
}

export function StatusBadge({ status }: { status: MonthStatus }) {
  if (status === 'draft') return <Badge variant="outline" className="gap-1.5"><span className="size-1.5 rounded-full bg-warning" aria-hidden />ร่าง</Badge>
  return <Badge variant="outline" className="gap-1"><Lock className="text-good" />ปิดเดือนแล้ว</Badge>
}

export function Change({ value, compact }: { value: number; compact?: boolean }) {
  if (Math.abs(value) < 0.005) return <span className="text-muted-foreground">ไม่เปลี่ยน</span>
  const up = value > 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className={cn('tabular inline-flex items-center gap-0.5 font-medium', up ? 'text-good' : 'text-critical')}>
      <Icon className="size-4" aria-hidden />{up ? '+' : '−'}{compact ? thbCompact(Math.abs(value)) : thb(Math.abs(value))}
    </span>
  )
}

/** The month's USD/THB rate: every USD row is priced with it. A new month starts with last month's rate, flagged until it is typed or confirmed (Enter). */
export function FxRate({ fx, draft, stale, prevMonth, quote, usdRows, onSet }: {
  fx: Balance['fx']
  draft: boolean
  stale: boolean
  prevMonth: string | null
  quote: FxQuote | null
  usdRows: number
  onSet: (v: number) => void
}) {
  const offer = draft && quote && (fx.usdThb == null || Math.abs(quote.rate - fx.usdThb) >= 0.00005) ? quote : null
  return (
    <div className="flex flex-col items-start gap-1 lg:items-end">
      <div className="flex items-center gap-2 text-sm">
        <label htmlFor="fx-rate" className="text-muted-foreground">เรทเดือนนี้</label>
        <div className={cn('flex h-9 items-center rounded-lg border bg-card pl-2.5', stale && 'border-warning')}
          title={usdRows ? `ใช้คิดเป็นบาทกับ ${usdRows} รายการที่เป็น USD` : 'ยังไม่มีรายการที่เป็น USD'}>
          <span className="shrink-0 text-muted-foreground">1 USD =</span>
          <MoneyInput id="fx-rate" digits={4} min={0.0001} value={fx.usdThb} label="เรท USD/THB ของเดือนนี้" placeholder="ใส่เรท" className="w-24"
            onCommit={(v) => onSet(v)} onConfirm={() => stale && onSet(fx.usdThb!)} />
          <span className="shrink-0 pr-2.5 text-muted-foreground">THB</span>
        </div>
      </div>
      {(stale || offer) && (
        <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
          {stale && (
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-warning" aria-hidden />ยังใช้เรท {prevMonth ? thMonth(prevMonth) : 'เดือนก่อน'} — แก้ หรือกด Enter ยืนยัน
            </span>
          )}
          {offer && (
            <button type="button" onClick={() => onSet(offer.rate)} title="อัตราอ้างอิง ECB (ค่ากลาง) — เรทธนาคาร / exchange อาจต่างเล็กน้อย"
              className="rounded underline decoration-dotted underline-offset-2 hover:text-foreground">
              ECB {thDay(offer.date)}: {decimal(offer.rate, 4)} · ใช้เรทนี้
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** ฿ / $ switch in front of a money field */
export function CurrencyToggle({ value, label, onChange }: { value: Currency; label: string; onChange: (c: Currency) => void }) {
  return (
    <div role="radiogroup" aria-label={`สกุลเงิน ${label}`} className="inline-flex shrink-0 overflow-hidden rounded-md border text-xs leading-none font-semibold">
      {(['THB', 'USD'] as const).map((c) => (
        <button key={c} type="button" role="radio" aria-checked={c === value} title={c} onClick={() => c !== value && onChange(c)}
          className={cn('px-1.5 py-1', c === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
          {c === 'THB' ? '฿' : '$'}
        </button>
      ))}
    </div>
  )
}

/** Assets and debts on one scale — how much of what I own is really mine */
export function AssetsVsDebts({ assets, liabilities }: { assets: number; liabilities: number }) {
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

export function EmergencyMeter({ value, target }: { value: number; target: number }) {
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
export function StartCard({ months, busy, onStart }: { months: string[]; busy: boolean; onStart: (m: string) => void }) {
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

/** No emergency-fund target until the ตกงาน plan has expenses */
export function EfHint() {
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
/** Month-close transfers: per bank (from the plan's account column), tick when sent, tap an amount to copy it */
export function TransferList({ t, onToggle }: { t: BalanceTransfers; onToggle: (bank: string, done: boolean) => void }) {
  const total = t.banks.reduce((s, b) => s + b.thb, 0)
  const sent = t.banks.filter((b) => b.doneAt).reduce((s, b) => s + b.thb, 0)
  const copy = (v: number) => {
    navigator.clipboard?.writeText(v.toFixed(2)).then(() => toast.success(`คัดลอก ${money(v)} THB แล้ว`), () => toast.error('คัดลอกไม่ได้'))
  }
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-1">
        {t.banks.map((b) => {
          const plain = b.subs.length === 1 && !b.subs[0].sub
          return (
            <li key={b.bank} className={cn('rounded-xl px-2 py-2 transition-colors', b.doneAt && 'bg-muted/60')}>
              <div className="flex items-center gap-2.5">
                <button type="button" role="checkbox" aria-checked={!!b.doneAt} aria-label={`โอนเข้า ${b.bank} แล้ว`} onClick={() => onToggle(b.bank, !b.doneAt)}
                  className="grid place-items-center rounded-full max-lg:min-h-11 max-lg:min-w-11 text-muted-foreground/70 hover:text-foreground">
                  {b.doneAt ? <CircleCheck className="size-5 text-good" /> : <Circle className="size-5" />}
                </button>
                <span className={cn('flex-1 font-medium', b.doneAt && 'text-muted-foreground line-through decoration-muted-foreground/50')}>{b.bank}</span>
                <button type="button" onClick={() => copy(b.thb)} title="คัดลอกยอด" className="tabular rounded-md px-1 font-semibold hover:bg-muted max-lg:min-h-11 max-lg:px-3">
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
                        <button type="button" onClick={() => copy(s.thb)} className="tabular shrink-0 rounded px-0.5 hover:bg-muted hover:text-foreground max-lg:min-h-11 max-lg:px-3">{money(s.thb)}</button>
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
    </div>
  )
}

export function TransferCard({ t, onToggle, className }: { t: BalanceTransfers; onToggle: (bank: string, done: boolean) => void; className?: string }) {
  const done = t.banks.filter((b) => b.doneAt).length
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>โอนเงินเดือนนี้</CardTitle>
        <CardDescription>จากงบชุดปัจจุบัน · ติ๊กเมื่อโอนแล้ว · กดยอดเพื่อคัดลอก</CardDescription>
        <CardAction><span className="tabular text-sm font-medium">{done} / {t.banks.length}</span></CardAction>
      </CardHeader>
      <CardContent><TransferList t={t} onToggle={onToggle} /></CardContent>
    </Card>
  )
}

export function TargetBar({ value, target }: { value: number; target: number }) {
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

/** "Counts in the portfolio" switch, then tier (with a one-line meaning), type and country — all optional */
export function InvestFields({ tier, type, country, onChange }: {
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
                  className={cn('border-r px-2.5 py-1 text-xs last:border-r-0 max-lg:min-h-11', t === tier ? 'bg-primary font-medium text-primary-foreground' : 'text-foreground hover:bg-muted')}>
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

/** Guess a new row's classification from its category neighbours */
export function guess(rows: BalanceRow[], category: string) {
  const sib = rows.filter((r) => r.category === category && r.tier)
  const top = <K extends 'tier' | 'type' | 'country'>(k: K) => {
    const n = new Map<string, number>()
    for (const r of sib) if (r[k]) n.set(r[k]!, (n.get(r[k]!) ?? 0) + 1)
    return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  }
  return { tier: top('tier') as Tier | null, type: top('type') ?? 'Equity', country: top('country') ?? 'Thailand' }
}
/** USD when most of the category already is (and the month has a rate) */
export function guessCurrency(rows: BalanceRow[], category: string, rate: number | null): Currency {
  const sib = rows.filter((r) => r.category === category)
  return rate != null && sib.filter((r) => r.usd != null).length * 2 > sib.length ? 'USD' : 'THB'
}
export function NetWorthCard({ net, change, prevNet, prevMonth, assets, liabilities, className }: {
  net: number; change: number | null; prevNet: number | null; prevMonth: string | null; assets: number; liabilities: number; className?: string
}) {
  return (
    <Card className={cn('finance-hero', className)}>
      <CardContent className="flex h-full flex-col justify-between gap-6 py-2">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">ความมั่งคั่งสุทธิ · Net worth</span>
          <span className="text-4xl font-semibold tracking-tight sm:text-6xl">{thb(net)}</span>
          {change != null && (
            <span className="flex flex-wrap items-center gap-x-2 text-sm">
              <Change value={change} />
              <span className="text-muted-foreground">{prevNet && Math.abs(change) >= 0.005 ? `(${change >= 0 ? '+' : '−'}${pct(Math.abs(change / prevNet))}) ` : ''}จาก {thMonth(prevMonth!)}</span>
            </span>
          )}
        </div>
        <AssetsVsDebts assets={assets} liabilities={liabilities} />
      </CardContent>
    </Card>
  )
}

export function InvestCard({ invest, investPrev, prevMonth }: { invest: number; investPrev: number; prevMonth: string | null }) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">พอร์ตลงทุน · Investments</span>
        <span className="text-2xl font-semibold tracking-tight">{thb(invest)}</span>
        <span className="text-sm text-muted-foreground">
          {investPrev ? <><Change value={invest - investPrev} compact /> จาก {thMonth(prevMonth!)} · </> : null}ไม่รวมบ้าน ประกัน และหนี้
        </span>
      </CardContent>
    </Card>
  )
}

export function ContribCard({ rows, prevMonth }: { rows: { label: string; value: number; sub?: string }[]; prevMonth: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>เดือนนี้เปลี่ยนเพราะอะไร</CardTitle>
        <CardDescription>ผลต่อความมั่งคั่งสุทธิ แยกหมวด เทียบ {thMonth(prevMonth)} · หนี้ลด = บวก</CardDescription>
      </CardHeader>
      <CardContent><DivergingList rows={rows} format={thbCompact} posLabel="เพิ่ม" negLabel="ลด" /></CardContent>
    </Card>
  )
}

export function HistoryCard({ hist, draft }: { hist: { month: string; label: string; assets: number; liabilities: number; net: number; live: boolean }[]; draft: boolean }) {
  return (
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
        <ScrollX count={hist.length}><NetWorthChart data={hist} /></ScrollX>
      </CardContent>
    </Card>
  )
}

export function HiddenCard({ hidden, onRestore }: { hidden: Balance['hidden']; onRestore: (h: Balance['hidden'][number]) => void }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>รายการที่ซ่อนอยู่</CardTitle>
        <CardDescription>ไม่อยู่ในเดือนนี้ — กดเพื่อเอากลับมา</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col">
          {hidden.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
              <span className="min-w-0 truncate">{h.item} <span className="text-muted-foreground">· {h.category}</span></span>
              <Button variant="ghost" size="xs" className="max-lg:h-11" onClick={() => onRestore(h)}><Undo2 /> เอากลับ</Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
