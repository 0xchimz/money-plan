// What the tax page shows, derived from the API payload. Pure: the page and its tests share it.
import { advise, annualOf, computeTax, monthsAfter, monthsBetween, reserveStatus, round2, type Advice, type Amount, type ReserveStatus, type TaxResult } from './tax'
import { kindOf, PAGE_SECTIONS, SECTION_TH, TAX_RULES, type TaxKind, type TaxRules, type TaxSection } from './tax-rules'
import type { Tax, TaxLine } from './types'

/** Months of the tax year still to come, this month included */
export function monthsLeftIn(year: number, today: string) {
  if (today < `${year}-01`) return 12
  if (today > `${year}-12`) return 0
  return 13 - Number(today.slice(5))
}

export interface TaxRowView {
  line: TaxLine
  kind: TaxKind
  annual: number                     // whole-year amount
  months: number                     // plan months still counted (linked lines)
  unset: boolean                     // linked, nothing typed yet → the year is plan × 12
  stale: boolean                     // linked, months still projected, as-of month more than 2 months old
}
export interface TaxSectionView {
  section: TaxSection
  title: string
  total: number                      // income / withholding: sum of the rows · deductions: what counted after caps
  rows: TaxRowView[]
  auto: { label: string; thb: number }[]
  capped: { label: string; entered: number; counted: number }[]   // kinds where less counted than was entered
}
export interface TaxView {
  rules: TaxRules
  amounts: Amount[]
  result: TaxResult
  sections: TaxSectionView[]
  advice: Advice[]
  reserve: ReserveStatus
  monthsLeft: number
}

export function buildView(tax: Tax): TaxView {
  const rules = TAX_RULES[tax.year]
  const rows: TaxRowView[] = tax.lines.flatMap((line) => {
    const kind = kindOf(rules, line.kind)
    if (!kind) return []
    const months = line.budget ? monthsAfter(line.asOf, tax.year) : 0
    return [{
      line, kind, months,
      annual: annualOf(line, tax.year),
      unset: !!line.budget && line.asOf == null && line.paid === 0 && line.lump === 0,
      stale: !!line.budget && line.asOf != null && months > 0 && monthsBetween(line.asOf, tax.today) > 2,
    }]
  })
  const amounts = rows.map((r) => ({ kind: r.line.kind, thb: r.annual }))
  const result = computeTax(rules, amounts)
  const counted = new Map([...result.deductions, ...result.donations].map((d) => [d.kind, d]))

  const sections = PAGE_SECTIONS.map((section): TaxSectionView => {
    const kinds = rules.kinds.filter((k) => k.section === section)
    const mine = rows.filter((r) => r.kind.section === section).sort((a, b) => rules.kinds.indexOf(a.kind) - rules.kinds.indexOf(b.kind))
    const parts = kinds.flatMap((k) => { const c = counted.get(k.key); return c ? [{ k, c }] : [] })
    const sumRows = section === 'income' || section === 'wht'
    return {
      section,
      title: SECTION_TH[section],
      total: round2(sumRows ? mine.reduce((s, r) => s + r.annual, 0) : parts.reduce((s, p) => s + p.c.counted, 0)),
      rows: mine,
      auto: kinds.filter((k) => k.auto != null).map((k) => ({ label: k.label, thb: k.auto! })),
      capped: parts.map(({ k, c }) => ({ label: k.label, entered: round2(c.entered * (k.multiplier ?? 1)), counted: c.counted })).filter((c) => c.counted < c.entered - 0.005),
    }
  })

  const monthsLeft = monthsLeftIn(tax.year, tax.today)
  return {
    rules, amounts, result, sections, monthsLeft,
    advice: advise(rules, amounts, monthsLeft),
    reserve: reserveStatus(tax.reserve, rules.filingMonth, result.due, tax.today),
  }
}
