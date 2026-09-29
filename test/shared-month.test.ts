import { describe, expect, it } from 'vitest'
import { addMonth, bangkokMonth, firstMonthOptions, isMonth, monthLabel } from '../shared/month'

describe('months', () => {
  it('validates YYYY-MM', () => {
    expect(isMonth('2026-09')).toBe(true)
    for (const bad of ['2026-9', '2026-13', '2026-00', '26-09', '2026-09-01', '']) expect(isMonth(bad)).toBe(false)
  })

  it('adds months across years', () => {
    expect(addMonth('2026-12', 1)).toBe('2027-01')
    expect(addMonth('2026-01', -1)).toBe('2025-12')
    expect(addMonth('2026-09', -11)).toBe('2025-10')
  })

  it('rolls over at midnight in Thailand, not UTC', () => {
    expect(bangkokMonth(new Date('2026-09-30T16:59:59Z'))).toBe('2026-09')
    expect(bangkokMonth(new Date('2026-09-30T17:00:00Z'))).toBe('2026-10')
  })

  it('offers this month and the 11 before it for a first sheet', () => {
    const opts = firstMonthOptions(new Date('2026-01-15T00:00:00Z'))
    expect(opts).toHaveLength(12)
    expect(opts[0]).toBe('2026-01')
    expect(opts[11]).toBe('2025-02')
  })

  it('labels months for chart axes', () => {
    expect(monthLabel('2026-09')).toBe("ก.ย. '26")
    expect(monthLabel('2027-01')).toBe("ม.ค. '27")
  })
})
