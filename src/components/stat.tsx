import type { ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Signed change, coloured by direction; icon + sign so colour never carries it alone */
export function Delta({ value, label, format }: { value: number; label?: string; format: (n: number) => string }) {
  const up = value >= 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className={cn('inline-flex items-center gap-1 text-sm', up ? 'text-good' : 'text-critical')}>
      <Icon className="size-4" aria-hidden />
      <span>{`${up ? '+' : '−'}${format(Math.abs(value))}`}</span>
      {label && <span className="text-muted-foreground">{label}</span>}
    </span>
  )
}

export function Hero({ label, value, sub, delta }: { label: string; value: string; sub?: ReactNode; delta?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-5xl font-semibold tracking-tight">{value}</span>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {delta}
        {sub && <span className="text-sm text-muted-foreground">{sub}</span>}
      </div>
    </div>
  )
}

export function StatTile({ label, value, sub, swatch }: { label: string; value: string; sub?: ReactNode; swatch?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border bg-card p-4">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        {swatch && <span className="size-2.5 rounded-[3px]" style={{ background: swatch }} aria-hidden />}
        {label}
      </span>
      <span className="text-2xl font-semibold tracking-tight">{value}</span>
      {sub && <span className="text-sm text-muted-foreground">{sub}</span>}
    </div>
  )
}
