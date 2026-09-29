import { describe, expect, it } from 'vitest'
import { BALANCE_CATEGORIES, CATEGORY_TH, PLANNING_CHIPS, TIER_INFO, unusedChips } from '../shared/categories'
import { TIERS } from '../shared/types'

describe('categories and chips', () => {
  it('has a Thai name for every balance category and planning chip category', () => {
    for (const d of BALANCE_CATEGORIES) expect([d.category, CATEGORY_TH[d.category]]).toEqual([d.category, expect.any(String)])
    for (const chips of Object.values(PLANNING_CHIPS)) for (const c of chips) expect([c.category, CATEGORY_TH[c.category]]).toEqual([c.category, expect.any(String)])
  })

  it('lists assets before liabilities, with the new debt categories', () => {
    const sides = BALANCE_CATEGORIES.map((d) => d.side)
    expect(sides.indexOf('liability')).toBeGreaterThan(sides.lastIndexOf('asset'))
    expect(BALANCE_CATEGORIES.filter((d) => d.side === 'liability').map((d) => d.category)).toEqual(['Mortgage', 'Car Loan', 'Credit Card', 'Other Debts'])
  })

  it('hides chips whose item already exists (case and spaces ignored)', () => {
    expect(unusedChips(['PVD', 'RMF', 'SSF'], [' rmf ', 'Other'])).toEqual(['PVD', 'SSF'])
    expect(unusedChips(PLANNING_CHIPS.Income, ['เงินเดือน']).map((c) => c.label)).toEqual(['รายได้เสริม', 'ค่าเช่า', 'ดอกเบี้ย / ปันผล'])
  })

  it('explains every tier', () => {
    for (const t of TIERS) expect(TIER_INFO[t]).toEqual(expect.any(String))
  })
})
