import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { PageState } from '@/components/layout'
import { Sheet } from '@/components/mobile/sheet'
import { TopBarSlot } from '@/components/mobile/shell'
import { usePageRefresh } from '@/components/mobile/pull-to-refresh'
import { Card, CardContent } from '@/components/ui/card'
import { api, type Tax, type TaxLine, type TaxLinkedInput } from '@/lib/api'
import { money } from '@/lib/format'
import { useIsMobile } from '@/lib/use-is-mobile'
import { cn } from '@/lib/utils'
import type { Advice } from '@shared/tax'
import { buildView } from '@shared/tax-view'
import { AdviceCard, be, ReserveCard, ResultCard, TaxSectionCard, type TaxActions } from './tax-parts'
import { ResultBar, TaxLineSheet, type TaxSheetState } from './tax-mobile'
import { ScenarioPanel } from './tax-scenarios'

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function TaxPage() {
  const mobile = useIsMobile()
  const [data, setData] = useState<Tax | null>(null)
  const [error, setError] = useState<unknown>()
  const seq = useRef(0)
  const [mode, setMode] = useState<'real' | 'scenario'>('real')
  const [sheet, setSheet] = useState<TaxSheetState>(null)
  const [resultOpen, setResultOpen] = useState(false)

  useEffect(() => {
    api.tax().then(setData, setError)
  }, [])
  // a refresh answer that arrives after a newer write is dropped, like mutate's
  usePageRefresh(() => { const n = ++seq.current; return api.tax(data?.year).then((d) => { if (n === seq.current) setData(d) }) })

  async function mutate(call: Promise<Tax>, done?: string): Promise<boolean> {
    const n = ++seq.current
    try {
      const next = await call
      if (n === seq.current) setData(next)
      if (done) toast.success(done)
      return true
    } catch (e) {
      toast.error('บันทึกไม่ได้', { description: errMsg(e) })
      api.tax(data?.year).then((d) => n === seq.current && setData(d), () => {})
      return false
    }
  }

  if (!data) return <PageState error={error} />
  const view = buildView(data)
  const year = data.year

  // show the typed value at once; the server's answer replaces it
  const patch = (l: TaxLine, p: Partial<TaxLine>) => setData((d) => d && { ...d, lines: d.lines.map((x) => (x === l ? { ...x, ...p } : x)) })
  const actions: TaxActions = {
    saveLinked: (l: TaxLine, v: TaxLinkedInput) => { patch(l, v); return mutate(api.setTaxBudgetLine(year, l.budget!.lineId, v)) },
    saveTyped: (l, p) => {
      patch(l, { ...(p.label != null ? { label: p.label } : {}), ...(p.thb != null ? { paid: p.thb, paidExpr: p.expr ?? null } : {}) })
      return mutate(api.updateTaxLine(l.id!, p))
    },
    remove: (l) => {
      mutate(api.deleteTaxLine(l.id!))
      toast(`ลบ ${l.label} แล้ว`, { action: { label: 'เลิกทำ', onClick: () => mutate(api.addTaxLine(year, { kind: l.kind, label: l.label, thb: l.paid, expr: l.paidExpr })) } })
    },
    add: (v) => mutate(api.addTaxLine(year, v)),
  }
  const saveReserve = (v: { thb: number; expr: string | null; asOf: string | null }) => {
    setData((d) => d && { ...d, reserve: { ...d.reserve, ...v } })
    mutate(api.setTaxReserve(year, v))
  }
  const tryAdvice = async (a: Advice) => {
    if (await mutate(api.addTaxScenario(year, { name: `${a.label} เพิ่ม ${money(a.room)}`, changes: [{ kind: a.kind, thb: a.room }] }))) setMode('scenario')
  }
  const modeTabs = (
    <div className={cn('inline-flex rounded-2xl bg-muted p-1 text-sm', mobile && 'flex w-full')} role="tablist" aria-label="มุมมอง">
      {([['real', 'ตัวเลขจริง'], ['scenario', `ฉากทัศน์${data.scenarios.length ? ` ${data.scenarios.length}` : ''}`]] as const).map(([id, label]) => (
        <button key={id} type="button" role="tab" aria-selected={mode === id} onClick={() => setMode(id)}
          className={cn('rounded-xl px-4 py-1.5 transition-colors', mobile && 'min-h-11 flex-1 px-2', mode === id ? 'bg-card font-medium shadow-[var(--card-shadow)]' : 'text-muted-foreground hover:text-foreground')}>
          {label}
        </button>
      ))}
    </div>
  )

  return (
    <div className={cn('flex flex-col gap-6', mobile && mode === 'real' && 'pb-20')}>
      {mobile
        ? <TopBarSlot below={modeTabs} />
        : (
          <section className="flex items-end justify-between gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">ภาษีเงินได้บุคคลธรรมดา · ประมาณการ</span>
              <h1 className="text-3xl font-semibold tracking-tight">ปีภาษี {be(year)}</h1>
            </div>
            {modeTabs}
          </section>
        )}
      {mode === 'real' && (<>
      {!data.lines.length && (
        <Card>
          <CardContent className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">เริ่มได้ 2 ทาง</span>
            <span className="text-muted-foreground">1) ไปที่ <Link to="/planning" className="font-medium text-foreground underline underline-offset-2">แผนเงิน</Link> ชุด ปัจจุบัน แล้วเลือก "ภาษี: …" ที่แถวเงินเดือน ค่าเช่า RMF PVD ประกัน — ยอดทั้งปีจะตามงบให้เอง</span>
            <span className="text-muted-foreground">2) กด "เพิ่มเงินได้" หรือ "เพิ่มรายการ" ในแต่ละหมวดด้านล่าง เพื่อกรอกยอดทั้งปีเอง</span>
          </CardContent>
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-12 lg:items-start">
        <div className="flex flex-col gap-4 lg:col-span-7">
          {view.sections.map((sv) => <TaxSectionCard key={sv.section} sv={sv} tax={data} view={view} actions={actions}
            onOpen={mobile ? (row) => setSheet({ mode: 'edit', row }) : undefined} onNew={mobile ? (section) => setSheet({ mode: 'add', section }) : undefined} />)}
        </div>
        {!mobile && (
          <div className="flex flex-col gap-4 lg:sticky lg:top-20 lg:col-span-5">
            <ResultCard view={view} />
            <ReserveCard tax={data} view={view} onSave={saveReserve} />
            <AdviceCard view={view} onTry={tryAdvice} />
          </div>
        )}
      </div>
      </>)}
      {mode === 'scenario' && (
        <ScenarioPanel tax={data} view={view}
          onAdd={(s) => mutate(api.addTaxScenario(year, s))}
          onUpdate={(id, s) => { mutate(api.updateTaxScenario(id, s)) }}
          onDelete={(id) => { mutate(api.deleteTaxScenario(id)) }}
          onApply={async (id) => { if (await mutate(api.applyTaxScenario(id), 'เพิ่มเข้าตัวเลขจริงแล้ว')) setMode('real') }} />
      )}
      <p className="text-xs text-muted-foreground">ประมาณการจากข้อมูลที่กรอก ตรวจกับกรมสรรพากรก่อนยื่นจริง</p>
      {mobile && mode === 'real' && <ResultBar view={view} onOpen={() => setResultOpen(true)} />}
      {mobile && (
        <Sheet open={resultOpen} onOpenChange={setResultOpen} title={`ภาษีปี ${be(year)}`}>
          <div className="flex flex-col gap-3 pb-2">
            <ResultCard view={view} />
            <ReserveCard tax={data} view={view} onSave={saveReserve} />
            <AdviceCard view={view} onTry={async (a) => { setResultOpen(false); await tryAdvice(a) }} />
          </div>
        </Sheet>
      )}
      {mobile && <TaxLineSheet state={sheet} tax={data} view={view} actions={actions} onClose={() => setSheet(null)} />}
    </div>
  )
}
