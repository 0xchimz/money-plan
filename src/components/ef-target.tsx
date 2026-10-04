import { useState } from 'react'
import { Link } from 'react-router'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { readAmount } from '@/components/mobile/amount-field'
import { Sheet } from '@/components/mobile/sheet'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { api, type EfMode, type EfTarget } from '@/lib/api'
import { isFormula } from '@/lib/expr'
import { money } from '@/lib/format'
import { useIsMobile } from '@/lib/use-is-mobile'
import { cn } from '@/lib/utils'
import { EF_MONTHS_MAX } from '@shared/planning'

const MODES: { value: EfMode; label: string }[] = [{ value: 'plan', label: 'ตามแผนตกงาน' }, { value: 'custom', label: 'กรอกเอง' }]

export function EfTargetButton({ onClick }: { onClick: () => void }) {
  return <Button variant="outline" size="xs" className="max-lg:h-11 max-lg:px-3" onClick={onClick}><Pencil /> ตั้งเป้า</Button>
}

/** Editor for the emergency-fund target: under the card on desktop, a sheet on a phone */
export function EfTargetEditor({ open, target, planMonthly, onClose, onSaved }: {
  open: boolean
  target: EfTarget
  /** ตกงาน plan's expenses per month; 0 = no plan yet */
  planMonthly: number
  onClose: () => void
  onSaved: (t: EfTarget) => void
}) {
  const mobile = useIsMobile()
  const form = <EfTargetForm target={target} planMonthly={planMonthly} onCancel={onClose} onSaved={onSaved} />
  if (mobile) {
    return <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="เป้าเงินสำรองฉุกเฉิน" description="จำนวนเดือน × ยอดต่อเดือน">{form}</Sheet>
  }
  return open ? <Card size="sm"><CardContent>{form}</CardContent></Card> : null
}

function EfTargetForm({ target, planMonthly, onCancel, onSaved }: { target: EfTarget; planMonthly: number; onCancel: () => void; onSaved: (t: EfTarget) => void }) {
  const [mode, setMode] = useState<EfMode>(target.mode)
  const [monthsText, setMonthsText] = useState(String(target.months))
  // a first typed amount starts from the plan's number
  const [monthlyText, setMonthlyText] = useState(target.expr ?? (target.monthly != null ? String(target.monthly) : planMonthly > 0 ? String(planMonthly) : ''))
  const [busy, setBusy] = useState(false)

  const months = /^\d+$/.test(monthsText.trim()) ? Number(monthsText) : NaN
  const monthsOk = months >= 1 && months <= EF_MONTHS_MAX
  const typed = readAmount(monthlyText)
  const typedOk = typed.value != null && typed.value > 0
  const monthly = mode === 'plan' ? (planMonthly > 0 ? planMonthly : null) : typedOk ? typed.value : null
  const valid = monthsOk && (mode === 'plan' || typedOk)

  const save = async () => {
    if (!valid || busy) return
    setBusy(true)
    try {
      onSaved(await api.setEfTarget(mode === 'plan' ? { mode, months } : { mode, months, monthly: typed.value!, expr: typed.expr }))
      toast.success('บันทึกเป้าแล้ว')
    } catch (e) {
      toast.error('บันทึกไม่ได้', { description: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }
  const onEnter = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); save() } }

  return (
    <div className="flex flex-col gap-3">
      <div className="inline-flex self-start rounded-xl bg-muted p-1 text-sm max-lg:flex max-lg:self-stretch" role="tablist" aria-label="ที่มาของยอดต่อเดือน">
        {MODES.map((m) => (
          <button key={m.value} type="button" role="tab" aria-selected={m.value === mode} onClick={() => setMode(m.value)}
            className={cn('rounded-lg px-3 py-1 transition-colors max-lg:min-h-11 max-lg:flex-1', m.value === mode ? 'bg-card font-medium shadow-[var(--card-shadow)]' : 'text-muted-foreground hover:text-foreground')}>
            {m.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Input inputMode="numeric" autoComplete="off" aria-label="จำนวนเดือน" aria-invalid={!monthsOk} value={monthsText}
          onChange={(e) => setMonthsText(e.target.value)} onFocus={(e) => e.currentTarget.select()} onKeyDown={onEnter} className="tabular w-16 text-right max-lg:h-11" />
        <span>เดือน ×</span>
        {mode === 'plan'
          ? planMonthly > 0
            ? <><span className="tabular font-medium">{money(planMonthly)}</span><span className="text-muted-foreground">ต่อเดือน · รายจ่ายชุดตกงาน (แก้ที่ <Link to="/planning" className="underline underline-offset-2">Planning</Link>)</span></>
            : <span className="text-muted-foreground">รายจ่ายชุดตกงาน — ยังไม่มี ตั้งที่ <Link to="/planning" className="underline underline-offset-2">Planning</Link> หรือเลือก กรอกเอง</span>
          : (
            <>
              <Input inputMode="decimal" autoComplete="off" aria-label="ยอดต่อเดือน" aria-invalid={!typedOk} placeholder="0.00" value={monthlyText}
                onChange={(e) => setMonthlyText(e.target.value)} onFocus={(e) => e.currentTarget.select()} onKeyDown={onEnter} className="tabular w-40 text-right max-lg:h-11" />
              <span className="text-muted-foreground">บาทต่อเดือน{typedOk && isFormula(monthlyText) ? ` = ${money(typed.value!)}` : ''}</span>
            </>
          )}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-3 text-sm">
        {!monthsOk
          ? <span className="text-critical">จำนวนเดือนต้องเป็นเลขเต็ม 1–{EF_MONTHS_MAX}</span>
          : monthly != null
            ? <span>เป้า = <b className="tabular">{money(months * monthly)}</b> <span className="text-muted-foreground">· {mode === 'plan' ? 'เปลี่ยนตามแผนตกงานเอง' : 'ไม่เปลี่ยนตามแผน'}</span></span>
            : <span className="text-muted-foreground">{mode === 'plan' ? 'จะเห็นเป้าเมื่อชุดตกงานมีรายจ่าย' : 'ใส่ยอดต่อเดือนมากกว่า 0'}</span>}
        <div className="ml-auto flex gap-2 max-lg:w-full">
          <Button variant="ghost" size="sm" className="max-lg:h-11 max-lg:flex-1" onClick={onCancel}>ยกเลิก</Button>
          <Button size="sm" className="max-lg:h-11 max-lg:flex-1" disabled={!valid || busy} onClick={save}>บันทึก</Button>
        </div>
      </div>
    </div>
  )
}
