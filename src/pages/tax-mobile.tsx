import { useState } from 'react'
import { ChevronUp } from 'lucide-react'
import { AmountField, readAmount } from '@/components/mobile/amount-field'
import { Sheet } from '@/components/mobile/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Tax } from '@/lib/api'
import { money, pct } from '@/lib/format'
import { annualOf } from '@shared/tax'
import { SECTION_TH, type TaxSection } from '@shared/tax-rules'
import type { TaxRowView, TaxView } from '@shared/tax-view'
import { defaultAsOf, MonthSelect, monthsUntil, rowKey, type TaxActions } from './tax-parts'

/** Result strip above the bottom tabs; opens the result sheet */
export function ResultBar({ view, onOpen }: { view: TaxView; onOpen: () => void }) {
  const r = view.result
  const best = view.advice[0]
  return (
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 px-3 pb-2">
      <button type="button" onClick={onOpen} aria-label="ดูผลการคำนวณภาษีและคำแนะนำ"
        className="mx-auto flex min-h-14 w-full max-w-[616px] items-center justify-between gap-3 rounded-2xl bg-foreground px-4 py-2 text-left text-background shadow-lg">
        <span className="flex flex-col">
          <span className="text-xs opacity-70">{r.due < 0 ? 'ได้คืน' : 'จ่ายเพิ่ม'} · ขั้น {pct(r.rate, 0)}</span>
          <span className="tabular text-lg font-semibold">{money(Math.abs(r.due))}</span>
        </span>
        <span className="flex items-center gap-2 text-right text-xs">
          {best && <span className="flex flex-col"><span className="opacity-70">ลดได้อีก</span><span className="tabular font-semibold">{money(best.saving)}</span></span>}
          <ChevronUp className="size-4" aria-hidden />
        </span>
      </button>
    </div>
  )
}

export type TaxSheetState = { mode: 'edit'; row: TaxRowView } | { mode: 'add'; section: TaxSection } | null
const keyOf = (s: TaxSheetState) => (!s ? '' : s.mode === 'edit' ? rowKey(s.row.line) : `add:${s.section}`)

/** Edit a linked row (paid so far, as-of month, one-off), edit a hand-typed row, or add one */
export function TaxLineSheet({ state: current, tax, view, actions, onClose }: {
  state: TaxSheetState; tax: Tax; view: TaxView; actions: TaxActions; onClose: () => void
}) {
  // the sheet stays mounted so it can slide out; while closing it keeps showing the last row
  const [last, setLast] = useState(current)
  if (current && current !== last) setLast(current)
  const state = current ?? last
  const kindsOf = (section: TaxSection) => view.rules.kinds.filter((k) => k.section === section && k.auto == null)
  const fresh = (s: TaxSheetState) => {
    if (s?.mode === 'edit') {
      const l = s.row.line
      return { key: keyOf(s), kind: l.kind, label: l.label, paid: l.paidExpr ?? String(l.paid), lump: l.lumpExpr ?? String(l.lump), asOf: l.asOf }
    }
    return { key: keyOf(s), kind: s ? kindsOf(s.section)[0]?.key ?? '' : '', label: '', paid: '', lump: '', asOf: null as string | null }
  }
  const [form, setForm] = useState(() => fresh(state))
  const f = form.key === keyOf(state) ? form : fresh(state)
  const set = (p: Partial<typeof f>) => setForm({ ...f, ...p })
  const [saving, setSaving] = useState(false)
  const close = () => { setForm(fresh(null)); onClose() }
  if (!state) return null

  const line = state.mode === 'edit' ? state.row.line : null
  const linked = !!line?.budget
  const paid = readAmount(f.paid, 2, 0), lump = readAmount(f.lump, 2, 0)
  const lastMonth = `${tax.year}-12`
  // the as-of month a first typed amount gets, shown before saving so the total below is what will be stored
  const asOf = f.asOf ?? (linked && paid.ok && paid.value! > 0 ? defaultAsOf(tax, lastMonth) : null)
  const annual = linked && paid.ok && lump.ok ? annualOf({ budget: line!.budget, paid: paid.value!, lump: lump.value!, asOf }, tax.year) : null
  const ready = paid.ok && (!linked || lump.ok) && (state.mode === 'edit' || !!f.kind) && !saving
  const submit = async () => {
    if (!ready) return
    setSaving(true)
    try {
      let done: boolean
      if (line && linked) done = await actions.saveLinked(line, { paid: paid.value!, paidExpr: paid.expr, asOf, lump: lump.value!, lumpExpr: lump.expr })
      else if (line) done = await actions.saveTyped(line, { label: f.label.trim() || line.label, thb: paid.value!, expr: paid.expr })
      else done = await actions.add({ kind: f.kind, label: f.label.trim(), thb: paid.value!, expr: paid.expr })
      if (done) close()
    } finally { setSaving(false) }
  }
  const title = state.mode === 'add' ? `เพิ่ม · ${SECTION_TH[state.section]}` : line!.label

  return (
    <Sheet open={current != null} onOpenChange={(o) => !o && close()} title={title}
      description={linked ? `แถวงบ ${money(line!.budget!.thb)} ต่อเดือน · เอาออกที่หน้าแผนเงิน` : state.mode === 'edit' ? state.row.kind.label : undefined}
      actions={line && !linked ? <Button variant="ghost" className="h-11 text-critical" onClick={() => { actions.remove(line); close() }}>ลบ</Button> : undefined}
      footer={<div className="grid grid-cols-[1fr_1.6fr] gap-2"><Button variant="outline" className="h-12" onClick={close}>ยกเลิก</Button><Button className="h-12" disabled={!ready} onClick={submit}>{state.mode === 'add' ? 'เพิ่ม' : 'บันทึก'}</Button></div>}>
      <div className="flex flex-col gap-3">
        {state.mode === 'add' && (
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            ชนิด
            <select value={f.kind} onChange={(e) => set({ kind: e.target.value })} className="h-11 rounded-lg border border-input bg-background px-3 text-base text-foreground">
              {kindsOf(state.section).map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
            </select>
          </label>
        )}
        {!linked && (
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            ชื่อ{state.mode === 'add' ? ' (ไม่บังคับ)' : ''}
            <Input value={f.label} onChange={(e) => set({ label: e.target.value })} placeholder="เช่น AIA 20 Pay Life" className="h-11 text-base" />
          </label>
        )}
        {linked && (
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            จ่ายแล้วสะสม ถึงสิ้นเดือน
            <MonthSelect months={monthsUntil(`${tax.year}-01`, lastMonth)} value={asOf} label="ยอดสะสมถึงสิ้นเดือน" empty="ยังไม่ได้จ่าย" onChange={(m) => set({ asOf: m })} />
          </div>
        )}
        {!linked && <span className="text-xs text-muted-foreground">ยอดทั้งปี</span>}
        <AmountField text={f.paid} onText={(paid) => set({ paid })} unit="THB" min={0} label={linked ? 'จ่ายแล้วสะสม' : 'ยอดทั้งปี'} onEnter={submit} />
        {linked && (
          <>
            <span className="text-xs text-muted-foreground">ยอดก้อนที่จะมีเพิ่ม (ยอดครั้งเดียวที่ไม่อยู่ในงบรายเดือน)</span>
            <AmountField text={f.lump} onText={(lump) => set({ lump })} unit="THB" min={0} label="ยอดก้อนที่จะมีเพิ่ม" onEnter={submit} />
            <div className="tabular flex flex-col gap-1 border-t pt-3 text-sm">
              <div className="flex justify-between gap-3 text-muted-foreground"><span>จากงบที่เหลือ</span><span>{annual != null ? money(annual - paid.value! - lump.value!) : '–'}</span></div>
              <div className="flex justify-between gap-3 font-semibold"><span>ทั้งปี</span><span>{annual != null ? money(annual) : '–'}</span></div>
            </div>
          </>
        )}
      </div>
    </Sheet>
  )
}
