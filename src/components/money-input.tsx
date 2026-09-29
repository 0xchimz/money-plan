import { useRef, useState, type KeyboardEvent } from 'react'
import { Sigma } from 'lucide-react'
import { evaluate, isFormula } from '@/lib/expr'
import { money } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Money field that works like an Excel cell: type 251550.08+54791.65 and it keeps the breakdown.
 * Enter saves and jumps to the next money field (Shift+Enter: previous), Esc cancels.
 * Enter on an unchanged value calls onConfirm — "checked, still the same".
 */
export function MoneyInput({ value, expr, onCommit, onConfirm, label, min, className, placeholder = '0.00' }: {
  value: number | null
  expr?: string | null
  onCommit: (thb: number, expr: string | null) => void
  onConfirm?: () => void
  label: string
  min?: number
  className?: string
  placeholder?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  // Enter / Esc already handled the edit; the blur that follows runs with the old state and must not save again
  const handled = useRef(false)
  const [text, setText] = useState<string | null>(null) // null = not editing
  const editing = text != null
  const parsed = editing ? (text.trim() === '' ? 0 : evaluate(text)) : value
  const invalid = editing && (parsed == null || (min != null && parsed < min))
  const preview = editing && parsed != null && isFormula(text)

  function begin() {
    if (editing) return
    handled.current = false
    setText(expr ?? (value == null ? '' : String(value)))
    requestAnimationFrame(() => ref.current?.select())
  }

  function commit(): boolean {
    if (!editing) return true
    if (invalid || parsed == null) return false
    const t = text.trim()
    const nextExpr = t && isFormula(t) ? t.replace(/[\s,฿]/g, '') : null
    setText(null)
    const changed = value == null || Math.abs(parsed - value) >= 0.005 || nextExpr !== (expr ?? null)
    if (changed) onCommit(parsed, nextExpr)
    return changed
  }

  function move(step: 1 | -1) {
    const all = [...document.querySelectorAll<HTMLInputElement>('input[data-money-input]')]
    all[all.indexOf(ref.current!) + step]?.focus()
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (invalid) return
      handled.current = true
      const changed = commit()
      if (!changed) onConfirm?.()
      move(e.shiftKey ? -1 : 1)
    } else if (e.key === 'Escape') {
      handled.current = true
      setText(null)
      ref.current?.blur()
    }
  }

  return (
    <div className={cn('relative', className)}>
      {expr && !editing && (
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-muted-foreground" title={expr}>
          <Sigma className="size-3.5" aria-label={`สูตร ${expr}`} />
        </span>
      )}
      <input
        ref={ref}
        data-money-input
        inputMode="decimal"
        autoComplete="off"
        aria-label={label}
        aria-invalid={invalid || undefined}
        title={expr && !editing ? `${expr} = ${value != null ? money(value) : ''}` : undefined}
        placeholder={placeholder}
        value={editing ? text : value == null ? '' : money(value)}
        onFocus={begin}
        onChange={(e) => { handled.current = false; setText(e.target.value) }}
        onBlur={() => {
          if (handled.current) return
          if (invalid) setText(null)
          else commit()
        }}
        onKeyDown={onKeyDown}
        className={cn(
          'tabular h-9 w-full rounded-lg border border-transparent bg-transparent px-2.5 text-right text-sm font-medium transition-colors outline-none',
          'hover:border-input focus-visible:border-ring focus-visible:bg-background focus-visible:ring-3 focus-visible:ring-ring/40',
          'aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20',
          expr && !editing && 'pr-7',
        )}
      />
      {preview && (
        <span className="tabular pointer-events-none absolute top-full right-1 z-10 mt-1 rounded-md bg-foreground px-2 py-0.5 text-xs text-background shadow-sm">
          = {money(parsed!)}
        </span>
      )}
    </div>
  )
}
