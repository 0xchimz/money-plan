import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ArrowDownRight, ArrowUpRight, CircleAlert, CircleCheck, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { AllocationBullets, DivergingList, MultiLines, NetWorthChart, RankedBars, StackedColumns } from '@/components/charts'
import { ChartCard, Legend, ToggleLegend } from '@/components/chart-card'
import { PageState } from '@/components/layout'
import { Sheet } from '@/components/mobile/sheet'
import { ScrollX } from '@/components/mobile/scroll-x'
import { TopBarSlot } from '@/components/mobile/shell'
import { Sankey } from '@/components/sankey'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api, OTHER_COLOR, SERIES, TIER_COLOR, TIERS, type Overview, type Planning, type ScenarioId, type Tier, type TierTargets } from '@/lib/api'
import { CATEGORY_TH } from '@/lib/categories'
import { pct, signed, thb, thbCompact, thMonth } from '@/lib/format'
import { useIsMobile } from '@/lib/use-is-mobile'
import { cn } from '@/lib/utils'
import { efStatus, totals, type EfStatus, type Totals } from '@shared/planning'
import { FLOW_COLOR, moneyFlow } from '@shared/sankey'
import { BalanceSheetList, FlowBars } from './overview-mobile'

const th = (c: string) => CATEGORY_TH[c] ?? c

export function OverviewPage() {
  const [o, setO] = useState<Overview | null>(null)
  const [p, setP] = useState<Planning | null>(null)
  const [error, setError] = useState<unknown>()
  useEffect(() => {
    Promise.all([api.overview(), api.planning()]).then(([a, b]) => { setO(a); setP(b) }, setError)
  }, [])
  if (!o || !p) return <PageState error={error} />
  if (!o.month) return <Onboarding checklist={o.checklist} />

  const lines = (id: ScenarioId) => p.scenarios.find((s) => s.id === id)?.lines ?? []
  const mainT = totals(lines('main'))
  const ef = efStatus(o.ef, totals(lines('em')))
  const history = o.netHistory.length >= 2
  return (
    <div className="flex flex-col gap-6">
      <TopBarSlot><span className="truncate text-xs text-muted-foreground">ปิดล่าสุด {thMonth(o.month)}</span></TopBarSlot>
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:gap-4">
        <NetWorthHero o={o} className="lg:col-span-7" />
        <div className="grid grid-cols-2 gap-3 lg:col-span-5 lg:grid-cols-1">
          <SavingTile t={mainT} />
          <EfTile ef={ef} />
          <DebtTile o={o} />
        </div>
      </section>

      <MoneyFlowCard planning={p} />

      {history && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
          <ChartCard
            className="lg:col-span-7"
            title="สินทรัพย์ vs หนี้ รายเดือน"
            description={`ปิดแล้ว ${o.netHistory.length} เดือน · ใหม่สุดอยู่ซ้าย`}
            legend={<Legend items={[{ label: 'สินทรัพย์', color: 'var(--chart-1)' }, { label: 'หนี้สิน', color: 'var(--chart-2)' }, { label: 'สุทธิ', color: 'var(--chart-3)', line: true, value: thb(o.netWorth) }]} />}
            chart={<ScrollX count={o.netHistory.length}><NetWorthChart data={o.netHistory} /></ScrollX>}
            table={<NetTable rows={o.netHistory} />}
          />
          <Card className="lg:col-span-5">
            <CardHeader>
              <CardTitle>เดือนนี้เปลี่ยนเพราะอะไร</CardTitle>
              <CardDescription>ผลต่อความมั่งคั่งสุทธิ แยกหมวด เทียบ {thMonth(o.prev!.month)} · หนี้ลด = บวก</CardDescription>
            </CardHeader>
            <CardContent>
              {o.contributions.length
                ? <DivergingList rows={o.contributions.map((c) => ({ label: th(c.label), value: c.value }))} format={thbCompact} posLabel="เพิ่ม" negLabel="ลด" />
                : <p className="text-sm text-muted-foreground">ไม่มีหมวดไหนเปลี่ยน</p>}
            </CardContent>
          </Card>
        </div>
      )}

      {history && <AssetMixCard o={o} />}
      {o.investments.length > 0 && <PortfolioSection o={o} onChange={setO} />}
      <BalanceSheetCard o={o} />
    </div>
  )
}

// ---- first visit: three steps (mockup 1-onboarding.html, option A) ----

function Onboarding({ checklist }: { checklist: Overview['checklist'] }) {
  const steps = [
    { done: checklist.planning, title: 'วางแผนเงินรายเดือน', sub: 'รายรับ · ออม/ลงทุน · รายจ่าย', to: '/planning', cta: 'ไป Planning' },
    { done: checklist.balanceStarted, title: 'กรอกงบดุลเดือนแรก', sub: 'เงินในบัญชี กองทุน หนี้ ณ วันนี้', to: '/balance', cta: 'ไป Balance' },
    { done: checklist.closed, title: 'ปิดเดือน', sub: 'กราฟสรุปจะขึ้นในหน้านี้', to: '/balance', cta: 'ไปปิดเดือน' },
  ]
  const next = steps.findIndex((s) => !s.done)
  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="finance-hero lg:col-span-8">
          <CardContent className="flex flex-col gap-4 py-2">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">ยินดีต้อนรับ</h1>
              <p className="text-sm text-muted-foreground">เริ่มใช้ 3 ขั้น แล้วหน้านี้จะสรุปการเงินของคุณให้</p>
            </div>
            <ol className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              {steps.map((s, i) => (
                <li key={s.title} className={cn('flex flex-col gap-1 rounded-xl border bg-card p-3', !s.done && i !== next && 'opacity-60')}>
                  <span className="flex items-center gap-2 font-medium">
                    {s.done
                      ? <CircleCheck className="size-5 text-good" aria-label="เสร็จแล้ว" />
                      : <span className="grid size-5 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{i + 1}</span>}
                    {s.title}
                  </span>
                  <span className="text-sm text-muted-foreground">{s.sub}</span>
                  {!s.done && <Link to={s.to} className={cn(buttonVariants({ size: 'sm', variant: i === next ? 'default' : 'outline' }), 'mt-1 self-start')}>{s.cta}</Link>}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
        <Card className="lg:col-span-4">
          <CardHeader><CardTitle>หน้านี้จะมีอะไร</CardTitle></CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
              <li>Net worth และการเปลี่ยนแปลงรายเดือน</li>
              <li>เงินเดือนไปไหน (จาก Planning)</li>
              <li>สัดส่วนสินทรัพย์ หนี้ต่อสินทรัพย์ เงินสำรอง</li>
              <li>พอร์ตลงทุนเทียบเป้า (ถ้าใส่กลุ่มพอร์ต)</li>
            </ul>
          </CardContent>
        </Card>
      </section>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GhostChart label="Net worth ตามเวลา" />
        <GhostChart label="สัดส่วนสินทรัพย์" />
      </div>
    </div>
  )
}

function GhostChart({ label }: { label: string }) {
  return (
    <div className="grid h-40 place-items-center rounded-xl border border-dashed text-sm text-muted-foreground [background:repeating-linear-gradient(90deg,var(--muted)_0_12px,transparent_12px_24px)]">
      {label} จะขึ้นหลังปิดเดือนแรก
    </div>
  )
}

// ---- top row ----

function NetWorthHero({ o, className }: { o: Overview; className?: string }) {
  const h = o.netHistory
  const change = o.prev ? o.netWorth - o.prev.netWorth : null
  const span = h.length >= 2 ? h[0].net - h[h.length - 1].net : null
  return (
    <Card className={cn('finance-hero', className)}>
      <CardContent className="flex h-full flex-col gap-3 py-2">
        <span className="text-sm text-muted-foreground">ความมั่งคั่งสุทธิ · Net worth · {thMonth(o.month!, true)}</span>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="tabular text-4xl font-semibold lg:text-5xl tracking-tight">{thb(o.netWorth)}</span>
          {change != null && <Change value={change} base={o.prev!.netWorth} label={`จาก ${thMonth(o.prev!.month)}`} />}
        </div>
        {h.length >= 2 && <Sparkline values={[...h].reverse().map((r) => r.net)} />}
        {span != null && (
          <span className="text-sm text-muted-foreground">
            {h.length - 1} เดือนที่ผ่านมา {signed(span, thb)} · เฉลี่ย {signed(span / (h.length - 1), thb)} / เดือน
          </span>
        )}
      </CardContent>
    </Card>
  )
}

function Change({ value, base, label }: { value: number; base: number; label: string }) {
  if (Math.abs(value) < 0.5) return <span className="text-sm text-muted-foreground">ไม่เปลี่ยน {label}</span>
  const up = value > 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className={cn('tabular inline-flex items-center gap-1 text-sm font-medium', up ? 'text-good' : 'text-critical')}>
      <Icon className="size-4" aria-hidden />
      {signed(value, thb)}{base ? ` (${signed(value / Math.abs(base), (n) => pct(n))})` : ''}
      <span className="font-normal text-muted-foreground">{label}</span>
    </span>
  )
}

/** Net worth over the closed months, oldest → newest, no axes */
function Sparkline({ values }: { values: number[] }) {
  const w = 300, h = 48
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 4 - ((v - min) / span) * (h - 8)).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-12 w-full" role="img" aria-label="แนวโน้ม net worth">
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill="var(--chart-1)" fillOpacity={0.12} />
      <polyline points={pts} fill="none" stroke="var(--foreground)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function Tile({ label, value, share, color, sub, className }: { label: string; value: ReactNode; share?: number; color?: string; sub: ReactNode; className?: string }) {
  return (
    <Card size="sm" className={className}>
      <CardContent className="flex flex-col gap-1.5">
        <div className="flex flex-col gap-0.5 lg:flex-row lg:items-baseline lg:justify-between lg:gap-2">
          <span className="text-sm text-muted-foreground">{label}</span>
          <span className="tabular">{value}</span>
        </div>
        {share != null && (
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full" style={{ width: `${Math.min(Math.max(share, 0), 1) * 100}%`, background: color }} />
          </div>
        )}
        <span className="text-xs text-muted-foreground">{sub}</span>
      </CardContent>
    </Card>
  )
}

function SavingTile({ t }: { t: Totals }) {
  if (t.income <= 0) {
    return <Tile label="ออม + ลงทุนต่อเดือน" value="—" sub={<>ใส่รายรับใน <Link to="/planning" className="underline underline-offset-2">Planning</Link> แล้วจะเห็นอัตราการออม</>} />
  }
  const saved = t.saving + t.invest
  return (
    <Tile label="ออม + ลงทุนต่อเดือน" value={<><b>{thb(saved)}</b> <span className="text-muted-foreground">/ {thb(t.income)}</span></>}
      share={saved / t.income} color="var(--chart-3)" sub={`${pct(saved / t.income)} ของรายได้ · จาก Planning (ปัจจุบัน)`} />
  )
}

function EfTile({ ef }: { ef: EfStatus }) {
  if (ef.target == null) {
    return <Tile label="เงินสำรองฉุกเฉิน" value={<b>{thb(ef.thb)}</b>} sub={<>ตั้งชุด "ตกงาน" ใน <Link to="/planning" className="underline underline-offset-2">Planning</Link> แล้วจะเห็นเป้า</>} />
  }
  return (
    <Tile label="เงินสำรองฉุกเฉิน" value={<><b>{ef.months!.toFixed(1)}</b> <span className="text-muted-foreground">/ 6 เดือน</span></>}
      share={ef.thb / ef.target} color="var(--chart-1)"
      sub={`${thb(ef.thb)} จากเป้า ${thb(ef.target)} (6 × รายจ่ายตอนตกงาน)${ef.netMonths != null && Math.abs(ef.netMonths - ef.months!) > 0.05 ? ` · หักรายรับที่ยังได้ อยู่ได้ ${ef.netMonths.toFixed(1)} เดือน` : ''}`} />
  )
}

function DebtTile({ o }: { o: Overview }) {
  const ratio = o.totalAssets ? o.totalLiabilities / o.totalAssets : 0
  return (
    <Tile className="col-span-2 lg:col-span-1" label="หนี้ต่อสินทรัพย์" value={<b>{pct(ratio)}</b>} share={ratio} color="var(--chart-2)"
      sub={`หนี้ ${thb(o.totalLiabilities)} · สินทรัพย์ ${thb(o.totalAssets)}`} />
  )
}

// ---- where the salary goes (Sankey like the portfolio Flow page) ----

function Segmented<T extends string>({ value, onChange, options, label, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string; className?: string }) {
  return (
    <div className={cn('inline-flex rounded-lg border p-0.5 text-xs', className)} role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} onClick={() => onChange(o.value)}
          className={cn('rounded-md px-2.5 py-1 transition-colors max-lg:min-h-11', o.value === value ? 'bg-primary font-medium text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function MoneyFlowCard({ planning }: { planning: Planning }) {
  const [id, setId] = useState<ScenarioId>('main')
  const sc = planning.scenarios.find((s) => s.id === id) ?? planning.scenarios[0]
  const flow = moneyFlow(sc.lines, th)
  const t = totals(sc.lines)
  const share = (v: number) => (t.income ? ` · ${pct(v / t.income, 0)}` : '')
  const mobile = useIsMobile()
  if (mobile) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>เงินเดือนไปไหน</CardTitle>
          <CardDescription>{flow ? `รายรับ ${thb(flow.income)} / เดือน · แตะกลุ่มเพื่อดูรายการ` : `ยังไม่มีรายรับในชุด ${sc.name}`}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Segmented value={sc.id} onChange={setId} label="ชุดงบ" className="w-full *:min-h-11 *:flex-1" options={planning.scenarios.map((s) => ({ value: s.id, label: s.name }))} />
          {flow ? <FlowBars flow={flow} /> : <span className="py-4 text-center text-sm text-muted-foreground">ใส่รายรับในชุด "{sc.name}" แล้วภาพนี้จะขึ้น</span>}
          {t.left < -0.5 && <p className="flex items-center gap-2 text-sm text-critical"><CircleAlert className="size-4" aria-hidden />จัดสรรเกินรายรับ {thb(-t.left)} / เดือน</p>}
          <Link to="/planning" className={cn(buttonVariants({ variant: 'outline' }), 'h-11')}>แก้ใน Planning →</Link>
        </CardContent>
      </Card>
    )
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>เงินเดือนไปไหน</CardTitle>
        <CardDescription>
          {flow ? `Planning · รายรับ ${thb(flow.income)} / เดือน → รายจ่าย / ออม / ลงทุน → แต่ละหมวด · ชี้ที่เส้นเพื่อดูยอดและรายการย่อย` : `ยังไม่มีรายรับในชุด ${sc.name}`}
        </CardDescription>
        <CardAction className="flex items-center gap-2">
          <Segmented value={sc.id} onChange={setId} label="ชุดงบ" options={planning.scenarios.map((s) => ({ value: s.id, label: s.name }))} />
          <Link to="/planning" className={buttonVariants({ variant: 'outline', size: 'sm' })}>แก้ใน Planning →</Link>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {flow
          ? (
            <>
              <Sankey nodes={flow.nodes} links={flow.links} format={thbCompact} height={360} label={`รายรับ ${thb(flow.income)} ต่อเดือน ชุด ${sc.name}`} />
              <Legend items={[
                { label: 'รายจ่าย', color: FLOW_COLOR.expense, value: `${thb(t.expense)}${share(t.expense)}` },
                { label: 'ออม', color: FLOW_COLOR.saving, value: `${thb(t.saving)}${share(t.saving)}` },
                { label: 'ลงทุน', color: FLOW_COLOR.invest, value: `${thb(t.invest)}${share(t.invest)}` },
                { label: 'ยังไม่จัดสรร', color: FLOW_COLOR.left, value: `${thb(Math.max(t.left, 0))}${share(Math.max(t.left, 0))}` },
              ]} />
              {t.left < -0.5 && (
                <p className="flex items-center gap-2 text-sm text-critical">
                  <CircleAlert className="size-4" aria-hidden />จัดสรรเกินรายรับ {thb(-t.left)} / เดือน — แก้ใน Planning
                </p>
              )}
            </>
          )
          : (
            <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
              ใส่รายรับในชุด "{sc.name}" แล้วภาพนี้จะขึ้น
              <Link to="/planning" className={buttonVariants({ size: 'sm' })}>ไป Planning</Link>
            </div>
          )}
      </CardContent>
    </Card>
  )
}

// ---- history ----

function NetTable({ rows }: { rows: Overview['netHistory'] }) {
  return (
    <Table>
      <TableHeader><TableRow><TableHead>เดือน</TableHead><TableHead className="text-right">สินทรัพย์</TableHead><TableHead className="text-right">หนี้สิน</TableHead><TableHead className="text-right">สุทธิ</TableHead></TableRow></TableHeader>
      <TableBody className="tabular">
        {rows.map((r) => (
          <TableRow key={r.month}>
            <TableCell>{r.label}</TableCell>
            <TableCell className="text-right">{thb(r.assets)}</TableCell>
            <TableCell className="text-right">{thb(r.liabilities)}</TableCell>
            <TableCell className="text-right font-medium">{thb(r.net)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

type CatRow = { label: string; live: boolean; month: string } & Record<string, any>
const FOLD = 'หมวดอื่น'

/** Asset categories over time, filterable; Lines mode compares each category's growth on its own */
function AssetMixCard({ o }: { o: Overview }) {
  // a fixed colour per category by today's size; the tail (and anything no longer held) folds into หมวดอื่น
  const cats = o.balance.assets.map((a) => th(a.category))
  const top = cats.length > 8 ? cats.slice(0, 7) : cats
  const rows: CatRow[] = o.categoryHistory.map((r) => {
    const row: CatRow = { label: r.label, live: false, month: r.month }
    for (const [k, v] of Object.entries(r.values)) {
      const key = top.includes(th(k)) ? th(k) : FOLD
      row[key] = (row[key] ?? 0) + v
    }
    return row
  })
  const series = [...top.map((c, i) => ({ key: c, color: SERIES[i] })), ...(rows.some((r) => FOLD in r) ? [{ key: FOLD, color: OTHER_COLOR }] : [])]
  const [active, setActive] = useState(() => series.map((c) => c.key))
  const [mode, setMode] = useState<'stacked' | 'lines'>('stacked')
  const shown = series.filter((c) => active.includes(c.key))
  const total = (r: CatRow) => shown.reduce((s, c) => s + (r[c.key] ?? 0), 0)
  return (
    <ChartCard
      title="สัดส่วนสินทรัพย์ตามเวลา"
      description={`${shown.length < series.length ? `${shown.length} จาก ${series.length} หมวด` : 'สินทรัพย์ทุกหมวด'} · ใหม่สุดอยู่ซ้าย · กดชื่อหมวดเพื่อซ่อน`}
      legend={
        <div className="flex flex-wrap items-start justify-between gap-2 lg:flex-nowrap">
          <ToggleLegend items={series.map((c) => ({ label: c.key, color: c.color }))} active={active} onChange={setActive} />
          <Segmented value={mode} onChange={setMode} label="แบบกราฟ" options={[{ value: 'stacked', label: 'ซ้อน' }, { value: 'lines', label: 'เส้น' }]} />
        </div>
      }
      chart={<ScrollX count={rows.length}>{mode === 'stacked' ? <StackedColumns data={rows} series={shown} /> : <MultiLines data={rows} series={shown} />}</ScrollX>}
      table={
        <Table>
          <TableHeader><TableRow><TableHead>เดือน</TableHead>{shown.map((c) => <TableHead key={c.key} className="text-right">{c.key}</TableHead>)}{shown.length > 1 && <TableHead className="text-right">รวม</TableHead>}</TableRow></TableHeader>
          <TableBody className="tabular">
            {rows.map((r) => (
              <TableRow key={r.month}>
                <TableCell>{r.label}</TableCell>
                {shown.map((c) => <TableCell key={c.key} className="text-right">{thbCompact(r[c.key] ?? 0)}</TableCell>)}
                {shown.length > 1 && <TableCell className="text-right font-medium">{thbCompact(total(r))}</TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      }
    />
  )
}

// ---- portfolio (only when items carry a tier) ----

function rank<T extends { thb: number }>(rows: T[], key: keyof T) {
  const m = new Map<string, number>()
  for (const r of rows) m.set(String(r[key]), (m.get(String(r[key])) ?? 0) + r.thb)
  return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
}

function RankCard({ title, description, rows, total, limit, className }: { title: string; description?: string; rows: { label: string; value: number; color?: string; sub?: string }[]; total: number; limit?: number; className?: string }) {
  return (
    <ChartCard
      className={className}
      title={title}
      description={description}
      chart={<RankedBars rows={rows} format={thbCompact} total={total} limit={limit} />}
      table={
        <Table>
          <TableBody className="tabular">
            {rows.map((r) => <TableRow key={r.label}><TableCell>{r.label}</TableCell><TableCell className="text-right">{thb(r.value)}</TableCell><TableCell className="text-right">{pct(r.value / total)}</TableCell></TableRow>)}
          </TableBody>
        </Table>
      }
    />
  )
}

function PortfolioSection({ o, onChange }: { o: Overview; onChange: (o: Overview) => void }) {
  const [editing, setEditing] = useState(false)
  const mobile = useIsMobile()
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-3 px-1 lg:flex-nowrap">
        <h2 className="text-xl font-semibold tracking-tight">พอร์ตลงทุน</h2>
        <span className="text-sm text-muted-foreground">{thb(o.investTotal)} · ใส่กลุ่มพอร์ตแล้ว {o.investments.length} รายการ</span>
        <Button variant="outline" size="sm" className="ml-auto max-lg:h-11" onClick={() => setEditing((x) => !x)}><Pencil /> แก้เป้า</Button>
      </div>
      {editing && !mobile && <TargetsEditor tiers={o.tiers} onCancel={() => setEditing(false)} onSaved={(next) => { onChange(next); setEditing(false) }} />}
      {mobile && (
        <Sheet open={editing} onOpenChange={setEditing} title="แก้เป้าพอร์ต" description="4 กลุ่มรวมกันต้องได้ 100%">
          <TargetsEditor tiers={o.tiers} onCancel={() => setEditing(false)} onSaved={(next) => { onChange(next); setEditing(false) }} />
        </Sheet>
      )}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <ChartCard
          className="lg:col-span-7"
          title="เทียบเป้า"
          description={`แท่ง = สัดส่วนตอนนี้ · ขีด = เป้า ${o.tiers.map((t) => pct(t.target, 0)).join(' / ')}`}
          chart={<AllocationBullets tiers={o.tiers} />}
          table={
            <Table>
              <TableHeader><TableRow><TableHead>กลุ่ม</TableHead><TableHead className="text-right">ยอด</TableHead><TableHead className="text-right">%</TableHead><TableHead className="text-right">เป้า</TableHead><TableHead className="text-right">ขาด / เกิน</TableHead></TableRow></TableHeader>
              <TableBody className="tabular">
                {o.tiers.map((t) => (
                  <TableRow key={t.tier}>
                    <TableCell>{t.tier}</TableCell>
                    <TableCell className="text-right">{thb(t.thb)}</TableCell>
                    <TableCell className="text-right">{pct(t.pct)}</TableCell>
                    <TableCell className="text-right">{pct(t.target, 0)}</TableCell>
                    <TableCell className="text-right">{signed(t.gap, thb)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          }
        />
        <div className="grid gap-6 lg:col-span-5">
          <RankCard title="ตามประเภท" rows={rank(o.investments, 'type')} total={o.investTotal} />
          <RankCard title="ตามประเทศ" rows={rank(o.investments, 'country')} total={o.investTotal} />
        </div>
      </div>
      <RankCard title="รายการใหญ่สุด" total={o.investTotal} limit={10}
        rows={o.investments.map((r) => ({ label: r.symbol, value: r.thb, color: TIER_COLOR[r.tier], sub: `${r.tier} · ${r.type} · ${r.country}` }))} />
    </section>
  )
}

/** Inline editor for the four tier targets (percent), saved only when they add up to 100% */
function TargetsEditor({ tiers, onCancel, onSaved }: { tiers: Overview['tiers']; onCancel: () => void; onSaved: (o: Overview) => void }) {
  const [v, setV] = useState<Record<Tier, string>>(() => Object.fromEntries(tiers.map((t) => [t.tier, String(Math.round(t.target * 1000) / 10)])) as Record<Tier, string>)
  const [busy, setBusy] = useState(false)
  const nums = TIERS.map((t) => Number(v[t]))
  const sum = nums.reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0)
  const valid = nums.every((n) => Number.isFinite(n) && n >= 0 && n <= 100) && Math.abs(sum - 100) < 0.1
  const save = async () => {
    setBusy(true)
    try {
      onSaved(await api.setTierTargets(Object.fromEntries(TIERS.map((t) => [t, Number(v[t]) / 100])) as TierTargets))
      toast.success('บันทึกเป้าแล้ว')
    } catch (e) {
      toast.error('บันทึกไม่ได้', { description: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card size="sm">
      <CardContent className="flex flex-wrap items-end gap-3">
        {TIERS.map((t) => (
          <label key={t} className="flex w-[calc(50%-0.375rem)] flex-col gap-1 text-xs text-muted-foreground lg:w-auto">
            {t} (%)
            <Input inputMode="decimal" value={v[t]} onChange={(e) => setV({ ...v, [t]: e.target.value })} className="w-full text-right lg:w-24" />
          </label>
        ))}
        <span className={cn('tabular pb-2 text-sm', valid ? 'text-muted-foreground' : 'text-critical')}>รวม {sum.toFixed(1)}%{valid ? '' : ' — ต้องได้ 100%'}</span>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" size="sm" className="max-lg:h-11" onClick={onCancel}>ยกเลิก</Button>
          <Button size="sm" className="max-lg:h-11" disabled={!valid || busy} onClick={save}>บันทึก</Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ---- balance sheet ----

function BalanceTable({ title, groups, total, base }: { title: string; groups: Overview['balance']['assets']; total: number; base: number }) {
  const share = (v: number) => pct(base ? v / base : 0)
  return (
    <Table>
      <TableHeader>
        <TableRow><TableHead>{title}</TableHead><TableHead className="text-right">บาท</TableHead><TableHead className="w-20 text-right">% สินทรัพย์</TableHead></TableRow>
      </TableHeader>
      <TableBody className="tabular">
        {groups.map((g) => (
          <Fragment key={g.category}>
            <TableRow className="font-medium">
              <TableCell>{th(g.category)}</TableCell>
              <TableCell className="text-right">{thb(g.thb)}</TableCell>
              <TableCell className="text-right">{share(g.thb)}</TableCell>
            </TableRow>
            {g.items.length > 1 && g.items.map((i) => (
              <TableRow key={`${g.category}/${i.item}`} className="text-muted-foreground">
                <TableCell className="pl-6">{i.item}</TableCell>
                <TableCell className="text-right">{thb(i.thb)}</TableCell>
                <TableCell />
              </TableRow>
            ))}
          </Fragment>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow><TableCell>รวม{title}</TableCell><TableCell className="text-right">{thb(total)}</TableCell><TableCell className="text-right">{share(total)}</TableCell></TableRow>
      </TableFooter>
    </Table>
  )
}

function BalanceSheetCard({ o }: { o: Overview }) {
  const mobile = useIsMobile()
  if (mobile) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>งบดุล · Balance sheet</CardTitle>
          <CardDescription>{thMonth(o.month!, true)} (เดือนล่าสุดที่ปิดแล้ว)</CardDescription>
        </CardHeader>
        <CardContent><BalanceSheetList o={o} /></CardContent>
      </Card>
    )
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>งบดุล · Balance sheet</CardTitle>
        <CardDescription>{thMonth(o.month!, true)} (เดือนล่าสุดที่ปิดแล้ว)</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-8">
        <BalanceTable title="สินทรัพย์" groups={o.balance.assets} total={o.totalAssets} base={o.totalAssets} />
        <div className="flex flex-col gap-8">
          <BalanceTable title="หนี้สิน" groups={o.balance.liabilities} total={o.totalLiabilities} base={o.totalAssets} />
          <div className="flex items-baseline justify-between border-t pt-4">
            <span className="font-medium">ความมั่งคั่งสุทธิ</span>
            <span className="text-xl font-semibold">{thb(o.netWorth)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
