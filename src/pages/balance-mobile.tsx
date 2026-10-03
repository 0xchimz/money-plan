import { useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Circle, CircleAlert, CircleCheck, Lock, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { CategoryIcon } from '@/components/category-icon'
import { Chips } from '@/components/chips'
import { AmountField, readAmount } from '@/components/mobile/amount-field'
import { TopBarSlot } from '@/components/mobile/shell'
import { Sheet } from '@/components/mobile/sheet'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { Balance, BalanceRow, BalanceSide, Currency, FxQuote, NewBalanceItem } from '@/lib/api'
import { CATEGORY_TH } from '@/lib/categories'
import { decimal, money, thb, thDay, thMonth } from '@/lib/format'
import { cn } from '@/lib/utils'
import { categoryOrder, nextUnconfirmed, pageOrder, SIDES } from '@shared/balance-order'
import { BALANCE_CATEGORIES, unusedChips } from '@shared/categories'
import {
  Change, ContribCard, EfHint, EmergencyMeter, guess, guessCurrency, HiddenCard, HistoryCard, InvestCard, InvestFields,
  NetWorthCard, round2, SIDE_TH, StatusBadge, TargetBar, TransferList, type Group,
} from './balance-parts'

type Classify = Pick<NewBalanceItem, 'tier' | 'type' | 'country'>
export interface BalanceMobileProps {
  data: Balance
  month: string
  draft: boolean
  busy: string | null
  quote: FxQuote | null
  fxStale: boolean
  usdRows: number
  nav: { newer?: string; older?: string; canStartNext: boolean; openDraft: string | null }
  summary: {
    net: number; change: number | null; prevNet: number | null; assets: number; liabilities: number
    invest: number; investPrev: number; ef: number; efTarget: number | null
    contrib: { label: string; value: number; sub?: string }[]
    hist: { month: string; label: string; assets: number; liabilities: number; net: number; live: boolean }[]
  }
  actions: {
    go: (m: string) => void
    setEntry: (r: BalanceRow, v: number, expr: string | null) => Promise<boolean>
    setCurrency: (r: BalanceRow, c: Currency) => Promise<boolean> | void
    setRate: (v: number) => Promise<boolean>
    confirm: (ids: number[]) => Promise<boolean>
    remove: (r: BalanceRow) => Promise<boolean>
    restore: (h: Balance['hidden'][number]) => Promise<boolean>
    classify: (r: BalanceRow, c: Classify) => Promise<boolean>
    add: (item: NewBalanceItem) => Promise<boolean>
    toggleTransfer: (bank: string, done: boolean) => void
    startNext: () => void
    closeMonth: () => Promise<boolean>
    discard: () => Promise<boolean>
  }
}

type Adding = { side: BalanceSide; category: string | null; item: string }

export function BalanceMobile(p: BalanceMobileProps) {
  const { data, month, draft, actions, summary: s } = p
  const [editing, setEditing] = useState<number | null>(null)
  const [adding, setAdding] = useState<Adding | null>(null)
  const [panel, setPanel] = useState(false)
  const [rateOpen, setRateOpen] = useState(false)
  // the last checked row hands over to the close panel once its sheet has slid away (no two sheets at once)
  const panelNext = useRef(false)
  const rate = data.fx.usdThb
  const row = data.rows.find((r) => r.id === editing) ?? null
  const unconfirmed = data.rows.filter((r) => !r.confirmed).length
  const groups: Group[] = SIDES.flatMap((side) => categoryOrder(data.rows, side).map((category) => ({ side, category, rows: data.rows.filter((r) => r.side === side && r.category === category) })))

  /** After a row is saved or confirmed in a draft: open the next unchecked row, or the close panel when none is left */
  const advance = (fromId: number) => {
    const next = nextUnconfirmed(data.rows, fromId)
    if (next != null) setEditing(next)
    else { panelNext.current = true; setEditing(null) }
  }
  const needRate = () => { toast.error('ใส่เรท USD/THB ของเดือนนี้ก่อน'); setRateOpen(true) }
  const showRate = rate != null || p.usdRows > 0

  return (
    <div className="flex flex-col gap-4">
      <TopBarSlot below={showRate ? <RateChip fx={data.fx} stale={p.fxStale} prevMonth={data.prevMonth} onOpen={() => setRateOpen(true)} /> : undefined}>
        <Button variant="ghost" size="icon" className="size-11" aria-label="เดือนก่อน" disabled={!p.nav.older} onClick={() => p.nav.older && actions.go(p.nav.older)}><ChevronLeft /></Button>
        <span className="truncate text-sm font-semibold">{thMonth(month)}</span>
        <Button variant="ghost" size="icon" className="size-11" aria-label="เดือนถัดไป" disabled={!p.nav.newer} onClick={() => p.nav.newer && actions.go(p.nav.newer)}><ChevronRight /></Button>
        <StatusBadge status={data.status!} />
      </TopBarSlot>

      {SIDES.map((side) => (
        <section key={side} className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between px-1">
            <h2 className="text-lg font-semibold tracking-tight">{SIDE_TH[side]}</h2>
            <span className="tabular font-medium">{thb(side === 'asset' ? s.assets : s.liabilities)}</span>
          </div>
          {groups.filter((g) => g.side === side).map((g) => {
            const chips = unusedChips(BALANCE_CATEGORIES.find((d) => d.category === g.category)?.chips ?? [], g.rows.map((r) => r.item))
            return g.rows.length
              ? <CategoryCard key={`${month}:${g.category}`} group={g} chips={chips} draft={draft} prevMonth={data.prevMonth} target={data.targets[g.category] ?? null}
                  onOpen={setEditing} onConfirm={actions.confirm} onAdd={(item) => setAdding({ side, category: g.category, item })} />
              : <EmptyCategory key={`${month}:${g.category}`} category={g.category} chips={chips} expanded={!data.hasClosed}
                  onAdd={(item) => setAdding({ side, category: g.category, item })} />
          })}
          <Button variant="ghost" className="h-11 self-start text-muted-foreground" onClick={() => setAdding({ side, category: null, item: '' })}>
            <Plus /> เพิ่มหมวดใหม่ใน{SIDE_TH[side]}
          </Button>
        </section>
      ))}

      <NetWorthCard net={s.net} change={s.change} prevNet={s.prevNet} prevMonth={data.prevMonth} assets={s.assets} liabilities={s.liabilities} />
      <InvestCard invest={s.invest} investPrev={s.investPrev} prevMonth={data.prevMonth} />
      {s.efTarget != null ? <EmergencyMeter value={s.ef} target={s.efTarget} /> : <EfHint />}
      {s.contrib.length > 0 && data.prevMonth && <ContribCard rows={s.contrib} prevMonth={data.prevMonth} />}
      <HistoryCard hist={s.hist} draft={draft} />
      {draft && data.hidden.length > 0 && <HiddenCard hidden={data.hidden} onRestore={actions.restore} />}

      <FloatingBar {...p} unconfirmed={unconfirmed} onOpenPanel={() => setPanel(true)} />

      <RowSheet row={row} rows={data.rows} draft={draft} prevMonth={data.prevMonth} rate={rate}
        onClose={() => setEditing(null)} onClosed={() => { if (panelNext.current) { panelNext.current = false; setPanel(true) } }} onAdvance={advance} onNeedRate={needRate} actions={actions} />
      <AddSheet target={adding} rows={data.rows} rate={rate} onClose={() => setAdding(null)} onNeedRate={needRate}
        onAdd={(item) => actions.add(item)} />
      <ClosePanel open={panel} onOpenChange={setPanel} {...p} unconfirmed={unconfirmed}
        onRate={() => { setPanel(false); setRateOpen(true) }}
        onCheckNext={() => { setPanel(false); setEditing(nextUnconfirmed(data.rows, null)) }} />
      <RateSheet open={rateOpen} onOpenChange={setRateOpen} fx={data.fx} draft={draft} stale={p.fxStale} prevMonth={data.prevMonth} quote={p.quote} onSet={actions.setRate} />
    </div>
  )
}

function RateChip({ fx, stale, prevMonth, onOpen }: { fx: Balance['fx']; stale: boolean; prevMonth: string | null; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className={cn('flex min-h-11 w-full items-center gap-2 rounded-xl border bg-card px-3 text-sm', stale && 'border-warning')}>
      <span className="text-muted-foreground">เรทเดือนนี้</span>
      <span className="tabular font-medium">{fx.usdThb != null ? `1 USD = ${decimal(fx.usdThb, 4)} THB` : 'ยังไม่ได้ใส่'}</span>
      <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
        {stale
          ? <><span className="size-1.5 rounded-full bg-warning" aria-hidden />ยังใช้เรท {prevMonth ? thMonth(prevMonth) : 'เดือนก่อน'}</>
          : fx.confirmed ? <><CircleCheck className="size-3.5 text-good" aria-hidden />ยืนยันแล้ว</> : null}
      </span>
    </button>
  )
}

function CategoryCard({ group, chips, draft, prevMonth, target, onOpen, onConfirm, onAdd }: {
  group: Group; chips: string[]; draft: boolean; prevMonth: string | null; target: number | null
  onOpen: (id: number) => void; onConfirm: (ids: number[]) => void; onAdd: (item: string) => void
}) {
  const total = group.rows.reduce((s, r) => s + r.thb, 0)
  const prev = group.rows.reduce((s, r) => s + (r.prev ?? 0), 0)
  const open = group.rows.filter((r) => !r.confirmed)
  const invested = group.rows.some((r) => r.tier)
  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-wrap items-center gap-3 border-b border-border/70 px-4 py-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted" aria-hidden><CategoryIcon category={group.category} className="size-4.5" /></span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium">{CATEGORY_TH[group.category] ?? group.category}</span>
          <span className="text-xs text-muted-foreground">{draft ? `${group.rows.length - open.length} / ${group.rows.length} เช็กแล้ว` : `${group.category} · ${group.rows.length} รายการ`}</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="tabular font-semibold">{money(total)}</span>
          {prevMonth && <span className="text-xs"><Change value={(group.side === 'asset' ? 1 : -1) * (total - prev)} compact /></span>}
        </div>
        {target != null && <TargetBar value={total} target={target} />}
        {draft && open.length > 1 && (
          <Button variant="outline" className="h-11 w-full" onClick={() => onConfirm(open.map((r) => r.id))}>
            <CircleCheck /> ยอดไม่เปลี่ยนทั้งหมวด ({open.length})
          </Button>
        )}
      </div>
      <ul className="flex flex-col divide-y divide-border/60">
        {group.rows.map((r) => <Row key={r.id} row={r} draft={draft} prevMonth={prevMonth} flagged={r.side === 'asset' && !r.tier && invested} onOpen={onOpen} onConfirm={onConfirm} />)}
      </ul>
      <div className="border-t px-3 py-2"><Chips chips={chips} onPick={onAdd} /></div>
    </Card>
  )
}

const signedMoney = (v: number, unit: '' | '$' | '฿') => `${v >= 0 ? '+' : '−'}${unit}${money(Math.abs(v))}`

/** How a row compares with last month: in USD when it was USD both months (what is really held), otherwise in THB */
function rowDiff(r: BalanceRow) {
  const inUsd = r.usd != null && r.prevUsd != null
  const diff = inUsd ? r.usd! - r.prevUsd! : r.prev != null ? r.thb - r.prev : null
  const unit: '' | '$' | '฿' = inUsd ? '$' : r.usd != null ? '฿' : ''
  return { inUsd, diff, unit, good: diff != null && (r.side === 'asset' ? diff > 0 : diff < 0) }
}

function Row({ row: r, draft, prevMonth, flagged, onOpen, onConfirm }: {
  row: BalanceRow; draft: boolean; prevMonth: string | null; flagged: boolean; onOpen: (id: number) => void; onConfirm: (ids: number[]) => void
}) {
  const { inUsd, diff, unit, good } = rowDiff(r)
  const prevText = r.prev == null ? null : inUsd ? `$${money(r.prevUsd!)}` : r.usd != null ? `฿${money(r.prev)}` : money(r.prev)
  const sub = [
    r.usd != null ? `≈ ${money(r.thb)} THB` : null,
    r.tier ? `${r.tier}${r.type ? ` · ${r.type}` : ''}` : null,
    flagged ? 'ไม่ได้นับในพอร์ต' : null,
    prevMonth ? (prevText ? `${thMonth(prevMonth)} ${prevText}` : 'ใหม่') : null,
  ].filter(Boolean).join(' · ')
  return (
    <li className="flex items-stretch">
      {draft && (
        <button type="button" disabled={r.confirmed} onClick={() => onConfirm([r.id])} className="grid w-12 shrink-0 place-items-center"
          aria-label={r.confirmed ? `${r.item} เช็กแล้ว` : `ยืนยัน ${r.item} ยอดไม่เปลี่ยน`}>
          {r.confirmed ? <CircleCheck className="size-5 text-good" /> : <Circle className="size-5 text-muted-foreground/60" />}
        </button>
      )}
      <button type="button" onClick={() => onOpen(r.id)} className={cn('flex min-h-14 min-w-0 flex-1 items-center gap-2 py-2 pr-3 text-left active:bg-muted/50', !draft && 'pl-4')}>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{r.item}</span>
          {sub && <span className={cn('truncate text-xs text-muted-foreground', flagged && 'text-foreground')}>{sub}</span>}
        </span>
        <span className="flex shrink-0 flex-col items-end">
          <span className={cn('tabular text-sm font-semibold', draft && !r.confirmed && 'text-muted-foreground')}>{r.usd != null ? `$${money(r.usd)}` : money(r.thb)}</span>
          {diff != null && Math.abs(diff) >= 0.005 && <span className={cn('tabular text-xs', good ? 'text-good' : 'text-critical')}>{signedMoney(diff, unit)}</span>}
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" aria-hidden />
      </button>
    </li>
  )
}

function EmptyCategory({ category, chips, expanded, onAdd }: { category: string; chips: string[]; expanded: boolean; onAdd: (item: string) => void }) {
  const [open, setOpen] = useState(expanded)
  if (!open) {
    return <Button variant="ghost" className="h-11 self-start text-muted-foreground" onClick={() => setOpen(true)}><Plus /> เพิ่มใน {CATEGORY_TH[category] ?? category}</Button>
  }
  return (
    <Card className="gap-0 py-0">
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground" aria-hidden><CategoryIcon category={category} className="size-4.5" /></span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium">{CATEGORY_TH[category] ?? category}</span>
          <span className="text-xs text-muted-foreground">{category} · ยังไม่มีรายการ</span>
        </div>
      </div>
      <div className="border-t px-3 py-2"><Chips chips={chips} onPick={onAdd} /></div>
    </Card>
  )
}

const textOf = (r: BalanceRow) => r.expr ?? String(r.usd ?? r.thb)

function RowSheet({ row: shown, rows, draft, prevMonth, rate, onClose, onClosed, onAdvance, onNeedRate, actions }: {
  row: BalanceRow | null; rows: BalanceRow[]; draft: boolean; prevMonth: string | null; rate: number | null
  onClose: () => void; onClosed: () => void; onAdvance: (fromId: number) => void; onNeedRate: () => void; actions: BalanceMobileProps['actions']
}) {
  // the sheet stays mounted so it can slide out; while closing it keeps showing the last row
  const [last, setLast] = useState(shown)
  if (shown && shown !== last) setLast(shown)
  const r = shown ?? last
  // the text belongs to one row in one currency; switching rows or ฿/$ starts from that row's value again
  const key = r ? `${r.id}:${r.usd != null}` : ''
  const [state, setState] = useState({ key, text: r ? textOf(r) : '' })
  const text = state.key === key ? state.text : r ? textOf(r) : ''
  const setText = (t: string) => setState({ key, text: t })
  // the classify form also belongs to one row: stepping to the next row closes it
  const [cls, setCls] = useState<{ key: string; v: Classify } | null>(null)
  const classifying = cls?.key === key ? cls.v : null
  const setClassifying = (v: Classify | null | ((x: Classify | null) => Classify | null)) =>
    setCls((c) => { const next = typeof v === 'function' ? v(c?.key === key ? c.v : null) : v; return next ? { key, v: next } : null })
  const [saving, setSaving] = useState(false)
  // anything typed for this row is dropped whenever the row is left, so reopening it shows its real value
  const reset = () => { setState({ key: '', text: '' }); setCls(null) }
  const leave = () => { reset(); onClose() }
  const advance = (id: number) => { reset(); onAdvance(id) }
  if (!r) return null
  const row = r

  const usd = row.usd != null
  const { value, expr, ok } = readAmount(text)
  const current = row.usd ?? row.thb
  const changed = ok && (Math.abs(value! - current) >= 0.005 || expr !== (row.expr ?? null))
  const pending = pageOrder(rows).filter((r) => !r.confirmed)
  const k = pending.findIndex((r) => r.id === row.id)
  const prevBase = usd ? row.prevUsd : row.usd == null ? row.prev : null
  const delta = ok && prevBase != null ? value! - prevBase : null
  const good = delta != null && (row.side === 'asset' ? delta > 0 : delta < 0)

  const save = async (next: boolean) => {
    if (!ok || saving) return
    setSaving(true)
    try {
      if (changed && !(await actions.setEntry(row, value!, expr))) return // failed: toast shown, sheet stays with the text
      if (!changed && draft && !row.confirmed && !(await actions.confirm([row.id]))) return // failed: toast shown, sheet stays
      if (next && draft) advance(row.id)
      else leave()
    } finally { setSaving(false) }
  }
  const sameAsBefore = async () => {
    if (saving) return
    setSaving(true)
    try {
      if (!(await actions.confirm([row.id]))) return // failed: toast shown, sheet stays on this row
      advance(row.id)
    } finally { setSaving(false) }
  }
  const currency = (c: Currency) => {
    if ((row.usd != null ? 'USD' : 'THB') === c) return
    if (c === 'USD' && rate == null) return onNeedRate()
    reset()
    actions.setCurrency(row, c)
  }

  return (
    <Sheet open={shown != null} onOpenChange={(o) => !o && leave()} onClosed={onClosed}
      title={row.item}
      description={`${CATEGORY_TH[row.category] ?? row.category}${draft ? (k >= 0 ? ` · แถว ${k + 1} จาก ${pending.length} ที่ยังไม่เช็ก` : ` · เช็กแล้ว · เหลือ ${pending.length} แถว`) : ''}`}
      actions={
        <div role="radiogroup" aria-label="สกุลเงิน" className="inline-flex shrink-0 rounded-xl bg-muted p-1 text-sm">
          {(['THB', 'USD'] as const).map((c) => (
            <button key={c} type="button" role="radio" aria-checked={(usd ? 'USD' : 'THB') === c} onClick={() => currency(c)}
              className={cn('min-h-11 rounded-lg px-3', (usd ? 'USD' : 'THB') === c ? 'bg-card font-medium shadow-sm' : 'text-muted-foreground')}>
              {c === 'THB' ? '฿ THB' : '$ USD'}
            </button>
          ))}
        </div>
      }
      footer={
        draft
          ? (
            <div className="grid grid-cols-[1fr_1.3fr] gap-2">
              <Button variant="secondary" className="h-12" disabled={saving || changed || !ok} onPointerDown={(e) => e.preventDefault()} onClick={sameAsBefore}><CircleCheck /> ยอดไม่เปลี่ยน</Button>
              <Button className="h-12" disabled={!ok || saving} onPointerDown={(e) => e.preventDefault()} onClick={() => save(true)}>บันทึก · ถัดไป <ChevronRight /></Button>
            </div>
          )
          : <Button className="h-12 w-full" disabled={!ok || saving} onClick={() => save(false)}>บันทึก</Button>
      }>
      <div className="flex flex-col gap-3">
        {prevMonth && row.prev != null && (
          <span className="tabular text-sm text-muted-foreground">
            {thMonth(prevMonth)} {row.prevUsd != null && usd ? `$${money(row.prevUsd)}` : `${money(row.prev)} THB`}
          </span>
        )}
        <AmountField text={text} onText={setText} selectKey={key} unit={usd ? 'USD' : 'THB'} label={`ยอด ${row.item}${usd ? ' (USD)' : ''}`}
          onEnter={() => save(draft)}
          hint={<>
            {usd && rate != null && ok && <span className="block">≈ {money(round2(value! * rate))} THB</span>}
            {delta != null && Math.abs(delta) >= 0.005 && <span className={good ? 'text-good' : 'text-critical'}>{signedMoney(delta, usd ? '$' : '')}</span>}
          </>} />
        {classifying
          ? (
            <div className="flex flex-col gap-3 rounded-2xl border border-dashed p-3">
              <InvestFields tier={classifying.tier} type={classifying.type ?? ''} country={classifying.country ?? ''} onChange={(c) => setClassifying((x) => x && { ...x, ...c })} />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setClassifying(null)}>ยกเลิก</Button>
                <Button onClick={async () => { if (await actions.classify(row, classifying)) setClassifying(null) }}>บันทึกการจัดกลุ่ม</Button>
              </div>
            </div>
          )
          : (
            <div className="flex justify-center gap-2 text-sm">
              {row.side === 'asset' && (
                <Button variant="ghost" className="h-11" onClick={() => setClassifying({ tier: row.tier, type: row.type ?? 'Equity', country: row.country ?? 'Thailand' })}>จัดกลุ่มการลงทุน</Button>
              )}
              <Button variant="ghost" className="h-11 text-critical" onClick={async () => { if (await actions.remove(row)) leave() }}>ซ่อนรายการนี้</Button>
            </div>
          )}
      </div>
    </Sheet>
  )
}

function AddSheet({ target: current, rows, rate, onClose, onNeedRate, onAdd }: {
  target: Adding | null; rows: BalanceRow[]; rate: number | null
  onClose: () => void; onNeedRate: () => void; onAdd: (item: NewBalanceItem) => Promise<boolean>
}) {
  // the sheet stays mounted so it can slide out; while closing it keeps showing the last target
  const [lastTarget, setLastTarget] = useState(current)
  if (current && current !== lastTarget) setLastTarget(current)
  const t = current ?? lastTarget
  const [form, setForm] = useState<{ for: Adding | null; category: string; item: string; text: string; cur: Currency; cls: ReturnType<typeof guess> } | null>(null)
  // a new target starts a fresh form (guessing the currency and classification from the category's rows)
  const f = form?.for === t && form ? form : t ? {
    for: t, category: t.category ?? '', item: t.item, text: '',
    cur: guessCurrency(rows, t.category ?? '', rate), cls: guess(rows, t.category ?? ''),
  } : null
  const set = (p: Partial<NonNullable<typeof f>>) => setForm({ ...f!, ...p })
  const [saving, setSaving] = useState(false)
  if (!t || !f) return null
  const target = t

  const { value, expr, ok } = readAmount(f.text)
  const blank = f.text.trim() === ''
  const ready = !!f.item.trim() && !!f.category.trim() && (blank || ok) && !saving
  const known = categoryOrder(rows, target.side)
  const switchCur = (c: Currency) => {
    if (c === f.cur) return
    if (c === 'USD' && rate == null) return onNeedRate()
    // a typed amount keeps its value: converted at the month's rate, not reread in the other currency
    const text = !blank && ok && rate != null ? String(round2(c === 'USD' ? value! / rate : value! * rate)) : f.text
    set({ cur: c, text })
  }
  const submit = async () => {
    if (!ready) return
    const category = f.category.trim()
    if (!target.category && known.includes(category)) toast.message(`${category} มีอยู่แล้ว — เพิ่มเข้าไปในหมวดเดิม`)
    setSaving(true)
    try {
      const done = await onAdd({
        side: target.side, category, item: f.item.trim(),
        ...(target.side === 'asset' ? f.cls : { tier: null, type: null, country: null }),
        ...(blank ? {} : f.cur === 'USD' ? { usd: value!, expr } : { thb: value!, expr }),
      })
      if (done) onClose() // the next open gets a new target, so the form starts fresh then
    } finally { setSaving(false) }
  }

  return (
    <Sheet open={current != null} onOpenChange={(o) => !o && onClose()}
      title={target.category ? `เพิ่มใน ${CATEGORY_TH[target.category] ?? target.category}` : `เพิ่มหมวดใหม่ใน${SIDE_TH[target.side]}`}
      footer={<div className="grid grid-cols-[1fr_1.6fr] gap-2"><Button variant="outline" className="h-12" onClick={onClose}>ยกเลิก</Button><Button className="h-12" disabled={!ready} onClick={submit}>เพิ่ม</Button></div>}>
      <div className="flex flex-col gap-3">
        {!target.category && (
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            หมวด
            <Input list="m-cats" value={f.category} onChange={(e) => set({ category: e.target.value, cls: guess(rows, e.target.value) })} placeholder="เช่น Others" className="h-11" />
            <datalist id="m-cats">{known.map((c) => <option key={c} value={c}>{CATEGORY_TH[c]}</option>)}</datalist>
          </label>
        )}
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          ชื่อบัญชี / กองทุน
          <Input value={f.item} onChange={(e) => set({ item: e.target.value })} placeholder="เช่น บัญชีออมทรัพย์ SCB" className="h-11" />
        </label>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          ยอด (ไม่ใส่ก็ได้)
          <div role="radiogroup" aria-label="สกุลเงิน" className="inline-flex rounded-xl bg-muted p-1 text-sm">
            {(['THB', 'USD'] as const).map((c) => (
              <button key={c} type="button" role="radio" aria-checked={f.cur === c} onClick={() => switchCur(c)}
                className={cn('min-h-11 rounded-lg px-3', f.cur === c ? 'bg-card font-medium text-foreground shadow-sm' : 'text-muted-foreground')}>{c === 'THB' ? '฿' : '$'}</button>
            ))}
          </div>
        </div>
        <AmountField text={f.text} onText={(text) => set({ text })} unit={f.cur} label={`ยอด (${f.cur})`} onEnter={submit}
          hint={f.cur === 'USD' && rate != null && ok && !blank ? `≈ ${money(round2(value! * rate))} THB` : undefined} />
        {target.side === 'asset' && <InvestFields tier={f.cls.tier} type={f.cls.type} country={f.cls.country} onChange={(c) => set({ cls: { ...f.cls, ...c } as typeof f.cls })} />}
      </div>
    </Sheet>
  )
}

function FloatingBar(p: BalanceMobileProps & { unconfirmed: number; onOpenPanel: () => void }) {
  const { data, draft, nav, actions, busy } = p
  const transfers = data.transfers ? { done: data.transfers.banks.filter((b) => b.doneAt).length, total: data.transfers.banks.length } : null
  const checked = data.rows.length - p.unconfirmed
  let body: ReactNode = null
  if (draft) {
    body = (
      <button type="button" onClick={p.onOpenPanel} className="flex w-full items-center gap-3 rounded-2xl bg-primary px-4 py-3 text-left text-primary-foreground shadow-lg">
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-sm"><b>เช็ก {checked} / {data.rows.length}</b>{transfers ? ` · โอน ${transfers.done} / ${transfers.total}` : ''}</span>
          <span className="h-1.5 overflow-hidden rounded-full bg-primary-foreground/20"><span className="block h-full rounded-full bg-good" style={{ width: `${(checked / Math.max(data.rows.length, 1)) * 100}%` }} /></span>
        </span>
        <span className="flex shrink-0 items-center gap-1 rounded-xl bg-primary-foreground px-3 py-2 text-sm font-semibold text-primary"><Lock className="size-4" /> ปิดเดือน</span>
      </button>
    )
  } else if (nav.canStartNext && data.next) {
    body = <Button className="h-12 w-full rounded-2xl shadow-lg" disabled={!!busy} onClick={actions.startNext}><Plus /> เริ่มปิดบัญชี {thMonth(data.next)}</Button>
  } else if (nav.openDraft) {
    body = <Button variant="outline" className="h-12 w-full rounded-2xl bg-card shadow-lg" onClick={() => actions.go(nav.openDraft!)}>ไปที่ร่างที่เปิดอยู่ ({thMonth(nav.openDraft)})</Button>
  }
  if (!body) return null
  return (
    <>
      <div className="h-20" aria-hidden />
      <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 mx-auto max-w-[640px] px-3">{body}</div>
    </>
  )
}

function ClosePanel(p: BalanceMobileProps & { open: boolean; onOpenChange: (o: boolean) => void; unconfirmed: number; onRate: () => void; onCheckNext: () => void }) {
  const { data, month, actions, busy } = p
  const [asking, setAsking] = useState<'close' | 'discard' | null>(null)
  // the ask belongs to one opening of the panel (it is also opened and closed from outside)
  const [wasOpen, setWasOpen] = useState(p.open)
  if (wasOpen !== p.open) { setWasOpen(p.open); setAsking(null) }
  const t = data.transfers
  const untransferred = t ? t.banks.filter((b) => !b.doneAt).length : 0
  const empty = data.rows.length === 0
  const pending = [
    p.fxStale && 'เรท USD/THB ยังเป็นของเดือนก่อน',
    p.unconfirmed && `${p.unconfirmed} รายการที่ยังใช้ยอดเดือนก่อน`,
    untransferred && `ยังไม่ได้ติ๊กโอนเงิน ${untransferred} บัญชี`,
  ].filter(Boolean) as string[]
  const close = async () => { setAsking(null); if (await actions.closeMonth()) p.onOpenChange(false) }
  const discard = async () => { setAsking(null); if (await actions.discard()) p.onOpenChange(false) }
  return (
    <Sheet open={p.open} onOpenChange={(o) => { setAsking(null); p.onOpenChange(o) }}
      title={`ก่อนปิดเดือน ${thMonth(month)}`}
      description={data.prevMonth ? `Overview ยังใช้ ${thMonth(data.prevMonth)} จนกว่าจะปิดเดือน` : 'Overview จะเริ่มแสดงหลังปิดเดือนแรก'}
      footer={
        asking === 'close' ? (
          <div className="flex flex-col gap-2 text-sm">
            <span>ยังมี {pending.join(' · ')} — ปิดเดือนเลยไหม?</span>
            <div className="grid grid-cols-2 gap-2"><Button variant="outline" className="h-12" onClick={() => setAsking(null)}>กลับไปเช็ก</Button><Button className="h-12" disabled={!!busy} onClick={close}>ปิดเดือนเลย</Button></div>
          </div>
        ) : asking === 'discard' ? (
          <div className="flex flex-col gap-2 text-sm">
            <span>ลบร่าง {thMonth(month)} ทั้งเดือน? ยอดที่กรอกในเดือนนี้จะหายหมด</span>
            <div className="grid grid-cols-2 gap-2"><Button variant="outline" className="h-12" onClick={() => setAsking(null)}>ไม่ลบ</Button><Button variant="destructive" className="h-12" disabled={!!busy} onClick={discard}>ลบร่าง</Button></div>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {empty && <span className="text-center text-xs text-muted-foreground">เพิ่มอย่างน้อย 1 รายการก่อนปิดเดือน</span>}
            <Button className="h-12" disabled={!!busy || empty} onClick={() => (pending.length ? setAsking('close') : close())}><Lock /> ปิดเดือน {thMonth(month)}</Button>
            <Button variant="ghost" className="h-11 text-critical" disabled={!!busy} onClick={() => setAsking('discard')}>ลบร่างเดือนนี้</Button>
          </div>
        )
      }>
      <ul className="flex flex-col divide-y">
        {(data.fx.usdThb != null || p.usdRows > 0) && (
          <li className="flex min-h-12 items-center gap-3 py-2 text-sm">
            {p.fxStale ? <CircleAlert className="size-5 text-warning" /> : data.fx.confirmed ? <CircleCheck className="size-5 text-good" /> : <Circle className="size-5 text-muted-foreground" />}
            <span className="flex-1">{data.fx.usdThb != null ? `เรท USD/THB ${decimal(data.fx.usdThb, 4)}` : 'ยังไม่ได้ใส่เรท USD/THB'}{p.fxStale ? ' · ยังเป็นของเดือนก่อน' : data.fx.confirmed ? ' · ยืนยันแล้ว' : ''}</span>
            <Button variant="outline" size="sm" className="h-11" onClick={p.onRate}>แก้เรท</Button>
          </li>
        )}
        <li className="flex min-h-12 items-center gap-3 py-2 text-sm">
          {p.unconfirmed ? <Circle className="size-5 text-muted-foreground" /> : <CircleCheck className="size-5 text-good" />}
          <span className="flex-1">{p.unconfirmed ? `ยังไม่เช็ก ${p.unconfirmed} รายการ` : `เช็กครบ ${data.rows.length} รายการแล้ว`}</span>
          {p.unconfirmed > 0 && <Button variant="secondary" size="sm" className="h-11" onClick={p.onCheckNext}>ไล่เช็กต่อ <ChevronRight /></Button>}
        </li>
        {t && t.banks.length > 0 && (
          <li className="flex flex-col gap-2 py-3">
            <span className="flex items-center gap-3 text-sm">
              {untransferred ? <Circle className="size-5 text-muted-foreground" /> : <CircleCheck className="size-5 text-good" />}
              โอนเงิน {t.banks.length - untransferred} / {t.banks.length} บัญชี <span className="text-xs text-muted-foreground">· แตะยอดเพื่อคัดลอก</span>
            </span>
            <TransferList t={t} onToggle={actions.toggleTransfer} />
          </li>
        )}
      </ul>
    </Sheet>
  )
}

function RateSheet({ open, onOpenChange, fx, draft, stale, prevMonth, quote, onSet }: {
  open: boolean; onOpenChange: (o: boolean) => void; fx: Balance['fx']; draft: boolean; stale: boolean; prevMonth: string | null
  quote: FxQuote | null; onSet: (v: number) => Promise<boolean>
}) {
  const [text, setText] = useState<string | null>(null)
  const shown = text ?? (fx.usdThb != null ? String(fx.usdThb) : '')
  const { value, ok } = readAmount(shown, 4, 0.0001)
  const unchanged = fx.usdThb != null && ok && Math.abs(value! - fx.usdThb) < 0.00005
  const offer = draft && quote && (fx.usdThb == null || Math.abs(quote.rate - fx.usdThb) >= 0.00005) ? quote : null
  const set = async (v: number) => { if (await onSet(v)) { setText(null); onOpenChange(false) } }
  return (
    <Sheet open={open} onOpenChange={(o) => { setText(null); onOpenChange(o) }} title="เรท USD/THB ของเดือนนี้"
      description="ใช้คิดเป็นบาทกับทุกรายการที่เป็น USD"
      footer={<Button className="h-12 w-full" disabled={!ok || shown.trim() === '' || (unchanged && !stale)} onClick={() => set(value!)}>{unchanged && stale ? 'ยืนยันเรทนี้' : 'บันทึกเรท'}</Button>}>
      <div className="flex flex-col gap-3">
        <span className="text-sm text-muted-foreground">1 USD =</span>
        <AmountField text={shown} onText={setText} unit="THB" digits={4} min={0.0001} label="เรท USD/THB ของเดือนนี้" onEnter={() => ok && set(value!)} />
        {stale && <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><span className="size-1.5 rounded-full bg-warning" aria-hidden />ยังใช้เรท {prevMonth ? thMonth(prevMonth) : 'เดือนก่อน'} — แก้ หรือกดยืนยัน</span>}
        {offer && (
          <Button variant="outline" className="h-11 justify-between" onClick={() => set(offer.rate)}>
            <span>ECB {thDay(offer.date)}: {decimal(offer.rate, 4)}</span><span>ใช้เรทนี้</span>
          </Button>
        )}
      </div>
    </Sheet>
  )
}
