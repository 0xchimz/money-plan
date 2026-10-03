import { cn } from '@/lib/utils'

const CHIP = 'rounded-full border border-dashed border-input px-3 py-1 text-sm text-muted-foreground max-lg:min-h-11 max-lg:px-3.5 transition-colors hover:border-ring hover:text-foreground'

/** Quick-add buttons for common items; the last one ("เพิ่มเอง") opens an empty form */
export function Chips({ chips, onPick, className }: { chips: string[]; onPick: (label: string) => void; className?: string }) {
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {chips.map((c) => <button key={c} type="button" className={CHIP} onClick={() => onPick(c)}>+ {c}</button>)}
      <button type="button" className={CHIP} onClick={() => onPick('')}>+ เพิ่มเอง</button>
    </div>
  )
}
