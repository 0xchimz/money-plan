import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { AmountField, readAmount } from '@/components/mobile/amount-field'
import { Sheet } from '@/components/mobile/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { BudgetLineInput, BudgetLineRow, BudgetType } from '@/lib/api'
import { CATEGORY_TH } from '@/lib/categories'
import { money, pct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PLANNING_CHIPS } from '@shared/categories'

export type LineSheetState = { mode: 'edit'; line: BudgetLineRow } | { mode: 'add'; type: BudgetType; category: string; item: string } | null

/** A plan line on a phone: name + account, amount + share of income; the whole row opens the edit sheet */
export function MobileLineRow({ line: l, income, onOpen }: { line: BudgetLineRow; income: number; onOpen: () => void }) {
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex min-h-12 w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left active:bg-muted/60">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{l.item}</span>
          {l.account && <span className="truncate text-xs text-muted-foreground">{l.account}</span>}
        </span>
        <span className="flex shrink-0 flex-col items-end">
          <span className="tabular text-sm font-semibold">{money(l.thb)}</span>
          {income > 0 && l.type !== 'Income' && <span className="tabular text-xs text-muted-foreground">{pct(l.thb / income)}</span>}
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" aria-hidden />
      </button>
    </li>
  )
}

const keyOf = (s: LineSheetState) => (!s ? '' : s.mode === 'edit' ? `e${s.line.id}` : `a${s.type}:${s.category}:${s.item}`)

/** Edit or add one plan line on a phone: name, account, category (chips + own), amount with + − × ÷ */
export function LineSheet({ state: current, income, lines, onClose, onSave, onAdd, onRemove }: {
  state: LineSheetState
  income: number
  lines: BudgetLineRow[]
  onClose: () => void
  onSave: (l: BudgetLineRow, p: Partial<BudgetLineInput>) => Promise<boolean>
  onAdd: (l: BudgetLineInput) => Promise<boolean>
  onRemove: (l: BudgetLineRow) => void
}) {
  // the sheet stays mounted so it can slide out; while closing it keeps showing the last line
  const [last, setLast] = useState(current)
  if (current && current !== last) setLast(current)
  const state = current ?? last
  const fresh = (s: LineSheetState) => s?.mode === 'edit'
    ? { key: keyOf(s), item: s.line.item, account: s.line.account ?? '', category: s.line.category, text: s.line.expr ?? String(s.line.thb), own: false }
    : { key: keyOf(s), item: s?.item ?? '', account: '', category: s?.category ?? '', text: '', own: false }
  const [form, setForm] = useState(() => fresh(state))
  const f = form.key === keyOf(state) ? form : fresh(state)
  const set = (p: Partial<typeof f>) => setForm({ ...f, ...p })
  const [saving, setSaving] = useState(false)
  const close = () => { setForm(fresh(null)); onClose() }
  if (!state) return null

  const type = state.mode === 'edit' ? state.line.type : state.type
  const known = [...new Set([...lines.filter((l) => l.type === type).map((l) => l.category), ...PLANNING_CHIPS[type].map((c) => c.category)])]
  const { value, expr, ok } = readAmount(f.text, 2, 0)
  const ready = !!f.item.trim() && !!f.category.trim() && ok && !saving
  const submit = async () => {
    if (!ready) return
    const next = { item: f.item.trim(), account: f.account.trim() || null, category: f.category.trim(), thb: value!, expr }
    setSaving(true)
    try {
      let done: boolean
      if (state.mode === 'edit') {
        const l = state.line
        const p: Partial<BudgetLineInput> = {}
        if (next.item !== l.item) p.item = next.item
        if (next.account !== l.account) p.account = next.account
        if (next.category !== l.category) p.category = next.category
        if (Math.abs(next.thb - l.thb) >= 0.005 || next.expr !== l.expr) { p.thb = next.thb; p.expr = next.expr }
        done = Object.keys(p).length ? await onSave(l, p) : true
      } else {
        done = await onAdd({ type, ...next })
      }
      if (done) close()
    } finally { setSaving(false) }
  }

  return (
    <Sheet open={current != null} onOpenChange={(o) => !o && close()}
      title={state.mode === 'edit' ? 'แก้รายการ' : 'เพิ่มรายการ'}
      actions={state.mode === 'edit' ? <Button variant="ghost" className="h-11 text-critical" onClick={() => { onRemove(state.line); close() }}>ลบ</Button> : undefined}
      footer={<div className="grid grid-cols-[1fr_1.6fr] gap-2"><Button variant="outline" className="h-12" onClick={close}>ยกเลิก</Button><Button className="h-12" disabled={!ready} onClick={submit}>{state.mode === 'edit' ? 'บันทึก' : 'เพิ่ม'}</Button></div>}>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          ชื่อรายการ
          <Input value={f.item} onChange={(e) => set({ item: e.target.value })} placeholder="เช่น Spotify" className="h-11" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          บัญชี / ที่มาเงิน (ไม่บังคับ)
          <Input value={f.account} onChange={(e) => set({ account: e.target.value })} placeholder="เช่น SCB/ออมทรัพย์" className="h-11" />
        </label>
        <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          หมวด
          <div className="flex flex-wrap gap-1.5">
            {known.map((c) => (
              <button key={c} type="button" onClick={() => set({ category: c, own: false })}
                className={cn('min-h-11 rounded-full border px-3 text-sm', !f.own && f.category === c ? 'border-primary bg-primary text-primary-foreground' : 'text-foreground')}>
                {CATEGORY_TH[c] ?? c}
              </button>
            ))}
            <button type="button" onClick={() => set({ own: true, category: known.includes(f.category) ? '' : f.category })}
              className={cn('min-h-11 rounded-full border border-dashed px-3 text-sm', f.own ? 'border-primary text-foreground' : 'text-muted-foreground')}>หมวดอื่น…</button>
          </div>
          {f.own && <Input autoFocus value={f.category} onChange={(e) => set({ category: e.target.value })} placeholder="ชื่อหมวด เช่น Pets" className="h-11" />}
        </div>
        <span className="text-xs text-muted-foreground">บาท / เดือน</span>
        <AmountField text={f.text} onText={(text) => set({ text })} unit="THB" min={0} label="ยอดต่อเดือน" onEnter={submit}
          hint={income > 0 && type !== 'Income' && ok ? `${pct(value! / income)} ของรายรับ` : undefined} />
      </div>
    </Sheet>
  )
}
