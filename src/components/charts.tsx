import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { OTHER_COLOR, TIER_COLOR, type Overview } from '@/lib/api'
import { dateTime, pct, signed, thb, thbCompact, usd, usdCompact } from '@/lib/format'
import { cn } from '@/lib/utils'

// Shared chrome: hairline solid grid, recessive axes, no axis lines
const grid = <CartesianGrid vertical={false} stroke="var(--grid)" />
const axisProps = { tickLine: false, axisLine: false, tickMargin: 8, fontSize: 12 } as const

/** Generic stacked monthly columns; `live` rows get a * on the label */
export function StackedColumns({ data, series, format = thbCompact }: {
  data: ({ label: string; live?: boolean } & Record<string, any>)[]
  series: { key: string; color: string }[]
  format?: (n: number) => string
}) {
  const rows = data.map((d) => ({ ...d, label: d.live ? `${d.label}*` : d.label }))
  const config = Object.fromEntries(series.map((x) => [x.key, { label: x.key }])) as ChartConfig
  return (
    <ChartContainer config={config} className="aspect-auto h-72 w-full">
      <BarChart data={rows} margin={{ left: 4, right: 4 }}>
        {grid}
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={6} />
        <YAxis {...axisProps} width={56} tickFormatter={format} />
        <ChartTooltip cursor={{ fill: 'var(--muted)', opacity: 0.5 }} content={<ChartTooltipContent formatter={tooltipRow(thb)} />} />
        {series.map((x, i) => (
          <Bar key={x.key} dataKey={x.key} stackId="s" fill={x.color} stroke="var(--surface)" strokeWidth={2} maxBarSize={28} isAnimationActive={false}
            radius={i === series.length - 1 ? [4, 4, 0, 0] : 0} />
        ))}
      </BarChart>
    </ChartContainer>
  )
}

/** One line per series, newest on the left (data arrives newest-first) — for comparing growth across series */
export function MultiLines({ data, series, format = thbCompact }: {
  data: ({ label: string; live?: boolean } & Record<string, any>)[]
  series: { key: string; color: string }[]
  format?: (n: number) => string
}) {
  const rows = data.map((d) => ({ ...d, label: d.live ? `${d.label}*` : d.label }))
  const config = Object.fromEntries(series.map((x) => [x.key, { label: x.key, color: x.color }])) as ChartConfig
  return (
    <ChartContainer config={config} className="aspect-auto h-72 w-full">
      <LineChart data={rows} margin={{ left: 4, right: 12, top: 8 }}>
        {grid}
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={12} />
        <YAxis {...axisProps} width={56} tickFormatter={format} />
        <ChartTooltip content={<ChartTooltipContent indicator="line" formatter={tooltipRow(thb)} />} />
        {series.map((x) => (
          <Line key={x.key} dataKey={(r) => r[x.key] ?? 0} name={x.key} type="monotone" isAnimationActive={false} stroke={x.color} strokeWidth={2} dot={false}
            activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }} />
        ))}
      </LineChart>
    </ChartContainer>
  )
}

/** Signed monthly change: diverging blue (up) / red (down) around a zero baseline */
export function ChangeBars({ data, format = thbCompact }: { data: { label: string; value: number }[]; format?: (n: number) => string }) {
  const config = { value: { label: 'Change' } } satisfies ChartConfig
  return (
    <ChartContainer config={config} className="aspect-auto h-72 w-full">
      <BarChart data={data} margin={{ left: 4, right: 4 }}>
        {grid}
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={6} />
        <YAxis {...axisProps} width={56} tickFormatter={format} />
        <ReferenceLine y={0} stroke="var(--baseline)" />
        <ChartTooltip cursor={{ fill: 'var(--muted)', opacity: 0.5 }} content={<ChartTooltipContent hideIndicator formatter={(v) => <span className="tabular font-medium">{signed(Number(v), format)}</span>} />} />
        <Bar dataKey="value" maxBarSize={20} isAnimationActive={false} radius={[4, 4, 4, 4]}>
          {data.map((d) => <Cell key={d.label} fill={d.value >= 0 ? 'var(--chart-1)' : 'var(--chart-8)'} />)}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

/** Single-series percentage line over months (newest on the left) */
export function PercentLine({ data, label, color = 'var(--chart-1)' }: { data: { label: string; value: number }[]; label: string; color?: string }) {
  const config = { value: { label, color } } satisfies ChartConfig
  return (
    <ChartContainer config={config} className="aspect-auto h-72 w-full">
      <AreaChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
        {grid}
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={12} />
        <YAxis {...axisProps} width={44} tickFormatter={(v) => pct(v, 0)} domain={[0, 'auto']} />
        <ChartTooltip content={<ChartTooltipContent indicator="line" formatter={tooltipRow((v) => pct(v))} />} />
        <Area dataKey="value" type="monotone" isAnimationActive={false} stroke="var(--color-value)" strokeWidth={2} fill="var(--color-value)" fillOpacity={0.1}
          dot={false} activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }} />
      </AreaChart>
    </ChartContainer>
  )
}

/** Stacked areas over snapshots (crypto buckets) */
export function StackedArea({ data, series, format = usd }: {
  data: ({ taken_at: string } & Record<string, any>)[]
  series: { key: string; color: string }[]
  format?: (n: number) => string
}) {
  const config = Object.fromEntries(series.map((x) => [x.key, { label: x.key }])) as ChartConfig
  const span = data.length > 1 ? Math.abs(new Date(data.at(-1)!.taken_at).getTime() - new Date(data[0].taken_at).getTime()) : 0
  const tick = (v: string) => span < 2 * 86400_000
    ? new Date(v).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return (
    <ChartContainer config={config} className="aspect-auto h-72 w-full">
      <AreaChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
        {grid}
        <XAxis dataKey="taken_at" {...axisProps} tickFormatter={tick} minTickGap={32} reversed />
        <YAxis {...axisProps} width={64} tickFormatter={usdCompact} />
        <ChartTooltip content={<ChartTooltipContent indicator="line" labelFormatter={(_, p) => dateTime(p[0]?.payload.taken_at)} formatter={tooltipRow(format)} />} />
        {series.map((x) => (
          <Area key={x.key} dataKey={x.key} stackId="s" type="monotone" isAnimationActive={false} stroke={x.color} strokeWidth={2} fill={x.color} fillOpacity={0.25} />
        ))}
      </AreaChart>
    </ChartContainer>
  )
}

/** Horizontal diverging bars in HTML: negative left of a centre line, positive right */
export function DivergingList({ rows, format, posLabel, negLabel }: {
  rows: { label: string; value: number; sub?: string }[]
  format: (n: number) => string
  posLabel: string
  negLabel: string
}) {
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1e-9)
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {rows.map((r) => {
          const w = `${(Math.abs(r.value) / max) * 50}%`
          const pos = r.value >= 0
          return (
            <li key={r.label} className="grid grid-cols-[9rem_1fr_5.5rem] items-center gap-3 text-sm" title={r.sub}>
              <span className="truncate">{r.label}</span>
              <div className="relative h-4" role="img" aria-label={`${r.label} ${signed(r.value, format)}`}>
                <div className="absolute inset-y-0 left-1/2 w-px bg-baseline" />
                <div className={cn('absolute inset-y-0.5', pos ? 'left-1/2 rounded-r-[4px]' : 'right-1/2 rounded-l-[4px]')}
                  style={{ width: w, background: pos ? 'var(--chart-1)' : 'var(--chart-8)' }} />
              </div>
              <span className="tabular text-right">{signed(r.value, format)}</span>
            </li>
          )
        })}
      </ul>
      <div className="flex justify-between pl-[9.75rem] pr-[6.25rem] text-xs text-muted-foreground"><span>← {negLabel}</span><span>{posLabel} →</span></div>
    </div>
  )
}

const netConfig = {
  assets: { label: 'สินทรัพย์', color: 'var(--chart-1)' },
  liabilities: { label: 'หนี้สิน', color: 'var(--chart-2)' },
  net: { label: 'สุทธิ', color: 'var(--chart-3)' },
} satisfies ChartConfig

/** Assets vs liabilities (grouped columns) + net worth line, one THB axis, newest on the left */
export function NetWorthChart({ data }: { data: Overview['netHistory'] }) {
  const rows = data.map((d) => ({ ...d, label: d.live ? `${d.label}*` : d.label }))
  return (
    <ChartContainer config={netConfig} className="aspect-auto h-72 w-full">
      <ComposedChart data={rows} margin={{ left: 4, right: 4 }} barGap={2}>
        {grid}
        <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={8} />
        <YAxis {...axisProps} width={56} tickFormatter={thbCompact} />
        <ChartTooltip cursor={{ fill: 'var(--muted)', opacity: 0.5 }} content={<ChartTooltipContent formatter={tooltipRow(thb)} />} />
        <Bar dataKey="assets" fill="var(--color-assets)" maxBarSize={12} isAnimationActive={false} radius={[4, 4, 0, 0]} />
        <Bar dataKey="liabilities" fill="var(--color-liabilities)" maxBarSize={12} isAnimationActive={false} radius={[4, 4, 0, 0]} />
        <Line dataKey="net" type="monotone" isAnimationActive={false} stroke="var(--color-net)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
          dot={false} activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }} />
      </ComposedChart>
    </ChartContainer>
  )
}

/** Current share vs target per tier: a filled bar with a target tick (bullet chart) */
export function AllocationBullets({ tiers }: { tiers: Overview['tiers'] }) {
  const max = Math.max(...tiers.flatMap((t) => [t.pct, t.target])) * 1.1
  return (
    <ul className="flex flex-col gap-4">
      {tiers.map((t) => {
        const over = t.gap < 0
        return (
          <li key={t.tier} className="grid grid-cols-[6.5rem_1fr] items-center gap-x-4 gap-y-1 sm:grid-cols-[6.5rem_1fr_10rem]">
            <span className="flex items-center gap-2 text-sm">
              <span className="size-2.5 rounded-[3px]" style={{ background: TIER_COLOR[t.tier] }} aria-hidden />
              {t.tier}
            </span>
            <div className="relative h-6" role="img" aria-label={`${t.tier} ${pct(t.pct)} ของพอร์ต เป้า ${pct(t.target, 0)}`}>
              <div className="absolute inset-y-2 left-0 right-0 rounded-full bg-muted" />
              <div className="absolute inset-y-2 left-0 rounded-r-[4px]" style={{ width: `${(t.pct / max) * 100}%`, background: TIER_COLOR[t.tier] }} />
              <div className="absolute inset-y-0 w-0.5 rounded-full bg-foreground" style={{ left: `calc(${(t.target / max) * 100}% - 1px)` }} title={`เป้า ${pct(t.target, 0)}`} />
            </div>
            <span className="col-start-2 text-sm sm:col-start-auto sm:text-right">
              <span className="font-medium">{pct(t.pct)}</span>
              <span className="text-muted-foreground"> / {pct(t.target, 0)}</span>
              <span className={cn('block text-xs', over ? 'text-muted-foreground' : 'text-foreground')}>
                {over ? `เกินเป้า ${thbCompact(-t.gap)}` : `อีก ${thbCompact(t.gap)} ถึงเป้า`}
              </span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/** Part-to-whole in one horizontal bar; 2px surface gaps between segments */
export function PartBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0)
  return (
    <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded-[4px] bg-surface" role="img"
      aria-label={parts.map((p) => `${p.label} ${pct(p.value / total)}`).join(', ')}>
      {parts.filter((p) => p.value > 0).map((p) => (
        <div key={p.label} className="h-full transition-opacity hover:opacity-80" style={{ width: `${(p.value / total) * 100}%`, background: p.color }}
          title={`${p.label}: ${usd(p.value)} (${pct(p.value / total)})`} />
      ))}
    </div>
  )
}

/** One series ranked horizontally, value at the bar end */
export function RankedBars({ rows, format, total, limit }: {
  rows: { label: string; value: number; sub?: string; color?: string }[]
  format: (n: number) => string
  total?: number   // show share of this total next to the value
  limit?: number   // fold the tail into "Other"
}) {
  const shown = limit && rows.length > limit + 1
    ? [...rows.slice(0, limit), { label: `Other (${rows.length - limit})`, value: rows.slice(limit).reduce((s, r) => s + r.value, 0), color: OTHER_COLOR }]
    : rows
  const max = Math.max(...shown.map((r) => r.value))
  return (
    <ul className="flex flex-col gap-2">
      {shown.map((r) => (
        <li key={r.label} className="grid grid-cols-[8.5rem_1fr] items-center gap-3 text-sm" title={r.sub}>
          <span className="flex min-w-0 items-center gap-2">
            {r.color && <span className="size-2 shrink-0 rounded-[2px]" style={{ background: r.color }} aria-hidden />}
            <span className="truncate">{r.label}</span>
          </span>
          <div className="flex items-center gap-2">
            <div className="h-3 rounded-r-[4px]" style={{ width: `${Math.max((r.value / max) * 75, 0.5)}%`, background: r.color ?? 'var(--chart-1)' }} />
            <span className="tabular shrink-0">{format(r.value)}</span>
            {total != null && <span className="tabular shrink-0 text-muted-foreground">{pct(r.value / total)}</span>}
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Tooltip row: value first (strong), series name secondary, short line key */
function tooltipRow(format: (n: number) => string) {
  return (value: unknown, name: unknown, item: { color?: string; payload?: { fill?: string } }) => (
    <div className="flex w-full items-center gap-2">
      <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: item.color ?? item.payload?.fill }} aria-hidden />
      <span className="tabular font-medium text-foreground">{format(Number(value))}</span>
      <span className="text-muted-foreground">{String(name)}</span>
    </div>
  )
}
