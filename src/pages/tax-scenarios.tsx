import { useState } from 'react'
import { CircleAlert, Plus, Trash, X } from 'lucide-react'
import { MoneyInput } from '@/components/money-input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import type { Tax, TaxChange, TaxScenario } from '@/lib/api'
import { money, pct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { scenarioSummary, type TaxResult } from '@shared/tax'
import { kindOf, SECTION_TH } from '@shared/tax-rules'
import type { TaxView } from '@shared/tax-view'

const dueText = (r: TaxResult) => (r.due < 0 ? `ได้คืน ${money(-r.due)}` : `จ่าย ${money(r.due)}`)
const signedMoney = (v: number) => `${v >= 0 ? '+' : '−'}${money(Math.abs(v))}`

/** Name + the list of changes of one scenario. Rows with no amount yet stay here and are not sent. */
function ScenarioEditor({ scenario, view, capped, onUpdate, onDelete, onApply }: {
  scenario: TaxScenario; view: TaxView; capped: string[]
  onUpdate: (id: number, s: { name?: string; changes?: TaxChange[] }) => Promise<boolean>
  onDelete: (id: number) => void
  onApply: (id: number) => void
}) {
  const [name, setName] = useState(scenario.name)
  const [draft, setDraft] = useState<TaxChange[]>(scenario.changes)
  const kinds = view.rules.kinds.filter((k) => k.auto == null && k.section !== 'reserve')
  const sections = [...new Set(kinds.map((k) => k.section))]
  const commit = async (next: TaxChange[]) => {
    setDraft(next)
    if (!(await onUpdate(scenario.id, { changes: next.filter((c) => c.thb !== 0) }))) setDraft(scenario.changes)
  }
  const hasCut = draft.some((c) => c.thb < 0)
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 text-sm">
        <Input aria-label="ชื่อฉากทัศน์" value={name} onChange={(e) => setName(e.target.value)} className="font-semibold max-lg:h-11 max-lg:text-base"
          onBlur={async () => { const v = name.trim(); if (v && v !== scenario.name) { if (!(await onUpdate(scenario.id, { name: v }))) setName(scenario.name) } else setName(scenario.name) }} />
        {draft.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <select aria-label="ชนิดที่เปลี่ยน" value={c.kind} onChange={(e) => commit(draft.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)))}
              className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-2 text-sm max-lg:h-11 max-lg:text-base">
              {sections.map((s) => (
                <optgroup key={s} label={SECTION_TH[s]}>{kinds.filter((k) => k.section === s).map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}</optgroup>
              ))}
            </select>
            <MoneyInput value={c.thb} label="ยอดที่เพิ่มหรือลด" className="w-36 shrink-0 rounded-lg border border-input max-lg:[&_input]:h-11 max-lg:[&_input]:text-base"
              onCommit={(thb) => commit(draft.map((x, j) => (j === i ? { ...x, thb } : x)))} />
            <Button type="button" variant="ghost" size="icon-xs" aria-label="เอารายการนี้ออก" className="max-lg:size-11" onClick={() => commit(draft.filter((_, j) => j !== i))}><X /></Button>
          </div>
        ))}
        {draft.some((c) => c.thb === 0) && <span className="text-xs text-muted-foreground">ใส่ยอดที่เพิ่ม (หรือติดลบเพื่อลด) รายการที่ยอดเป็น 0 ยังไม่ถูกนับ</span>}
        {capped.length > 0 && (
          <span className="flex items-start gap-2 text-xs text-warning">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            เกินเพดาน ส่วนเกินไม่ถูกนับ: {capped.map((k) => kindOf(view.rules, k)?.label).join(', ')}
          </span>
        )}
        <button type="button" disabled={draft.length >= 20} onClick={() => setDraft([...draft, { kind: view.advice[0]?.kind ?? 'ded_rmf', thb: 0 }])}
          className="min-h-11 self-start text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50">+ เพิ่มรายการที่เปลี่ยน</button>
        <div className="flex flex-wrap gap-2 border-t pt-3">
          <Button type="button" variant="outline" size="sm" className="max-lg:h-11" disabled={hasCut || !draft.some((c) => c.thb > 0)}
            onClick={() => { if (window.confirm(`เพิ่มรายการของ "${scenario.name}" เข้าตัวเลขจริง แล้วลบฉากทัศน์นี้?`)) onApply(scenario.id) }}>
            ใช้ฉากทัศน์นี้เป็นตัวเลขจริง
          </Button>
          <Button type="button" variant="ghost" size="sm" className="text-critical max-lg:h-11" onClick={() => onDelete(scenario.id)}><Trash /> ลบ</Button>
        </div>
        {hasCut && <span className="text-xs text-muted-foreground">ฉากทัศน์ที่มีรายการลดยอด ใช้เป็นตัวเลขจริงไม่ได้ ให้ไปลดยอดที่รายการจริงเอง</span>}
      </CardContent>
    </Card>
  )
}

/** Real numbers next to every scenario; tap a column to edit that scenario */
export function ScenarioPanel({ tax, view, onAdd, onUpdate, onDelete, onApply }: {
  tax: Tax; view: TaxView
  onAdd: (s: { name: string; changes: TaxChange[] }) => Promise<boolean>
  onUpdate: (id: number, s: { name?: string; changes?: TaxChange[] }) => Promise<boolean>
  onDelete: (id: number) => void
  onApply: (id: number) => void
}) {
  const [sel, setSel] = useState<number | null>(null)
  const cols = tax.scenarios.map((s) => ({ s, sum: scenarioSummary(view.rules, view.amounts, s.changes) }))
  const current = cols.find((c) => c.s.id === sel) ?? cols.at(-1)   // nothing picked (or it was just deleted): the newest
  const real = view.result
  const rows: { label: string; real: string; of: (c: (typeof cols)[number]) => string; strong?: boolean; tone?: (c: (typeof cols)[number]) => string | undefined }[] = [
    { label: 'เงินได้สุทธิ', real: money(real.net), of: (c) => money(c.sum.result.net) },
    { label: 'ขั้นภาษี', real: pct(real.rate, 0), of: (c) => pct(c.sum.result.rate, 0) },
    { label: 'ภาษีทั้งปี', real: money(real.tax), of: (c) => money(c.sum.result.tax) },
    { label: 'จ่ายเพิ่ม / ได้คืน', real: dueText(real), of: (c) => dueText(c.sum.result), strong: true, tone: (c) => (c.sum.result.due < 0 ? 'text-good' : undefined) },
    { label: 'ภาษีลดลง', real: '–', of: (c) => signedMoney(c.sum.taxSaved), tone: (c) => (c.sum.taxSaved > 0 ? 'text-good' : c.sum.taxSaved < 0 ? 'text-critical' : undefined) },
    { label: 'เงินที่ต้องใช้', real: '–', of: (c) => money(c.sum.spend) },
    { label: 'เงินยังเป็นของเรา', real: '–', of: (c) => money(c.sum.kept) },
    { label: 'ผลสุทธิ', real: '–', of: (c) => signedMoney(c.sum.netGain), strong: true, tone: (c) => (c.sum.netGain > 0 ? 'text-good' : c.sum.netGain < 0 ? 'text-critical' : undefined) },
  ]
  return (
    <div className="grid gap-4 lg:grid-cols-12 lg:items-start">
      <Card className="py-2 lg:col-span-7">
        <div className="overflow-x-auto">
          <table className="tabular w-full text-sm">
            <thead>
              <tr>
                <th className="px-3 py-2" />
                <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">ตัวเลขจริง</th>
                {cols.map((c) => (
                  <th key={c.s.id} className={cn('p-0 text-right font-semibold whitespace-nowrap', c === current && 'bg-muted/60')}>
                    <button type="button" aria-pressed={c === current} onClick={() => setSel(c.s.id)} className="min-h-11 w-full px-3 py-2 text-right">{c.s.name}</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-t border-border/70">
                  <td className={cn('px-3 py-2 whitespace-nowrap text-muted-foreground', r.strong && 'font-semibold text-foreground')}>{r.label}</td>
                  <td className={cn('px-3 py-2 text-right whitespace-nowrap', r.strong && 'font-semibold')}>{r.real}</td>
                  {cols.map((c) => <td key={c.s.id} className={cn('px-3 py-2 text-right whitespace-nowrap', r.strong && 'font-semibold', c === current && 'bg-muted/60', r.tone?.(c))}>{r.of(c)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!cols.length && <p className="px-4 py-3 text-sm text-muted-foreground">ยังไม่มีฉากทัศน์ — ลองเพิ่ม/ลดยอดโดยไม่แตะตัวเลขจริง เช่น "RMF เพิ่ม 100,000" เทียบกับ "บริจาค 2 เท่า 50,000"</p>}
        <p className="px-4 pt-2 pb-1 text-xs text-muted-foreground">ผลสุทธิ = ภาษีที่ลดลง − เงินที่ออกจากกระเป๋าจริง (เงินที่ลงกองทุนยังเป็นของเรา)</p>
      </Card>
      <div className="flex flex-col gap-4 lg:col-span-5">
        {current && <ScenarioEditor key={current.s.id} scenario={current.s} view={view} capped={current.sum.capped} onUpdate={onUpdate} onDelete={onDelete} onApply={onApply} />}
        <Button type="button" variant="outline" className="self-start max-lg:h-11"
          onClick={async () => { if (await onAdd({ name: `ฉากทัศน์ ${tax.scenarios.length + 1}`, changes: [] })) setSel(null) }}>
          <Plus /> ฉากทัศน์ใหม่
        </Button>
      </div>
    </div>
  )
}
