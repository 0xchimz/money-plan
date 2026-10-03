import { useEffect, useRef, useState } from 'react'
import { Banknote, CircleAlert, CircleCheck, Copy, Ellipsis, FolderInput, PiggyBank, Receipt, Trash, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { CategoryIcon } from '@/components/category-icon'
import { RankedBars } from '@/components/charts'
import { Chips } from '@/components/chips'
import { PageState } from '@/components/layout'
import { TopBarSlot } from '@/components/mobile/shell'
import { MoneyInput } from '@/components/money-input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api, type BudgetLineInput, type BudgetLineRow, type BudgetType, type Planning, type Scenario, type ScenarioId } from '@/lib/api'
import { CATEGORY_TH } from '@/lib/categories'
import { money, pct, thb, thMonth } from '@/lib/format'
import { useIsMobile } from '@/lib/use-is-mobile'
import { cn } from '@/lib/utils'
import { PLANNING_CHIPS, unusedChips } from '@shared/categories'
import { debtOf, partOf, totals } from '@shared/planning'
import { LineSheet, MobileLineRow, type LineSheetState } from './planning-mobile'

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

// Where the income goes — fixed categorical slots (validated order: orange · blue · green), unallocated in neutral
type Part = 'expense' | 'saving' | 'invest' | 'left'
const PART: Record<Part, { label: string; color: string }> = {
  expense: { label: 'รายจ่าย', color: 'var(--chart-2)' },
  saving: { label: 'เงินออม', color: 'var(--chart-1)' },
  invest: { label: 'ลงทุน', color: 'var(--chart-3)' },
  left: { label: 'ยังไม่จัดสรร', color: 'var(--baseline)' },
}

const SECTIONS: { type: BudgetType; title: string; sub: string; icon: LucideIcon; tint: string | null }[] = [
  { type: 'Income', title: 'รายรับ', sub: 'Income', icon: Banknote, tint: null },
  { type: 'Saving', title: 'ออมและลงทุน', sub: 'Saving & Investment', icon: PiggyBank, tint: 'var(--chart-1)' },
  { type: 'Expense', title: 'รายจ่าย', sub: 'Expense', icon: Receipt, tint: 'var(--chart-2)' },
]

const defaultCategory = (t: BudgetType) => (t === 'Income' ? 'Salary' : t === 'Saving' ? 'Saving' : 'Daily Living')

export function PlanningPage() {
  const mobile = useIsMobile()
  const [sheet, setSheet] = useState<LineSheetState>(null)
  const [data, setData] = useState<Planning | null>(null)
  const [error, setError] = useState<unknown>()
  const [scenario, setScenario] = useState<ScenarioId>('main')
  const [blank, setBlank] = useState<ScenarioId[]>([]) // empty scenarios the user chose to fill by hand
  const seq = useRef(0)

  useEffect(() => {
    api.planning().then(setData, setError)
  }, [])

  async function mutate(call: Promise<Planning>, done?: string): Promise<boolean> {
    const n = ++seq.current
    try {
      const next = await call
      if (n === seq.current) setData(next)
      if (done) toast.success(done)
      return true
    } catch (e) {
      toast.error('บันทึกไม่ได้', { description: errMsg(e) })
      api.planning().then((d) => n === seq.current && setData(d), () => {})
      return false
    }
  }

  if (!data) return <PageState error={error} />
  const sc = data.scenarios.find((s) => s.id === scenario) ?? data.scenarios[0]

  const tabs = (
    <div className={cn('inline-flex rounded-2xl bg-muted p-1 text-sm', mobile && 'flex w-full')} role="tablist" aria-label="ชุดงบ">
      {data.scenarios.map((s) => (
        <button key={s.id} type="button" role="tab" aria-selected={s.id === sc.id} onClick={() => setScenario(s.id)}
          className={cn('rounded-xl px-4 py-1.5 transition-colors', mobile && 'min-h-10 flex-1 px-2', s.id === sc.id ? 'bg-card font-medium shadow-[var(--card-shadow)]' : 'text-muted-foreground hover:text-foreground')}>
          {s.name}
        </button>
      ))}
    </div>
  )
  const header = mobile
    ? <>{<TopBarSlot below={tabs} />}{sc.note && <p className="px-1 text-sm text-muted-foreground">{sc.note}</p>}</>
    : (
      <section className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">Planning · แผนการเงินรายเดือน</span>
          <h1 className="text-3xl font-semibold tracking-tight">แผนการใช้เงินต่อเดือน</h1>
          {sc.note && <p className="text-sm text-muted-foreground">{sc.note}</p>}
        </div>
        {tabs}
      </section>
    )

  if (sc.id !== 'main' && !sc.lines.length && !blank.includes(sc.id)) {
    const mainLines = data.scenarios.find((s) => s.id === 'main')?.lines ?? []
    const canCopy = sc.id === 'em' ? mainLines.some((l) => l.type === 'Expense') : mainLines.length > 0
    return (
      <div className="flex flex-col gap-6">
        {header}
        <EmptyScenario scenario={sc} canCopy={canCopy}
          onCopy={() => mutate(api.copyScenario(sc.id), sc.id === 'em' ? 'คัดลอกรายจ่ายจาก ปัจจุบัน แล้ว' : 'คัดลอกแผนจาก ปัจจุบัน แล้ว')}
          onBlank={() => setBlank((b) => [...b, sc.id])} />
      </div>
    )
  }

  const t = totals(sc.lines)
  const em = data.scenarios.find((s) => s.id === 'em')
  const emT = em ? totals(em.lines) : null
  const debt = debtOf(sc.lines)
  // the page leads with money put to work: investing first, then savings, biggest first
  const saved = t.saving + t.invest
  const savedRows = sc.lines.filter((l) => l.type === 'Saving' && l.thb > 0)
    .sort((a, b) => Number(partOf(a) !== 'invest') - Number(partOf(b) !== 'invest') || b.thb - a.thb)
    .map((l) => ({ label: l.item, value: l.thb, sub: l.account ?? undefined, color: PART[partOf(l)!].color }))
  const byCat = new Map<string, number>()
  for (const l of sc.lines.filter((x) => x.type === 'Expense')) byCat.set(l.category, (byCat.get(l.category) ?? 0) + l.thb)
  const expenseRows = [...byCat].map(([label, value]) => ({ label, value, sub: CATEGORY_TH[label], color: PART.expense.color })).filter((r) => r.value > 0).sort((a, b) => b.value - a.value)

  const patch = (l: BudgetLineRow, p: Partial<BudgetLineInput>) => {
    setData((d) => d && { ...d, scenarios: d.scenarios.map((s) => ({ ...s, lines: s.lines.map((x) => (x.id === l.id ? { ...x, ...p } : x)) })) })
    return mutate(api.updateLine(l.id, p))
  }
  const remove = (l: BudgetLineRow) => {
    mutate(api.deleteLine(l.id))
    toast(`ลบ ${l.item} แล้ว`, {
      action: { label: 'เลิกทำ', onClick: () => mutate(api.addLine(l.scenario, { type: l.type, category: l.category, item: l.item, thb: l.thb, expr: l.expr, account: l.account })) },
    })
  }

  return (
    <div className="flex flex-col gap-6">
      {header}

      <Card className="finance-hero">
        <CardContent className="grid gap-8 py-2 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <span className="text-sm text-muted-foreground">ออมและลงทุนต่อเดือน</span>
              <span className="text-4xl font-semibold lg:text-6xl tracking-tight">{thb(saved)}</span>
              <span className="text-sm text-muted-foreground">{t.income ? `${pct(saved / t.income)} ของรายรับ ${thb(t.income)}` : 'ยังไม่มีรายรับในงบนี้'}</span>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              {(['invest', 'saving'] as const).map((k) => (
                <div key={k} className="flex flex-col">
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <span className="size-2.5 rounded-[3px]" style={{ background: PART[k].color }} aria-hidden />{PART[k].label}
                  </span>
                  <span className="tabular text-xl font-semibold tracking-tight">{thb(t[k])}</span>
                </div>
              ))}
            </div>
            <LeftoverNote left={t.left} />
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <span className="text-sm font-medium">เงินออมไปที่ไหน</span>
            {savedRows.length
              ? <RankedBars rows={savedRows} format={thb} total={saved} />
              : <span className="text-sm text-muted-foreground">ยังไม่มีรายการออมหรือลงทุนในงบนี้</span>}
          </div>
        </CardContent>
      </Card>

      <section className={mobile ? '-mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-1 [scrollbar-width:none] *:w-[80%] *:shrink-0 *:snap-start' : 'grid grid-cols-4 gap-4'}>
        <Card size="sm" className="col-span-2">
          <CardContent><Allocation t={t} /></CardContent>
        </Card>
        <Metric label="ภาระผ่อนต่อรายได้ · DSR" value={t.income ? pct(debt / t.income) : '—'}
          sub={`ผ่อนบ้าน + ผ่อนของ ${thb(debt)} · เส้น = 40% ที่ธนาคารมักให้`} share={t.income ? debt / t.income : 0} mark={0.4} markLabel="40%" />
        {data.ef && emT && emT.expense > 0 && (
          <Runway ef={data.ef} expense={emT.expense} income={emT.income} />
        )}
      </section>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-8">
          {SECTIONS.map((s) => (
            <SectionCard key={`${sc.id}:${s.type}`} section={s} lines={sc.lines.filter((l) => l.type === s.type)} income={t.income}
              onPatch={patch} onRemove={remove}
              onAdd={(line) => mutate(api.addLine(sc.id, line), `เพิ่ม ${line.item} แล้ว`)}
              onEdit={mobile ? (l) => setSheet({ mode: 'edit', line: l }) : undefined}
              onNew={mobile ? (pr) => setSheet({ mode: 'add', type: s.type, ...pr }) : undefined} />
          ))}
        </div>
        <aside className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-20 lg:col-span-4">
          <Card>
            <CardHeader>
              <CardTitle>รายจ่ายตามหมวด</CardTitle>
              <CardDescription>{thb(t.expense)} / เดือน · ตัวเลขข้างแท่ง = % ของรายจ่าย</CardDescription>
            </CardHeader>
            <CardContent>
              {expenseRows.length ? <RankedBars rows={expenseRows} format={thb} total={t.expense} /> : <p className="text-sm text-muted-foreground">ยังไม่มีรายจ่าย</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>เทียบทุกชุดงบ</CardTitle>
              <CardDescription>บาทต่อเดือน</CardDescription>
            </CardHeader>
            <CardContent>
              <ScenarioTable scenarios={data.scenarios} active={sc.id} />
            </CardContent>
          </Card>
        </aside>
      </div>
      {mobile && (
        <LineSheet state={sheet} income={t.income} lines={sc.lines} onClose={() => setSheet(null)}
          onSave={(l, p) => patch(l, p)}
          onAdd={(line) => mutate(api.addLine(sc.id, line), `เพิ่ม ${line.item} แล้ว`)}
          onRemove={(l) => remove(l)} />
      )}
    </div>
  )
}

/** Every baht of income in one bar: expense · saving · investing · unallocated */
function Allocation({ t }: { t: ReturnType<typeof totals> }) {
  const parts = (['expense', 'saving', 'invest', 'left'] as Part[]).map((k) => ({ key: k, value: k === 'left' ? Math.max(t.left, 0) : t[k] }))
  const whole = Math.max(t.income, t.expense + t.saving + t.invest, 1)
  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm font-medium">เงินเดือนไปไหน</span>
      <div className="flex h-5 w-full gap-[2px] overflow-hidden rounded-[6px]" role="img"
        aria-label={parts.map((p) => `${PART[p.key].label} ${pct(p.value / whole)}`).join(', ')}>
        {parts.filter((p) => p.value > 0).map((p) => (
          <div key={p.key} className="h-full first:rounded-l-[6px] last:rounded-r-[6px]" style={{ width: `${(p.value / whole) * 100}%`, background: PART[p.key].color }}
            title={`${PART[p.key].label}: ${money(p.value)} THB (${pct(p.value / whole)})`} />
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        {parts.map((p) => (
          <li key={p.key} className="flex flex-col">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2.5 rounded-[3px]" style={{ background: PART[p.key].color }} aria-hidden />{PART[p.key].label}
            </span>
            <span className="tabular font-medium">{thb(p.value)} <span className="font-normal text-muted-foreground">{pct(p.value / whole)}</span></span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Money left unassigned should not sit idle — flag it (status icon + words, never colour alone) */
function LeftoverNote({ left }: { left: number }) {
  if (Math.abs(left) < 0.5) {
    return <span className="inline-flex items-center gap-1.5 text-sm text-good"><CircleCheck className="size-4" aria-hidden />จัดสรรครบทุกบาทแล้ว</span>
  }
  const over = left < 0
  return (
    <div className="flex items-start gap-2 rounded-xl bg-card/70 px-3 py-2 text-sm">
      <CircleAlert className={cn('mt-0.5 size-4 shrink-0', over ? 'text-critical' : 'text-warning')} aria-hidden />
      <span>
        {over
          ? <>จัดสรรเกินรายรับ <span className="tabular font-medium">{money(-left)} THB</span> / เดือน</>
          : <>ยังไม่ได้จัดสรร <span className="tabular font-medium">{money(left)} THB</span> / เดือน — ใส่เป็นลงทุนได้</>}
      </span>
    </div>
  )
}

/** A ratio against a rule of thumb: fill + a tick at the threshold */
function Metric({ label, value, sub, share, mark, markLabel }: { label: string; value: string; sub: string; share: number; mark: number; markLabel: string }) {
  const max = Math.max(share, mark) * 1.25
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-2xl font-semibold tracking-tight">{value}</span>
        <div className="relative h-3" role="img" aria-label={`${label} ${value}, เกณฑ์ ${markLabel}`}>
          <div className="absolute inset-y-1 right-0 left-0 rounded-full" style={{ background: 'color-mix(in oklch, var(--chart-1) 16%, transparent)' }} />
          <div className="absolute inset-y-1 left-0 rounded-full bg-chart-1" style={{ width: `${(share / max) * 100}%` }} />
          <div className="absolute inset-y-0 w-0.5 rounded-full bg-foreground" style={{ left: `calc(${(mark / max) * 100}% - 1px)` }} title={`เกณฑ์ ${markLabel}`} />
        </div>
        <span className="text-xs text-muted-foreground">{sub}</span>
      </CardContent>
    </Card>
  )
}

/** Emergency fund in months of the job-loss plan — the 6-month rule behind the target */
function Runway({ ef, expense, income }: { ef: NonNullable<Planning['ef']>; expense: number; income: number }) {
  const months = ef.thb / expense
  const withRent = expense > income ? ef.thb / (expense - income) : null
  const goal = 6
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-2">
        <span className="text-sm text-muted-foreground">ถ้าตกงาน เงินสำรองอยู่ได้</span>
        <span className="text-2xl font-semibold tracking-tight">{months.toFixed(1)} เดือน</span>
        <div className="flex gap-1" role="img" aria-label={`${months.toFixed(1)} จาก ${goal} เดือน`}>
          {Array.from({ length: goal }, (_, i) => (
            <div key={i} className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: 'color-mix(in oklch, var(--chart-1) 16%, transparent)' }}>
              <div className="h-full rounded-full bg-chart-1" style={{ width: `${Math.min(Math.max(months - i, 0), 1) * 100}%` }} />
            </div>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          EF {thb(ef.thb)} ({thMonth(ef.month)}{ef.status === 'draft' ? ' ร่าง' : ''}) ÷ รายจ่ายชุดตกงาน {thb(expense)}
          {withRent ? ` · หักรายรับที่ยังได้ อยู่ได้ ${withRent.toFixed(1)} เดือน` : ''}
        </span>
      </CardContent>
    </Card>
  )
}

function ScenarioTable({ scenarios, active }: { scenarios: Planning['scenarios']; active: string }) {
  const ts = scenarios.map((s) => ({ ...s, t: totals(s.lines) }))
  const rows: { label: string; get: (t: ReturnType<typeof totals>) => number }[] = [
    { label: 'รายรับ', get: (t) => t.income },
    { label: 'รายจ่าย', get: (t) => t.expense },
    { label: 'เงินออม', get: (t) => t.saving },
    { label: 'ลงทุน', get: (t) => t.invest },
    { label: 'เหลือ', get: (t) => t.left },
  ]
  return (
    <Table className="text-xs lg:text-sm">
      <TableHeader>
        <TableRow>
          <TableHead />
          {ts.map((s) => <TableHead key={s.id} className={cn('text-right', s.id === active && 'text-foreground')}>{s.name}</TableHead>)}
        </TableRow>
      </TableHeader>
      <TableBody className="tabular">
        {rows.map((r) => (
          <TableRow key={r.label}>
            <TableCell className="text-muted-foreground">{r.label}</TableCell>
            {ts.map((s) => (
              <TableCell key={s.id} className={cn('text-right', s.id === active && 'font-medium', r.label === 'เหลือ' && r.get(s.t) < 0 && 'text-critical')}>
                {r.get(s.t) < 0 ? `−${thb(-r.get(s.t))}` : thb(r.get(s.t))}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function SectionCard({ section, lines, income, onPatch, onRemove, onAdd, onEdit, onNew }: {
  section: (typeof SECTIONS)[number]
  lines: BudgetLineRow[]
  income: number
  onPatch: (l: BudgetLineRow, p: Partial<BudgetLineInput>) => void
  onRemove: (l: BudgetLineRow) => void
  onAdd: (line: BudgetLineInput) => void
  onEdit?: (l: BudgetLineRow) => void
  onNew?: (preset: { category: string; item: string }) => void
}) {
  const [preset, setPreset] = useState<{ category: string; item: string } | null>(null)
  const total = lines.reduce((s, l) => s + l.thb, 0)
  const cats: string[] = []
  for (const l of lines) if (!cats.includes(l.category)) cats.push(l.category)
  const chips = unusedChips(PLANNING_CHIPS[section.type], lines.map((l) => l.item))
  const { icon: Icon } = section
  return (
    <Card className="gap-0 py-0">
      <div className="flex items-center gap-3 border-b border-border/70 px-4 py-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-muted"
          style={section.tint ? { background: `color-mix(in oklch, ${section.tint} 16%, var(--card))` } : undefined} aria-hidden>
          <Icon className="size-5" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-lg font-semibold tracking-tight">{section.title}</span>
          <span className="text-xs text-muted-foreground">{section.sub} · {lines.length} รายการ</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="tabular text-lg font-semibold">{money(total)}</span>
          {section.type !== 'Income' && income > 0 && <span className="text-xs text-muted-foreground">{pct(total / income)} ของรายรับ</span>}
        </div>
      </div>
      <div className="flex flex-col py-2">
        {cats.map((c) => {
          const cl = lines.filter((l) => l.category === c)
          const sum = cl.reduce((s, l) => s + l.thb, 0)
          return (
            <div key={c} className="flex flex-col px-2 pb-2">
              <div className="flex items-center gap-2 px-2 pt-2 pb-1 text-xs text-muted-foreground">
                <CategoryIcon category={c} className="size-3.5" />
                <span className="font-medium text-foreground">{c}</span>
                {CATEGORY_TH[c] && <span>{CATEGORY_TH[c]}</span>}
                <span className="tabular ml-auto">{money(sum)}</span>
              </div>
              <ul className="flex flex-col">
                {cl.map((l) => onEdit
                  ? <MobileLineRow key={l.id} line={l} income={income} onOpen={() => onEdit(l)} />
                  : <LineRow key={l.id} line={l} income={income} categories={cats} onPatch={onPatch} onRemove={onRemove} />)}
              </ul>
            </div>
          )
        })}
        {!lines.length && <p className="px-4 py-3 text-sm text-muted-foreground">ยังไม่มีรายการ — เลือกจากรายการยอดนิยมด้านล่าง หรือเพิ่มเอง</p>}
      </div>
      <div className="border-t border-border/70 px-3 py-2">
        {preset
          ? <AddLineForm type={section.type} categories={cats} initial={preset} onCancel={() => setPreset(null)} onAdd={(l) => { onAdd(l); setPreset(null) }} />
          : <Chips chips={chips.map((c) => c.label)} onPick={(label) => {
              const chip = chips.find((c) => c.label === label)
              const next = { category: chip?.category ?? cats[0] ?? defaultCategory(section.type), item: label }
              if (onNew) onNew(next)
              else setPreset(next)
            }} />}
      </div>
    </Card>
  )
}

/** Text that looks like plain text until hovered / focused; saves on Enter or blur */
function InlineText({ value, onSave, label, className, placeholder }: { value: string; onSave: (v: string) => void; label: string; className?: string; placeholder?: string }) {
  const [text, setText] = useState<string | null>(null)
  const save = () => {
    if (text == null) return
    const v = text.trim()
    setText(null)
    if (v !== value) onSave(v)
  }
  return (
    <input
      aria-label={label}
      placeholder={placeholder}
      value={text ?? value}
      onFocus={() => setText(value)}
      onChange={(e) => setText(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') { setText(null); requestAnimationFrame(() => e.currentTarget?.blur()) }
      }}
      className={cn('w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-0.5 outline-none transition-colors placeholder:text-transparent hover:border-input hover:placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:bg-background focus-visible:placeholder:text-muted-foreground/60', className)}
    />
  )
}

function LineRow({ line: l, income, categories, onPatch, onRemove }: {
  line: BudgetLineRow
  income: number
  categories: string[]
  onPatch: (l: BudgetLineRow, p: Partial<BudgetLineInput>) => void
  onRemove: (l: BudgetLineRow) => void
}) {
  const [moving, setMoving] = useState(false)
  const [cat, setCat] = useState(l.category)
  return (
    <li className="group/row">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(7.5rem,9.5rem)_1.75rem] items-center gap-x-2 rounded-lg px-1 py-0.5 transition-colors hover:bg-muted/40 md:grid-cols-[minmax(0,1fr)_10rem_minmax(8rem,9.5rem)_3.5rem_1.75rem]">
        <div className="flex min-w-0 flex-col">
          <InlineText value={l.item} label="ชื่อรายการ" className="text-sm font-medium" onSave={(v) => v && onPatch(l, { item: v })} />
          <InlineText value={l.account ?? ''} label="บัญชี / ที่มาเงิน" placeholder="บัญชี" className="text-xs text-muted-foreground md:hidden" onSave={(v) => onPatch(l, { account: v || null })} />
        </div>
        <InlineText value={l.account ?? ''} label="บัญชี / ที่มาเงิน" placeholder="บัญชี" className="hidden text-xs text-muted-foreground md:block" onSave={(v) => onPatch(l, { account: v || null })} />
        <MoneyInput value={l.thb} expr={l.expr} min={0} label={`ยอด ${l.item}`} onCommit={(v, expr) => onPatch(l, { thb: v, expr })} />
        <span className="tabular hidden text-right text-xs text-muted-foreground md:block">{income > 0 && l.type !== 'Income' ? pct(l.thb / income) : ''}</span>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" className="opacity-60 group-hover/row:opacity-100 focus-visible:opacity-100" aria-label={`ตัวเลือก ${l.item}`} />}>
            <Ellipsis />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => setMoving(true)}><FolderInput /> ย้ายหมวด</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => onRemove(l)}><Trash /> ลบรายการ</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {moving && (
        <form className="mx-1 mb-2 flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-2.5"
          onSubmit={(e) => { e.preventDefault(); if (cat.trim()) onPatch(l, { category: cat.trim() }); setMoving(false) }}>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            ย้าย {l.item} ไปหมวด
            <Input autoFocus list={`cats-${l.type}`} value={cat} onChange={(e) => setCat(e.target.value)} className="w-48" />
          </label>
          <datalist id={`cats-${l.type}`}>{categories.map((c) => <option key={c} value={c} />)}</datalist>
          <Button type="button" size="sm" variant="ghost" onClick={() => setMoving(false)}>ยกเลิก</Button>
          <Button type="submit" size="sm">ย้าย</Button>
        </form>
      )}
    </li>
  )
}

function AddLineForm({ type, categories, initial, onAdd, onCancel }: {
  type: BudgetType
  categories: string[]
  initial: { category: string; item: string }
  onAdd: (l: BudgetLineInput) => void
  onCancel: () => void
}) {
  const [v, setV] = useState({ category: initial.category, item: initial.item, account: '', thb: 0, expr: null as string | null })
  const ok = v.item.trim() && v.category.trim()
  const known = [...new Set([...categories, ...PLANNING_CHIPS[type].map((c) => c.category)])]
  return (
    <form className="flex flex-wrap items-end gap-3 p-1"
      onSubmit={(e) => { e.preventDefault(); if (ok) onAdd({ type, category: v.category.trim(), item: v.item.trim(), account: v.account.trim() || null, thb: v.thb, expr: v.expr }) }}>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        หมวด
        <Input list={`new-cats-${type}`} value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })} className="w-40" />
        <datalist id={`new-cats-${type}`}>{known.map((c) => <option key={c} value={c}>{CATEGORY_TH[c]}</option>)}</datalist>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        รายการ
        <Input autoFocus={!initial.item} value={v.item} onChange={(e) => setV({ ...v, item: e.target.value })} placeholder="เช่น Spotify" className="w-44" />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        บัญชี (ไม่บังคับ)
        <Input value={v.account} onChange={(e) => setV({ ...v, account: e.target.value })} placeholder="เช่น SCB/ออมทรัพย์" className="w-40" />
      </label>
      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        บาท / เดือน
        <MoneyInput value={v.thb} expr={v.expr} min={0} label="ยอดต่อเดือน" className="w-36 rounded-lg border border-input" onCommit={(thb, expr) => setV((x) => ({ ...x, thb, expr }))} />
      </div>
      <div className="ml-auto flex gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>ยกเลิก</Button>
        <Button type="submit" size="sm" disabled={!ok}>เพิ่ม</Button>
      </div>
    </form>
  )
}

/** ตกงาน / Projection with no lines yet: start from ปัจจุบัน instead of retyping (mockup 4-planning.html) */
function EmptyScenario({ scenario, canCopy, onCopy, onBlank }: { scenario: Scenario; canCopy: boolean; onCopy: () => void; onBlank: () => void }) {
  const em = scenario.id === 'em'
  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{em ? 'ถ้าไม่มีรายได้ ต้องจ่ายเดือนละเท่าไหร่?' : 'แผนอนาคตยังว่าง'}</CardTitle>
        <CardDescription>
          {em ? 'ใช้คำนวณเป้าเงินสำรองฉุกเฉิน (6 เดือน × รายจ่ายชุดนี้) และดูว่าเงินสำรองที่มีอยู่ได้กี่เดือน' : 'เอาไว้วางแผน เช่น หลังขึ้นเงินเดือน แต่งงาน ย้ายบ้าน'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3">
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={onCopy} disabled={!canCopy}><Copy /> {em ? 'คัดลอกรายจ่ายจาก ปัจจุบัน' : 'คัดลอกทั้งหมดจาก ปัจจุบัน'}</Button>
          <Button variant="outline" onClick={onBlank}>เริ่มจากว่าง</Button>
        </div>
        {!canCopy && <p className="text-center text-xs text-muted-foreground">ชุด ปัจจุบัน ยังไม่มี{em ? 'รายจ่าย' : 'รายการ'}ให้คัดลอก — เพิ่มในชุด ปัจจุบัน ก่อน หรือเริ่มจากว่าง</p>}
        {em && canCopy && <p className="text-center text-xs text-muted-foreground">คัดลอกเฉพาะรายจ่าย แล้วลบหรือลดรายการที่ไม่จำเป็นตอนตกงาน · รายรับที่ยังได้อยู่ เช่น ค่าเช่า เพิ่มเองได้</p>}
      </CardContent>
    </Card>
  )
}
