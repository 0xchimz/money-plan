import type { BudgetType } from '@/lib/api'
import { cn } from '@/lib/utils'
import { bangkokMonth } from '@shared/month'
import { rulesFor, SECTION_TH } from '@shared/tax-rules'

/** "Use for tax" picker of a plan line: the kinds this year's rules offer to lines of that type, grouped by section */
export function TaxKindSelect({ type, value, onChange, className }: { type: BudgetType; value: string | null; onChange: (v: string | null) => void; className?: string }) {
  const kinds = rulesFor(Number(bangkokMonth().slice(0, 4))).kinds.filter((k) => k.auto == null && k.budgetTypes.includes(type))
  const sections = [...new Set(kinds.map((k) => k.section))]
  return (
    <select aria-label="ใช้กับภาษี" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}
      className={cn('h-8 w-full min-w-0 truncate rounded-md border border-transparent bg-transparent px-1.5 text-xs outline-none transition-colors hover:border-input focus-visible:border-ring focus-visible:bg-background',
        !value && 'text-muted-foreground/60', className)}>
      <option value="">ภาษี: ไม่ใช้</option>
      {sections.map((s) => (
        <optgroup key={s} label={SECTION_TH[s]}>
          {kinds.filter((k) => k.section === s).map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
        </optgroup>
      ))}
    </select>
  )
}
