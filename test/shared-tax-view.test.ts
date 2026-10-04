import { describe, expect, it } from 'vitest'
import { buildView, monthsLeftIn } from '../shared/tax-view'
import type { Tax, TaxLine } from '../shared/types'

const typed = (kind: string, label: string, paid: number): TaxLine => ({ id: 1, kind, label, budget: null, paid, paidExpr: null, asOf: null, lump: 0, lumpExpr: null })
const linked = (kind: string, label: string, thb: number, paid: number, asOf: string | null, lump = 0): TaxLine =>
  ({ id: 2, kind, label, budget: { lineId: 9, thb }, paid, paidExpr: null, asOf, lump, lumpExpr: null })

// Chin, tax year 2569, as the page would hold it in October
const chin: Tax = {
  year: 2026, years: [2026], today: '2026-10', scenarios: [],
  reserve: { thb: 14_378.09, expr: null, asOf: '2026-09', monthly: 1_300 },
  lines: [
    typed('inc_wage', 'PI Securities', 2_063_058),
    typed('inc_freelance', 'Freelance', 148_500),
    linked('inc_rent', 'TLW', 22_000, 88_000, '2026-09'),
    typed('ded_parent', 'บิดา', 30_000),
    linked('ded_sso', 'Social Society', 875, 7_875, '2026-09'),
    typed('ded_life', 'ประกันชีวิต', 49_720),
    typed('ded_health', 'ประกันสุขภาพ', 25_000),
    linked('ded_rmf', 'RMF', 26_650, 90_000, '2026-09', 61_316.49),
    linked('ded_pvd', 'PVD', 7_434, 66_906, '2026-09'),
    typed('ded_esg', 'Thai ESG', 162_600),
    typed('ded_home_interest', 'ดอกเบี้ยบ้าน', 163_000),
    typed('wht', '50 ทวิ', 209_254.41),
  ],
}

describe('buildView', () => {
  it("builds Chin's page", () => {
    const v = buildView(chin)
    expect(v.result.net).toBe(1_461_063.51)
    expect(v.result.tax).toBe(230_265.88)
    expect(v.result.due).toBe(21_011.47)
    expect(v.monthsLeft).toBe(3)
    expect(v.sections.map((s) => [s.section, s.total])).toEqual([
      ['income', 2_365_558], ['family', 90_000], ['insurance', 85_220], ['fund', 483_074.49],
      ['home', 100_000], ['donation', 0], ['other', 0], ['wht', 209_254.41],
    ])
    const fund = v.sections.find((s) => s.section === 'fund')!
    expect(fund.rows.map((r) => [r.line.label, r.annual, r.months])).toEqual([['RMF', 231_266.49, 3], ['PVD', 89_208, 3], ['Thai ESG', 162_600, 0]])
    expect(v.sections.find((s) => s.section === 'family')!.auto).toEqual([{ label: 'ลดหย่อนส่วนตัว', thb: 60_000 }])
    expect(v.advice[0]).toMatchObject({ kind: 'ded_rmf', room: 179_525.51, saving: 44_881.38 })
    expect(v.reserve).toEqual({ months: 6, have: 22_178.09, need: 21_011.47, short: 0, perMonth: null })
  })

  it('says how much of a capped kind counted', () => {
    const home = buildView(chin).sections.find((s) => s.section === 'home')!
    expect(home.capped).toEqual([{ label: 'ดอกเบี้ยบ้าน', entered: 163_000, counted: 100_000 }])
    const give = buildView({ ...chin, lines: [...chin.lines, typed('don_double', 'ศิริราช', 100_000)] }).sections.find((s) => s.section === 'donation')!
    expect(give.total).toBe(146_106.35)                                   // 2 × 100,000 capped at 10%
    expect(give.capped).toEqual([{ label: 'บริจาคการศึกษา / กีฬา / โรงพยาบาลรัฐ (2 เท่า · e-Donation)', entered: 200_000, counted: 146_106.35 }])
  })

  it('marks linked lines nothing was typed for, and lines whose as-of month is old', () => {
    const v = buildView({ ...chin, today: '2026-12', lines: [
      linked('inc_wage', 'ยังไม่กรอก', 100_000, 0, null),
      linked('ded_rmf', 'ค้าง', 10_000, 90_000, '2026-09'),
      linked('ded_pvd', 'เพิ่งกรอก', 5_000, 50_000, '2026-11'),
      linked('ded_sso', 'ครบปี', 875, 10_500, '2026-12'),
    ] })
    const rows = v.sections.flatMap((s) => s.rows)
    expect(rows.map((r) => [r.line.label, r.annual, r.unset, r.stale])).toEqual([
      ['ยังไม่กรอก', 1_200_000, true, false],
      ['ครบปี', 10_500, false, false],
      ['ค้าง', 120_000, false, true],                                      // still Sep + 3 × 10,000
      ['เพิ่งกรอก', 55_000, false, false],
    ])
  })

  it('handles an empty year and a refund', () => {
    const empty = buildView({ ...chin, lines: [], reserve: { thb: 0, expr: null, asOf: null, monthly: 0 } })
    expect(empty.result).toMatchObject({ income: 0, tax: 0, due: 0 })
    expect(empty.advice).toEqual([])
    expect(empty.reserve).toMatchObject({ need: 0, short: 0 })
    expect(empty.sections.every((s) => s.rows.length === 0)).toBe(true)
    const refund = buildView({ ...chin, lines: [typed('inc_wage', 'w', 500_000), typed('wht', 'w', 50_000)] })
    expect(refund.result.due).toBe(-38_500)
    expect(refund.reserve.need).toBe(0)
  })

  it('uses the latest rules when the payload year has none', () => {
    const v = buildView({ ...chin, year: 2031, today: '2031-10', lines: [typed('inc_wage', 'w', 500_000)] })
    expect(v.rules.year).toBe(2026)
    expect(v.result.tax).toBe(11_500)
  })

  it('counts the months left in the tax year', () => {
    expect(monthsLeftIn(2026, '2025-11')).toBe(12)
    expect(monthsLeftIn(2026, '2026-01')).toBe(12)
    expect(monthsLeftIn(2026, '2026-10')).toBe(3)
    expect(monthsLeftIn(2026, '2026-12')).toBe(1)
    expect(monthsLeftIn(2026, '2027-02')).toBe(0)
  })
})
