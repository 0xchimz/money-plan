// Tax calculator: pure functions over a year's rules and the amounts the user typed. No DB, no clock.
import { kindOf, type TaxKind, type TaxRules } from './tax-rules'

export interface Amount { kind: string; thb: number }
export interface Counted { kind: string; entered: number; counted: number }
export interface TaxResult {
  income: number
  expense: number
  deductions: Counted[]              // every non-donation deduction kind with an amount (personal allowance included)
  deductionTotal: number
  donationCap: number
  donations: Counted[]               // entered = money given, counted = deduction after multiplier and cap
  donationTotal: number
  net: number
  brackets: { from: number; upTo: number | null; rate: number; taxable: number; tax: number }[]
  rate: number                       // rate of the highest bracket reached
  stepTax: number
  altTax: number                     // 0 when method 2 does not apply
  tax: number
  wht: number
  due: number                        // > 0 pay more, < 0 refund
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/** Months of `year` after `asOf` (YYYY-MM): null or before January = 12, December or later = 0 */
export function monthsAfter(asOf: string | null, year: number) {
  if (asOf == null || asOf < `${year}-01`) return 12
  if (asOf >= `${year}-12`) return 0
  return 12 - Number(asOf.slice(5))
}
/** Whole months from `from` to `to` (both YYYY-MM); 0 when `to` is not later */
export function monthsBetween(from: string, to: string) {
  const n = (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5)) - Number(from.slice(5))
  return Math.max(0, n)
}

export interface AnnualInput { budget: { thb: number } | null; paid: number; lump: number; asOf: string | null }
/** Whole-year amount of one tax line: typed total, or paid so far + one-off + monthly plan × months left */
export const annualOf = (l: AnnualInput, year: number) =>
  round2(l.paid + l.lump + (l.budget ? l.budget.thb * monthsAfter(l.asOf, year) : 0))

function totalsByKind(amounts: Amount[]) {
  const m = new Map<string, number>()
  for (const a of amounts) m.set(a.kind, (m.get(a.kind) ?? 0) + a.thb)
  for (const [k, v] of m) m.set(k, Math.max(0, round2(v)))   // a scenario may subtract, never below zero
  return m
}

function stepTaxOf(rules: TaxRules, net: number) {
  const brackets: TaxResult['brackets'] = []
  let from = 0, total = 0, rate = 0
  for (const b of rules.brackets) {
    const top = b.upTo ?? Infinity
    const taxable = Math.max(0, Math.min(net, top) - from)
    const tax = round2(taxable * b.rate)
    brackets.push({ from, upTo: b.upTo, rate: b.rate, taxable: round2(taxable), tax })
    if (taxable > 0) rate = b.rate
    total += tax
    from = top
  }
  return { brackets, rate, stepTax: round2(total) }
}

const capOf = (k: TaxKind, income: number) => Math.min(k.cap ?? Infinity, k.capPctOfIncome != null ? k.capPctOfIncome * income : Infinity)

export function computeTax(rules: TaxRules, amounts: Amount[]): TaxResult {
  const by = totalsByKind(amounts)
  const of = (k: TaxKind) => (k.auto ?? 0) + (by.get(k.key) ?? 0)

  let wage = 0, rent = 0
  for (const k of rules.kinds) {
    if (k.income === 'wage') wage += of(k)
    if (k.income === 'rent') rent += of(k)
  }
  const income = round2(wage + rent)
  const expense = round2(Math.min(wage * rules.expense.wage.rate, rules.expense.wage.cap) + rent * rules.expense.rent.rate)

  // caps: the kind's own cap first, then what its group still allows (kinds earlier in the rules are served first)
  const groupLeft = new Map(rules.groupCaps.map((g) => [g.id, g.cap]))
  const deductions: Counted[] = []
  for (const k of rules.kinds) {
    if (k.section === 'income' || k.section === 'donation' || k.section === 'wht' || k.section === 'reserve') continue
    const entered = of(k)
    if (entered <= 0) continue
    let counted = Math.min(entered, capOf(k, income))
    if (k.group) {
      const left = groupLeft.get(k.group) ?? Infinity
      counted = Math.min(counted, left)
      groupLeft.set(k.group, left - counted)
    }
    deductions.push({ kind: k.key, entered: round2(entered), counted: round2(counted) })
  }
  const deductionTotal = round2(deductions.reduce((s, d) => s + d.counted, 0))

  // donations come last: their cap depends on everything above
  const beforeDonation = Math.max(0, income - expense - deductionTotal)
  const donationCap = round2(beforeDonation * rules.donation.capPctOfNet)
  let donationLeft = donationCap
  const donations: Counted[] = []
  for (const k of rules.kinds) {
    if (k.section !== 'donation') continue
    const entered = of(k)
    if (entered <= 0) continue
    const counted = Math.min(entered * (k.multiplier ?? 1), donationLeft)
    donationLeft -= counted
    donations.push({ kind: k.key, entered: round2(entered), counted: round2(counted) })
  }
  const donationTotal = round2(donations.reduce((s, d) => s + d.counted, 0))

  const net = round2(Math.max(0, beforeDonation - donationTotal))
  const { brackets, rate, stepTax } = stepTaxOf(rules, net)
  // method 2: 0.5% of income other than 40(1) once it reaches the minimum; waived when it comes to 5,000 or less
  const otherIncome = income - rules.kinds.filter((k) => k.key === 'inc_wage').reduce((s, k) => s + of(k), 0)
  const alt = otherIncome >= rules.altTax.minIncome ? round2(otherIncome * rules.altTax.rate) : 0
  const altTax = alt > rules.altTax.waiveUpTo ? alt : 0
  const tax = Math.max(stepTax, altTax)
  const wht = round2(rules.kinds.filter((k) => k.section === 'wht').reduce((s, k) => s + of(k), 0))
  return { income, expense, deductions, deductionTotal, donationCap, donations, donationTotal, net, brackets, rate, stepTax, altTax, tax, wht, due: round2(tax - wht) }
}

/** How much more money can go into this kind before a cap stops it counting; Infinity = no cap */
export function roomFor(rules: TaxRules, amounts: Amount[], key: string): number {
  const k = kindOf(rules, key)
  if (!k) return 0
  const r = computeTax(rules, amounts)
  if (k.section === 'donation') return round2(Math.max(0, r.donationCap - r.donationTotal) / (k.multiplier ?? 1))
  const entered = totalsByKind(amounts).get(key) ?? 0
  let room = capOf(k, r.income) - entered
  if (k.group) {
    const cap = rules.groupCaps.find((g) => g.id === k.group)?.cap ?? Infinity
    const used = r.deductions.filter((d) => kindOf(rules, d.kind)?.group === k.group).reduce((s, d) => s + d.counted, 0)
    room = Math.min(room, cap - used)
  }
  return room === Infinity ? Infinity : round2(Math.max(0, room))
}

export interface Advice { kind: string; label: string; room: number; saving: number; perMonth: number | null; note: string }
/** Kinds worth topping up, biggest tax cut first. The cut is measured by running the calculator again with the room filled. */
export function advise(rules: TaxRules, amounts: Amount[], monthsLeft: number): Advice[] {
  const base = computeTax(rules, amounts)
  const out: Advice[] = []
  for (const k of rules.kinds) {
    if (!k.advice) continue
    const room = roomFor(rules, amounts, k.key)
    if (!Number.isFinite(room) || room < 0.01) continue
    const saving = round2(base.tax - computeTax(rules, [...amounts, { kind: k.key, thb: room }]).tax)
    if (saving < 0.01) continue
    out.push({ kind: k.key, label: k.label, room, saving, perMonth: monthsLeft > 0 ? round2(room / monthsLeft) : null, note: k.advice })
  }
  return out.sort((a, b) => b.saving - a.saving)
}

export interface ScenarioSummary {
  result: TaxResult
  taxSaved: number                   // real tax − scenario tax
  spend: number                      // extra money put into kinds that cost money
  kept: number                       // the part of `spend` that is still the user's
  netGain: number                    // taxSaved − money that is gone
  capped: string[]                   // changed kinds whose amount is not fully counted
}
export function scenarioSummary(rules: TaxRules, amounts: Amount[], changes: Amount[]): ScenarioSummary {
  const base = computeTax(rules, amounts)
  const result = computeTax(rules, [...amounts, ...changes])
  let spend = 0, kept = 0
  for (const c of changes) {
    const k = kindOf(rules, c.kind)
    if (!k?.money) continue
    spend += c.thb
    if (k.money === 'kept') kept += c.thb
  }
  const changed = new Set(changes.map((c) => c.kind))
  const capped = [...result.deductions, ...result.donations.map((d) => ({ ...d, entered: d.entered * (kindOf(rules, d.kind)?.multiplier ?? 1) }))]
    .filter((d) => changed.has(d.kind) && d.counted < d.entered - 0.005).map((d) => d.kind)
  const taxSaved = round2(base.tax - result.tax)
  return { result, taxSaved, spend: round2(spend), kept: round2(kept), netGain: round2(taxSaved - (spend - kept)), capped }
}

export interface ReserveStatus { months: number; have: number; need: number; short: number; perMonth: number | null }
/** Tax reserve by the filing month: what is set aside now + the monthly plan lines until then, against the tax still due */
export function reserveStatus(reserve: { thb: number; asOf: string | null; monthly: number }, filingMonth: string, due: number, today: string): ReserveStatus {
  // no as-of month yet: the typed amount is as of the end of last month
  const from = reserve.asOf ?? monthBefore(today)
  const months = monthsBetween(from, filingMonth)
  const have = round2(reserve.thb + reserve.monthly * months)
  const need = Math.max(0, due)
  const short = round2(Math.max(0, need - have))
  return { months, have, need, short, perMonth: short > 0 && months > 0 ? round2(short / months) : null }
}
const monthBefore = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}
