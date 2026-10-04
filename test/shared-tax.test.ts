import { describe, expect, it } from 'vitest'
import { kindOf, rulesFor, taxYears } from '../shared/tax-rules'
import { advise, annualOf, computeTax, monthsAfter, monthsBetween, reserveStatus, roomFor, scenarioSummary, type Amount } from '../shared/tax'

const R = rulesFor(2026)
// Chin, tax year 2569 (knowledge/finance/tax-2026.md in the ChinOS repo)
const chin: Amount[] = [
  { kind: 'inc_wage', thb: 2_063_058 }, { kind: 'inc_freelance', thb: 148_500 }, { kind: 'inc_rent', thb: 154_000 },
  { kind: 'ded_parent', thb: 30_000 }, { kind: 'ded_sso', thb: 10_500 }, { kind: 'ded_life', thb: 49_720 }, { kind: 'ded_health', thb: 25_000 },
  { kind: 'ded_rmf', thb: 231_266.49 }, { kind: 'ded_esg', thb: 162_600 }, { kind: 'ded_pvd', thb: 89_208 }, { kind: 'ded_home_interest', thb: 100_000 },
  { kind: 'wht', thb: 209_254.41 },
]
// the same year before rent was counted and with RMF 150,000 — the donation-cap case
const noRent = chin.filter((a) => a.kind !== 'inc_rent' && a.kind !== 'wht').map((a) => (a.kind === 'ded_rmf' ? { ...a, thb: 150_000 } : a))

describe('rules', () => {
  it('has 2026 and falls back to the latest year', () => {
    expect(taxYears()).toContain(2026)
    expect(rulesFor(1999).year).toBe(taxYears().at(-1))
    expect(kindOf(R, 'ded_rmf')?.group).toBe('retire')
    expect(kindOf(R, 'nope')).toBeUndefined()
  })
  it('gives every kind a unique key and a known group', () => {
    const keys = R.kinds.map((k) => k.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const k of R.kinds) if (k.group) expect(R.groupCaps.some((g) => g.id === k.group)).toBe(true)
  })
})

describe('computeTax', () => {
  it("matches Chin's 2569 year step by step", () => {
    const r = computeTax(R, chin)
    expect(r.income).toBe(2_365_558)
    expect(r.expense).toBe(146_200)
    expect(r.deductionTotal).toBe(758_294.49)
    expect(r.net).toBe(1_461_063.51)
    expect(r.rate).toBe(0.25)
    expect(r.brackets.map((b) => b.tax)).toEqual([0, 7_500, 20_000, 37_500, 50_000, 115_265.88, 0, 0])
    expect(r.tax).toBe(230_265.88)
    expect(r.altTax).toBe(0)                      // 302,500 × 0.5% = 1,512.50 ≤ 5,000 → not used
    expect(r.wht).toBe(209_254.41)
    expect(r.due).toBe(21_011.47)
  })

  it('caps donations at 10% of income after expenses and other deductions', () => {
    const before = computeTax(R, noRent)
    expect(before.net).toBe(1_434_530)
    expect(before.donationCap).toBe(143_453)
    expect(before.tax).toBe(223_632.5)
    const after = computeTax(R, [...noRent, { kind: 'don_double', thb: 61_316.49 }])
    expect(after.donationTotal).toBe(122_632.98)
    expect(after.tax).toBe(192_974.26)
    const tooMuch = computeTax(R, [...noRent, { kind: 'don_double', thb: 500_000 }])
    expect(tooMuch.donations).toEqual([{ kind: 'don_double', entered: 500_000, counted: 143_453 }])
  })

  it('matches the three rent scenarios of 3 Oct', () => {
    const rent = [...noRent, { kind: 'inc_rent', thb: 154_000 }]
    expect(computeTax(R, rent).tax).toBe(250_582.5)
    expect(computeTax(R, [...rent, { kind: 'ded_rmf', thb: 61_316.49 }]).tax).toBe(235_253.38)
    expect(computeTax(R, [...rent, { kind: 'don_double', thb: 61_316.49 }]).tax).toBe(219_924.26)
  })

  it('applies a fixed cap, a share-of-income cap and a group cap', () => {
    const wage: Amount = { kind: 'inc_wage', thb: 1_000_000 }
    const counted = (a: Amount[], kind: string) => computeTax(R, [wage, ...a]).deductions.find((d) => d.kind === kind)
    expect(counted([{ kind: 'ded_health', thb: 40_000 }], 'ded_health')).toEqual({ kind: 'ded_health', entered: 40_000, counted: 25_000 })
    expect(counted([{ kind: 'ded_rmf', thb: 800_000 }], 'ded_rmf')?.counted).toBe(300_000)          // 30% of 1,000,000
    expect(counted([{ kind: 'ded_esg', thb: 800_000 }], 'ded_esg')?.counted).toBe(300_000)          // min(30%, 300,000)
    // life 90,000 + health 25,000 → the group allows 100,000 in all; the later kind gives way
    expect(counted([{ kind: 'ded_life', thb: 90_000 }, { kind: 'ded_health', thb: 25_000 }], 'ded_health')?.counted).toBe(10_000)
    // retirement group: RMF 300,000 (its own cap) + PVD 250,000 → PVD counts 200,000
    const big: Amount = { kind: 'inc_wage', thb: 3_000_000 }
    const r = computeTax(R, [big, { kind: 'ded_rmf', thb: 300_000 }, { kind: 'ded_pvd', thb: 250_000 }])
    expect(r.deductions.find((d) => d.kind === 'ded_pvd')?.counted).toBe(200_000)
  })

  it('adds several lines of one kind and never lets a kind go below zero', () => {
    const r = computeTax(R, [{ kind: 'inc_wage', thb: 500_000 }, { kind: 'inc_wage', thb: 100_000 }, { kind: 'ded_life', thb: 10_000 }, { kind: 'ded_life', thb: -50_000 }])
    expect(r.income).toBe(600_000)
    expect(r.deductions.find((d) => d.kind === 'ded_life')).toBeUndefined()
  })

  it('uses method 2 only when it applies and is higher', () => {
    // rent 100,000 alone: below 120,000 → no method 2
    expect(computeTax(R, [{ kind: 'inc_rent', thb: 100_000 }]).altTax).toBe(0)
    // rent 900,000: 0.5% = 4,500 ≤ 5,000 → waived
    expect(computeTax(R, [{ kind: 'inc_rent', thb: 900_000 }]).altTax).toBe(0)
    // rent 3,000,000 with deductions that wipe the net income: step tax 0, method 2 = 15,000
    const r = computeTax(R, [{ kind: 'inc_rent', thb: 3_000_000 }, { kind: 'ded_child', thb: 2_100_000 }])
    expect(r.stepTax).toBe(0)
    expect(r.altTax).toBe(15_000)
    expect(r.tax).toBe(15_000)
    // wages are outside method 2
    expect(computeTax(R, [{ kind: 'inc_wage', thb: 3_000_000 }]).altTax).toBe(0)
  })

  it('handles the edge cases', () => {
    const empty = computeTax(R, [])
    expect(empty).toMatchObject({ income: 0, expense: 0, net: 0, tax: 0, due: 0, rate: 0 })
    expect(empty.deductions).toEqual([{ kind: 'ded_self', entered: 60_000, counted: 60_000 }])
    // deductions above income
    expect(computeTax(R, [{ kind: 'inc_wage', thb: 100_000 }, { kind: 'ded_child', thb: 900_000 }]).net).toBe(0)
    // withholding above the tax → refund
    expect(computeTax(R, [{ kind: 'inc_wage', thb: 500_000 }, { kind: 'wht', thb: 50_000 }]).due).toBeLessThan(0)
    // an unknown kind is ignored
    expect(computeTax(R, [{ kind: 'inc_wage', thb: 500_000 }, { kind: 'nope', thb: 99 }]).income).toBe(500_000)
  })
})

describe('roomFor and advise', () => {
  it('finds the room left under kind, group and donation caps', () => {
    expect(roomFor(R, chin, 'ded_rmf')).toBe(179_525.51)          // group 500,000 − (231,266.49 + 89,208)
    expect(roomFor(R, chin, 'ded_esg')).toBe(137_400)
    expect(roomFor(R, chin, 'ded_life')).toBe(25_280)
    expect(roomFor(R, chin, 'ded_health')).toBe(0)
    expect(roomFor(R, chin, 'don_double')).toBe(73_053.18)        // 146,106.35 ÷ 2
    expect(roomFor(R, chin, 'ded_child')).toBe(Infinity)
    expect(roomFor(R, chin, 'nope')).toBe(0)
  })

  it('ranks advice by the tax it saves, measured by recalculating', () => {
    const a = advise(R, chin, 3)
    expect(a.map((x) => [x.kind, x.room, x.saving, x.perMonth])).toEqual([
      ['ded_rmf', 179_525.51, 44_881.38, 59_841.84],
      ['don_double', 73_053.18, 36_526.59, 24_351.06],
      ['ded_esg', 137_400, 34_350, 45_800],
      ['ded_life', 25_280, 6_320, 8_426.67],
      ['ded_parent_health', 15_000, 3_750, 5_000],
    ])
    expect(a[0].note).toContain('55')
  })

  it('measures a saving that crosses a bracket', () => {
    // net income 1,050,000 → the first 50,000 of extra deduction saves 25%, the rest 20%
    const a: Amount[] = [{ kind: 'inc_wage', thb: 1_210_000 }]
    expect(computeTax(R, a).net).toBe(1_050_000)
    const esg = advise(R, a, 0).find((x) => x.kind === 'ded_esg')!
    expect(esg.room).toBe(300_000)
    expect(esg.saving).toBe(50_000 * 0.25 + 250_000 * 0.20)
    expect(esg.perMonth).toBeNull()
  })

  it('has nothing to say without income', () => {
    expect(advise(R, [], 3)).toEqual([])
  })
})

describe('scenarioSummary', () => {
  it('compares putting 100,000 into RMF with donating 50,000 at 2×', () => {
    const rmf = scenarioSummary(R, chin, [{ kind: 'ded_rmf', thb: 100_000 }])
    expect(rmf).toMatchObject({ taxSaved: 25_000, spend: 100_000, kept: 100_000, netGain: 25_000, capped: [] })
    expect(rmf.result.due).toBe(-3_988.53)
    const give = scenarioSummary(R, chin, [{ kind: 'don_double', thb: 50_000 }])
    expect(give).toMatchObject({ taxSaved: 25_000, spend: 50_000, kept: 0, netGain: -25_000, capped: [] })
  })
  it('flags a change that runs past a cap', () => {
    const s = scenarioSummary(R, chin, [{ kind: 'ded_rmf', thb: 300_000 }])
    expect(s.capped).toEqual(['ded_rmf'])
    expect(s.taxSaved).toBe(44_881.38)
  })
  it('can lower income', () => {
    const s = scenarioSummary(R, chin, [{ kind: 'inc_freelance', thb: -148_500 }])
    expect(s.result.income).toBe(2_217_058)
    expect(s.spend).toBe(0)
  })
})

describe('months and annualOf', () => {
  it('counts the months of the year after the as-of month', () => {
    expect(monthsAfter(null, 2026)).toBe(12)
    expect(monthsAfter('2025-12', 2026)).toBe(12)
    expect(monthsAfter('2026-01', 2026)).toBe(11)
    expect(monthsAfter('2026-09', 2026)).toBe(3)
    expect(monthsAfter('2026-12', 2026)).toBe(0)
    expect(monthsAfter('2027-02', 2026)).toBe(0)
    expect(monthsBetween('2026-09', '2027-03')).toBe(6)
    expect(monthsBetween('2027-03', '2026-09')).toBe(0)
  })
  it('totals a linked line and a typed line', () => {
    // RMF: paid to Sep 90,000 + one-off 61,316.49 + plan 26,650 × Oct–Dec
    expect(annualOf({ budget: { thb: 26_650 }, paid: 90_000, lump: 61_316.49, asOf: '2026-09' }, 2026)).toBe(231_266.49)
    expect(annualOf({ budget: { thb: 22_000 }, paid: 0, lump: 0, asOf: null }, 2026)).toBe(264_000)
    expect(annualOf({ budget: { thb: 22_000 }, paid: 154_000, lump: 0, asOf: '2026-12' }, 2026)).toBe(154_000)
    expect(annualOf({ budget: null, paid: 148_500, lump: 0, asOf: null }, 2026)).toBe(148_500)
  })
})

describe('reserveStatus', () => {
  it('says enough when savings + monthly plan cover the tax due', () => {
    expect(reserveStatus({ thb: 14_378.09, asOf: '2026-09', monthly: 1_300 }, R.filingMonth, 21_011.47, '2026-10'))
      .toEqual({ months: 6, have: 22_178.09, need: 21_011.47, short: 0, perMonth: null })
  })
  it('says how much is missing per month', () => {
    expect(reserveStatus({ thb: 5_000, asOf: '2026-09', monthly: 0 }, R.filingMonth, 21_011.47, '2026-10'))
      .toEqual({ months: 6, have: 5_000, need: 21_011.47, short: 16_011.47, perMonth: 2_668.58 })
  })
  it('counts from the end of last month when no as-of month was typed, and needs nothing on a refund', () => {
    expect(reserveStatus({ thb: 0, asOf: null, monthly: 1_000 }, R.filingMonth, -500, '2026-10'))
      .toEqual({ months: 6, have: 6_000, need: 0, short: 0, perMonth: null })
  })
})
