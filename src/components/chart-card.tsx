import { useState, type ReactNode } from 'react'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/** Card with a Chart / Table switch — every chart has a table twin */
export function ChartCard({ title, description, chart, table, legend, className }: {
  title: string
  description?: ReactNode
  chart: ReactNode
  table?: ReactNode
  legend?: ReactNode
  className?: string
}) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {table && (
          <CardAction>
            <div className="inline-flex rounded-lg border p-0.5 text-xs" role="tablist">
              {(['chart', 'table'] as const).map((v) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={cn('rounded-md px-2.5 py-1 capitalize transition-colors max-lg:min-h-11 max-lg:px-3.5', view === v ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground')}
                >
                  {v}
                </button>
              ))}
            </div>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {view === 'chart' ? (
          <>
            {legend}
            {chart}
          </>
        ) : (
          <div className="max-h-96 overflow-auto">{table}</div>
        )}
      </CardContent>
    </Card>
  )
}

export function Legend({ items }: { items: { label: string; color: string; value?: string; line?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={i.line ? 'h-0.5 w-3 rounded-full' : 'size-2.5 rounded-[3px]'}
            style={{ background: i.color }}
          />
          <span className="text-muted-foreground">{i.label}</span>
          {i.value && <span className="font-medium">{i.value}</span>}
        </li>
      ))}
    </ul>
  )
}

/** Legend whose items double as series filters; at least one stays on */
export function ToggleLegend({ items, active, onChange }: {
  items: { label: string; color: string }[]
  active: string[]
  onChange: (active: string[]) => void
}) {
  const all = active.length === items.length
  const toggle = (label: string) => {
    const next = active.includes(label) ? active.filter((l) => l !== label) : [...active, label]
    if (next.length) onChange(items.map((i) => i.label).filter((l) => next.includes(l)))
  }
  return (
    <ul className="flex flex-wrap items-center gap-1.5 text-sm">
      {items.map((i) => {
        const on = active.includes(i.label)
        return (
          <li key={i.label}>
            <button
              type="button"
              aria-pressed={on}
              onClick={() => toggle(i.label)}
              onDoubleClick={() => onChange([i.label])}
              title="Click to toggle · double-click to show only this"
              className={cn('flex items-center gap-1.5 rounded-md border px-2 py-0.5 transition-colors max-lg:min-h-11 max-lg:px-3', on ? 'bg-muted/60' : 'border-dashed text-muted-foreground/60 hover:text-muted-foreground')}
            >
              <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: on ? i.color : 'var(--muted-foreground)', opacity: on ? 1 : 0.35 }} />
              <span className={on ? 'text-foreground' : 'line-through'}>{i.label}</span>
            </button>
          </li>
        )
      })}
      {!all && (
        <li>
          <button type="button" onClick={() => onChange(items.map((i) => i.label))} className="px-1.5 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
            Show all
          </button>
        </li>
      )}
    </ul>
  )
}
