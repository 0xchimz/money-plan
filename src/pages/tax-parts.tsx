import { useState, type ReactNode } from 'react'
import { ChevronRight, CircleAlert, Trash } from 'lucide-react'
import { MoneyInput } from '@/components/money-input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { Tax, TaxLine, TaxLinkedInput } from '@/lib/api'
import { money, pct, thMonth } from '@/lib/format'
import { cn } from '@/lib/utils'
import { addMonth } from '@shared/month'
import type { Advice } from '@shared/tax'
import type { TaxSection } from '@shared/tax-rules'
import type { TaxRowView, TaxSectionView, TaxView } from '@shared/tax-view'

/** 2026 → 2569 */
export const be = (year: number) => year + 543
/** 2026-09 → ก.ย. */
export const mon = (ym: string) => thMonth(ym).split(' ')[0]
/** 2027-03 → มี.ค. 2570 */
export const monBE = (ym: string) => `${mon(ym)} ${be(Number(ym.slice(0, 4)))}`
export function monthsUntil(from: string, to: string) {
  const out: string[] = []
  for (let m = from; m <= to; m = addMonth(m, 1)) out.push(m)
  return out
}
/** The as-of month a first typed amount gets: last month, kept inside [January of the tax year, last]; January when the year has not started */
export function defaultAsOf(tax: Tax, last: string): string {
  const m = addMonth(tax.today, -1)
  return m < `${tax.year}-01` ? `${tax.year}-01` : m > last ? last : m
}
export const rowKey = (l: TaxLine) => (l.budget ? `b${l.budget.lineId}` : `t${l.id}`)

/** Where a row's year total comes from, in one line */
export function sourceText(r: TaxRowView) {
  const l = r.line
  if (!l.budget) return 'กรอกเอง'
  if (r.unset) return `ยังไม่ได้กรอกยอดที่จ่ายแล้ว · ใช้งบ ${money(l.budget.thb)} × 12`
  const parts = [`จ่ายแล้ว${l.asOf ? `ถึง ${mon(l.asOf)}` : ''} ${money(l.paid)}`]
  if (l.lump > 0) parts.push(`ก้อน ${money(l.lump)}`)
  if (r.months > 0) parts.push(`งบ ${money(l.budget.thb)} × ${r.months}`)
  return parts.join(' + ')
}

export interface TaxActions {
  saveLinked: (l: TaxLine, v: TaxLinkedInput) => Promise<boolean>
  saveTyped: (l: TaxLine, p: { label?: string; thb?: number; expr?: string | null }) => Promise<boolean>
  remove: (l: TaxLine) => void
  add: (v: { kind: string; label: string; thb: number; expr: string | null }) => Promise<boolean>
}

export function MonthSelect({ months, value, onChange, label, empty, className }: {
  months: string[]; value: string | null; onChange: (m: string | null) => void; label: string; empty?: string; className?: string
}) {
  return (
    <select aria-label={label} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}
      className={cn('h-9 rounded-lg border border-input bg-background px-2 text-sm max-lg:h-11 max-lg:text-base', className)}>
      {empty != null && <option value="">{empty}</option>}
      {months.map((m) => <option key={m} value={m}>{monBE(m)}</option>)}
    </select>
  )
}

const Badge = ({ children, tone }: { children: ReactNode; tone: 'link' | 'warn' }) => (
  <span className={cn('ml-1.5 inline-flex items-center rounded-md px-1.5 text-[11px] font-medium',
    tone === 'link' ? 'bg-chart-1/15 text-foreground' : 'bg-warning/15 text-warning')}>{children}</span>
)

/** One bracket per segment, as wide as the income taxed in it */
function BracketBar({ view }: { view: TaxView }) {
  const used = view.result.brackets.filter((b) => b.taxable > 0)
  if (!used.length) return null
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-4 overflow-hidden rounded-md" role="img"
        aria-label={`ภาษีขั้นบันได ${used.map((b) => `${pct(b.rate, 0)} ภาษี ${money(b.tax)}`).join(', ')}`}>
        {used.map((b, i) => (
          <div key={b.from} title={`${pct(b.rate, 0)} · เงินได้ ${money(b.taxable)} · ภาษี ${money(b.tax)}`}
            style={{ width: `${(b.taxable / view.result.net) * 100}%`, background: `color-mix(in oklch, var(--chart-1) ${Math.round(15 + (85 * i) / Math.max(1, used.length - 1))}%, var(--muted))` }} />
        ))}
      </div>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none py-1 max-lg:min-h-11 max-lg:content-center">ดูภาษีแต่ละขั้น</summary>
        <ul className="tabular mt-1 flex flex-col gap-0.5">
          {used.map((b) => <li key={b.from} className="flex justify-between gap-3"><span>{pct(b.rate, 0)} · เงินได้ {money(b.taxable)}</span><span>{money(b.tax)}</span></li>)}
        </ul>
      </details>
    </div>
  )
}

export function ResultCard({ view }: { view: TaxView }) {
  const r = view.result
  const refund = r.due < 0
  const Line = ({ label, value }: { label: string; value: string }) => (
    <div className="flex justify-between gap-3"><span className="text-muted-foreground">{label}</span><span>{value}</span></div>
  )
  return (
    <Card className="finance-hero">
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">{refund ? 'ได้ภาษีคืน' : 'ต้องจ่ายเพิ่มตอนยื่น'}</span>
          <span className={cn('tabular text-4xl font-semibold tracking-tight', refund && 'text-good')}>{money(Math.abs(r.due))}</span>
          <span className="text-sm text-muted-foreground">เงินได้สุทธิ <span className="tabular">{money(r.net)}</span> · อยู่ขั้น <b className="text-foreground">{pct(r.rate, 0)}</b></span>
        </div>
        <BracketBar view={view} />
        <div className="tabular flex flex-col gap-1 text-sm">
          <Line label="เงินได้ทั้งปี" value={money(r.income)} />
          <Line label="หักค่าใช้จ่าย" value={`−${money(r.expense)}`} />
          <Line label="ค่าลดหย่อน" value={`−${money(r.deductionTotal + r.donationTotal)}`} />
          <Line label="ภาษีทั้งปี" value={money(r.tax)} />
          {r.altTax > r.stepTax && <span className="text-xs text-muted-foreground">ใช้วิธีที่ 2 (0.5% ของเงินได้ที่ไม่ใช่เงินเดือน) เพราะสูงกว่าภาษีขั้นบันได {money(r.stepTax)}</span>}
          <Line label="หัก ณ ที่จ่ายแล้ว" value={`−${money(r.wht)}`} />
        </div>
      </CardContent>
    </Card>
  )
}

export function ReserveCard({ tax, view, onSave }: { tax: Tax; view: TaxView; onSave: (v: { thb: number; expr: string | null; asOf: string | null }) => void }) {
  const s = view.reserve, res = tax.reserve
  const filing = view.rules.filingMonth
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 text-sm">
        <span className="font-semibold">เงินสำรองภาษี</span>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">มีอยู่ ณ สิ้น</span>
          <MonthSelect months={monthsUntil(`${tax.year}-01`, filing)} value={res.asOf ?? defaultAsOf(tax, filing)} label="เงินสำรอง ณ สิ้นเดือน"
            onChange={(asOf) => onSave({ thb: res.thb, expr: res.expr, asOf })} />
          <MoneyInput value={res.thb} expr={res.expr} min={0} label="เงินสำรองภาษีที่มีอยู่"
            className="ml-auto w-36 rounded-lg border border-input max-lg:[&_input]:h-11 max-lg:[&_input]:text-base"
            onCommit={(thb, expr) => onSave({ thb, expr, asOf: res.asOf ?? defaultAsOf(tax, filing) })} />
        </div>
        {res.monthly > 0
          ? <div className="tabular flex justify-between gap-3 text-muted-foreground"><span>งบเงินสำรอง {money(res.monthly)} × {s.months} เดือน</span><span>{money(res.monthly * s.months)}</span></div>
          : <span className="text-xs text-muted-foreground">เลือก "เงินสำรองภาษี" ที่แถวงบในแผนเงิน เพื่อบวกยอดที่กันทุกเดือน</span>}
        <div className="tabular flex justify-between gap-3 border-t pt-2 font-medium"><span>มีถึงวันยื่น ({monBE(filing)})</span><span>{money(s.have)}</span></div>
        {s.need === 0
          ? <span className="text-muted-foreground">ไม่มีภาษีต้องจ่ายเพิ่ม</span>
          : s.short === 0
            ? <span className="tabular font-medium text-good">พอ เหลือ {money(s.have - s.need)}</span>
            : <span className="tabular font-medium text-critical">ขาด {money(s.short)}{s.perMonth != null && ` · กันเพิ่มเดือนละ ${money(s.perMonth)}`}</span>}
      </CardContent>
    </Card>
  )
}

export function AdviceCard({ view, onTry }: { view: TaxView; onTry?: (a: Advice) => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 text-sm">
        <span className="font-semibold">ลดภาษีได้อีก</span>
        {!view.advice.length && (
          <span className="text-muted-foreground">{view.result.tax > 0 ? 'ใช้ช่องลดหย่อนที่ระบบรู้จักครบแล้ว' : 'ยังไม่มีภาษีให้ลด — ใส่เงินได้ก่อน'}</span>
        )}
        {view.advice.map((a) => (
          <div key={a.kind} className="flex flex-col gap-0.5 rounded-xl border bg-card p-3">
            <span>{a.label} <span className="tabular text-muted-foreground">เหลือช่อง {money(a.room)}</span></span>
            <span className="tabular font-semibold text-good">ลดภาษีประมาณ {money(a.saving)}</span>
            <span className="text-xs text-muted-foreground">{a.note}{a.perMonth != null && ` · เฉลี่ยเดือนละ ${money(a.perMonth)} ใน ${view.monthsLeft} เดือนที่เหลือ`}</span>
            {onTry && <button type="button" onClick={() => onTry(a)} className="mt-1 self-start text-xs font-medium underline underline-offset-2 max-lg:min-h-11">ลองในฉากทัศน์</button>}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

/** Inline editor of a linked row: paid so far + as-of month, one-off, then what the plan still adds */
function LinkedEditor({ row, tax, onSave }: { row: TaxRowView; tax: Tax; onSave: (v: TaxLinkedInput) => void }) {
  const l = row.line
  const cur: TaxLinkedInput = { paid: l.paid, paidExpr: l.paidExpr, asOf: l.asOf, lump: l.lump, lumpExpr: l.lumpExpr }
  const last = `${tax.year}-12`
  const field = 'w-36 rounded-lg border border-input bg-background'
  return (
    <div className="grid grid-cols-[9.5rem_9rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 border-t border-border/70 bg-muted/40 px-4 py-3 text-sm">
      <span>จ่ายแล้วสะสม</span>
      <MoneyInput value={l.paid} expr={l.paidExpr} min={0} label={`จ่ายแล้วสะสม ${l.label}`} className={field}
        onCommit={(paid, paidExpr) => onSave({ ...cur, paid, paidExpr, asOf: paid > 0 ? (cur.asOf ?? defaultAsOf(tax, last)) : cur.asOf })} />
      <span className="flex items-center gap-2 text-muted-foreground">ถึงสิ้นเดือน
        <MonthSelect months={monthsUntil(`${tax.year}-01`, last)} value={l.asOf} label={`ยอดสะสมของ ${l.label} ถึงสิ้นเดือน`} empty="ยังไม่ได้จ่าย" onChange={(asOf) => onSave(asOf ? { ...cur, asOf } : { ...cur, asOf: null, paid: 0, paidExpr: null })} />
      </span>
      <span>ยอดก้อนที่จะมีเพิ่ม</span>
      <MoneyInput value={l.lump} expr={l.lumpExpr} min={0} label={`ยอดก้อน ${l.label}`} className={field} onCommit={(lump, lumpExpr) => onSave({ ...cur, lump, lumpExpr })} />
      <span className="text-xs text-muted-foreground">ยอดครั้งเดียวที่ไม่อยู่ในงบรายเดือน เช่น โบนัส หรือซื้อกองทุนเป็นก้อน</span>
      <span className="text-muted-foreground">จากงบที่เหลือ</span>
      <span className="tabular pr-2.5 text-right text-muted-foreground">{money(l.budget!.thb * row.months)}</span>
      <span className="tabular text-xs text-muted-foreground">{money(l.budget!.thb)} × {row.months} เดือน · แก้ที่หน้าแผนเงิน</span>
      <span className="border-t pt-2 font-semibold">ทั้งปี</span>
      <span className="tabular border-t pt-2 pr-2.5 text-right font-semibold">{money(row.annual)}</span>
      <span className="border-t pt-2 text-xs text-muted-foreground">เอารายการนี้ออก: เปลี่ยนเป็น "ภาษี: ไม่ใช้" ที่แถวงบในแผนเงิน</span>
    </div>
  )
}

function TypedEditor({ row, actions }: { row: TaxRowView; actions: TaxActions }) {
  const l = row.line
  const [label, setLabel] = useState(l.label)
  return (
    <div className="flex flex-wrap items-end gap-3 border-t border-border/70 bg-muted/40 px-4 py-3 text-sm">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        ชื่อรายการ
        <Input value={label} onChange={(e) => setLabel(e.target.value)} className="w-56"
          onBlur={() => { const v = label.trim(); if (v && v !== l.label) actions.saveTyped(l, { label: v }); else setLabel(l.label) }} />
      </label>
      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        ยอดทั้งปี
        <MoneyInput value={l.paid} expr={l.paidExpr} min={0} label={`ยอดทั้งปี ${l.label}`} className="w-36 rounded-lg border border-input bg-background"
          onCommit={(thb, expr) => actions.saveTyped(l, { thb, expr })} />
      </div>
      <Button type="button" variant="ghost" size="sm" className="ml-auto text-critical" onClick={() => actions.remove(l)}><Trash /> ลบรายการ</Button>
    </div>
  )
}

function AddLineForm({ sv, view, onAdd, onCancel }: { sv: TaxSectionView; view: TaxView; onAdd: TaxActions['add']; onCancel: () => void }) {
  const kinds = view.rules.kinds.filter((k) => k.section === sv.section && k.auto == null)
  const [v, setV] = useState({ kind: kinds[0]?.key ?? '', label: '', thb: 0, expr: null as string | null })
  return (
    <form className="flex flex-wrap items-end gap-3 px-4 py-3"
      onSubmit={async (e) => { e.preventDefault(); if (v.kind && (await onAdd({ ...v, label: v.label.trim() }))) onCancel() }}>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        ชนิด
        <select value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })} className="h-9 rounded-lg border border-input bg-background px-2 text-sm">
          {kinds.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        ชื่อ (ไม่บังคับ)
        <Input value={v.label} onChange={(e) => setV({ ...v, label: e.target.value })} placeholder="เช่น AIA 20 Pay Life" className="w-52" />
      </label>
      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        ยอดทั้งปี
        <MoneyInput value={v.thb} expr={v.expr} min={0} label="ยอดทั้งปี" className="w-36 rounded-lg border border-input" onCommit={(thb, expr) => setV((x) => ({ ...x, thb, expr }))} />
      </div>
      <div className="ml-auto flex gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>ยกเลิก</Button>
        <Button type="submit" size="sm" disabled={!v.kind}>เพิ่ม</Button>
      </div>
    </form>
  )
}

const ADD_LABEL: Partial<Record<TaxSection, string>> = { income: 'เพิ่มเงินได้', wht: 'เพิ่มภาษีที่ถูกหัก' }

/**
 * One section of the page (income, insurance, funds, …). Desktop: a row opens its editor inside the card.
 * Phone: pass onOpen / onNew and the page opens a sheet instead.
 */
export function TaxSectionCard({ sv, tax, view, actions, onOpen, onNew }: {
  sv: TaxSectionView; tax: Tax; view: TaxView; actions: TaxActions
  onOpen?: (row: TaxRowView) => void
  onNew?: (section: TaxSection) => void
}) {
  const [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  return (
    <Card className="gap-0 py-0">
      <div className="flex items-baseline justify-between gap-3 px-4 py-3">
        <span className="text-base font-semibold tracking-tight">{sv.title}</span>
        <span className="tabular text-base font-semibold">{money(sv.total)}</span>
      </div>
      <ul className="flex flex-col">
        {sv.auto.map((a) => (
          <li key={a.label} className="flex items-center justify-between gap-3 border-t border-border/70 px-4 py-2.5 text-sm">
            <span className="flex flex-col"><span>{a.label}</span><span className="text-xs text-muted-foreground">ได้เองทุกคน</span></span>
            <span className="tabular">{money(a.thb)}</span>
          </li>
        ))}
        {sv.rows.map((r) => {
          const key = rowKey(r.line)
          const isOpen = !onOpen && open === key
          return (
            <li key={key} className="border-t border-border/70">
              <button type="button" aria-expanded={onOpen ? undefined : isOpen} onClick={() => (onOpen ? onOpen(r) : setOpen(isOpen ? null : key))}
                className={cn('flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors hover:bg-muted/40', isOpen && 'bg-muted/40')}>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">
                    {r.line.label}
                    {r.line.label !== r.kind.label && <span className="ml-1.5 font-normal text-muted-foreground">{r.kind.label}</span>}
                    {r.line.budget && <Badge tone="link">งบ</Badge>}
                    {r.stale && <Badge tone="warn">ยอดสะสมยังเป็นของ {mon(r.line.asOf!)}</Badge>}
                  </span>
                  <span className="tabular truncate text-xs text-muted-foreground">{sourceText(r)}</span>
                </span>
                <span className="tabular shrink-0 font-medium">{money(r.annual)}</span>
                <ChevronRight className={cn('size-4 shrink-0 text-muted-foreground/60 transition-transform', isOpen && 'rotate-90')} aria-hidden />
              </button>
              {isOpen && (r.line.budget
                ? <LinkedEditor row={r} tax={tax} onSave={(v) => actions.saveLinked(r.line, v)} />
                : <TypedEditor key={key} row={r} actions={actions} />)}
            </li>
          )
        })}
      </ul>
      {sv.capped.map((c) => (
        <div key={c.label} className="tabular flex items-start gap-2 border-t border-border/70 px-4 py-2 text-xs text-warning">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>{c.label}: ใส่ {money(c.entered)} เกินเพดาน นับได้ {money(c.counted)}</span>
        </div>
      ))}
      <div className="border-t border-border/70">
        {adding && !onNew
          ? <AddLineForm sv={sv} view={view} onAdd={actions.add} onCancel={() => setAdding(false)} />
          : <button type="button" onClick={() => (onNew ? onNew(sv.section) : setAdding(true))} className="min-h-11 w-full px-4 py-2 text-left text-sm font-medium text-muted-foreground hover:text-foreground">
              + {ADD_LABEL[sv.section] ?? 'เพิ่มรายการ'}
            </button>}
      </div>
    </Card>
  )
}
