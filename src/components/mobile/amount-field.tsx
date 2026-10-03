import { useRef, type ReactNode } from 'react'
import { evaluate, isFormula } from '@/lib/expr'
import { decimal, money } from '@/lib/format'
import { cn } from '@/lib/utils'

/** What a typed amount means — same rules as MoneyInput: blank = 0, formulas kept without spaces/commas/฿ */
export function readAmount(text: string, digits = 2, min?: number) {
  const t = text.trim()
  const value = t === '' ? 0 : evaluate(t, digits)
  const expr = t && isFormula(t) ? t.replace(/[\s,฿]/g, '') : null
  return { value, expr, ok: value != null && (min == null || value >= min) }
}

const OPS = [{ op: '+', label: '+' }, { op: '-', label: '−' }, { op: '*', label: '×' }, { op: '/', label: '÷' }]

/**
 * Big money field for phone sheets. The iPhone number pad has no + − × ÷, so they sit under the field; pressing one
 * keeps focus (and the keyboard). Shows "= result" while a formula is typed. The parent owns the text.
 */
export function AmountField({ text, onText, unit, digits = 2, min, label, hint, onEnter, autoFocus }: {
  text: string
  onText: (t: string) => void
  unit: string
  digits?: number
  min?: number
  label: string
  hint?: ReactNode
  onEnter?: () => void
  autoFocus?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  const { value, ok } = readAmount(text, digits, min)
  const show = (v: number) => (digits === 2 ? money(v) : decimal(v, digits))
  const insert = (op: string) => {
    const el = ref.current
    if (!el) return
    const s = el.selectionStart ?? text.length, e = el.selectionEnd ?? text.length
    onText(text.slice(0, s) + op + text.slice(e))
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + op.length, s + op.length) })
  }
  return (
    <div className="flex flex-col gap-2">
      <div className={cn('flex items-center gap-2 rounded-2xl border bg-background px-3 focus-within:ring-3 focus-within:ring-ring/40', !ok && 'border-critical')}>
        <input ref={ref} inputMode="decimal" enterKeyHint="done" autoComplete="off" autoFocus={autoFocus}
          aria-label={label} aria-invalid={!ok} placeholder="0.00" value={text}
          onChange={(e) => onText(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onEnter?.() } }}
          className="tabular h-14 min-w-0 flex-1 bg-transparent text-right text-2xl font-semibold outline-none" />
        <span className="shrink-0 text-sm text-muted-foreground">{unit}</span>
      </div>
      <div className="flex items-start gap-1.5">
        {OPS.map((o) => (
          <button key={o.op} type="button" aria-label={`ใส่ ${o.label}`} onPointerDown={(e) => e.preventDefault()} onClick={() => insert(o.op)}
            className="size-11 shrink-0 rounded-xl bg-muted text-lg font-medium text-foreground active:bg-accent">
            {o.label}
          </button>
        ))}
        <span className="tabular ml-auto flex flex-col items-end text-right text-sm">
          {!ok
            ? <span className="text-critical">ตัวเลขไม่ถูกต้อง</span>
            : isFormula(text) ? <span>= <b>{show(value!)}</b> {unit}</span> : null}
          {ok && hint && <span className="text-xs text-muted-foreground">{hint}</span>}
        </span>
      </div>
    </div>
  )
}
