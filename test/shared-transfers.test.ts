import { describe, expect, it } from 'vitest'
import { transfers } from '../shared/transfers'
import type { BudgetType } from '../shared/types'

const L = (type: BudgetType, item: string, thb: number, account: string | null, category = 'Housing') => ({ type, category, item, thb, account })

describe('month-close transfers', () => {
  it('is null without any plan line', () => {
    expect(transfers([], new Map())).toBeNull()
    expect(transfers([L('Expense', 'x', 0, 'SCB')], new Map())).toBeNull()
  })

  it('groups by bank and sub-account, keeps notes, sorts banks by amount', () => {
    const t = transfers([
      L('Income', 'ค่าเช่า', 22000, null, 'Rental'),
      L('Saving', 'เงินออม', 3000, 'KBank/ออม: ทุกวันที่ 1', 'Saving'),
      L('Saving', 'EF', 2000, 'KBank/ออม', 'Saving'),
      L('Expense', 'ผ่อนบ้าน', 18000, 'SCB', 'Mortgage'),
      L('Expense', 'PVD', 4000, null),
      L('Expense', 'ส่วนกลาง', 1500, 'Rental: หักจากค่าเช่า'),
    ], new Map([['SCB', '2026-09-30T00:00:00.000Z']]))!
    expect(t.banks).toEqual([
      { bank: 'SCB', thb: 18000, doneAt: '2026-09-30T00:00:00.000Z', subs: [{ sub: null, thb: 18000, items: ['ผ่อนบ้าน'], notes: [] }] },
      { bank: 'KBank', thb: 5000, doneAt: null, subs: [{ sub: 'ออม', thb: 5000, items: ['เงินออม', 'EF'], notes: ['ทุกวันที่ 1'] }] },
    ])
    expect(t.skipped).toEqual([{ item: 'PVD', thb: 4000 }])
    expect(t.fromIncome).toEqual([{ source: 'Rental', item: 'ส่วนกลาง', thb: 1500, note: 'หักจากค่าเช่า' }])
  })
})
