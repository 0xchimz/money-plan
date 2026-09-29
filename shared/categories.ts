import type { BalanceSide, BudgetType, Tier } from './types'

/** Thai name under the (English) category key */
export const CATEGORY_TH: Record<string, string> = {
  Cash: 'เงินสด / บัญชีออมทรัพย์',
  'Emergency Funds': 'เงินสำรองฉุกเฉิน',
  PVD: 'กองทุนสำรองเลี้ยงชีพ',
  'Insurance & Social Security': 'ประกัน & ประกันสังคม',
  Bond: 'ตราสารหนี้',
  Gold: 'ทองคำ',
  Equity: 'หุ้น & กองทุนหุ้น',
  Crypto: 'คริปโต',
  'Real Estate': 'อสังหาริมทรัพย์',
  Mortgage: 'สินเชื่อบ้าน',
  'Car Loan': 'สินเชื่อรถ',
  'Credit Card': 'บัตรเครดิต',
  'Other Debts': 'หนี้อื่นๆ',
  Others: 'อื่นๆ',
  Salary: 'เงินเดือน',
  Rental: 'ค่าเช่า',
  Family: 'ครอบครัว',
  Friends: 'เพื่อน',
  'Interest Money': 'ดอกเบี้ย / ปันผล',
  Saving: 'เงินออม',
  Investment: 'เงินลงทุน',
  Education: 'การศึกษา',
  Housing: 'ที่อยู่อาศัย',
  'Bills & Utilities': 'ค่าน้ำไฟ / โทรศัพท์',
  'Daily Living': 'ค่าใช้จ่ายประจำวัน',
  Tax: 'ภาษี',
  Donation: 'บริจาค',
  Insurance: 'ประกัน',
  Debt: 'ผ่อนสินค้า',
  Travel: 'ท่องเที่ยว',
  Activity: 'กิจกรรม',
  'Subscription Bill': 'สมาชิกรายเดือน',
  Entertainment: 'บันเทิง',
}

export interface CategoryDef { side: BalanceSide; category: string; chips: string[] }

/** Balance sheet categories in page order, with quick-add chips of items most people have */
export const BALANCE_CATEGORIES: CategoryDef[] = [
  { side: 'asset', category: 'Cash', chips: ['บัญชีออมทรัพย์', 'เงินสด'] },
  { side: 'asset', category: 'Emergency Funds', chips: ['บัญชีดอกเบี้ยสูง', 'กองทุนตลาดเงิน'] },
  { side: 'asset', category: 'PVD', chips: ['PVD'] },
  { side: 'asset', category: 'Insurance & Social Security', chips: ['ประกันสังคม', 'ประกันชีวิต'] },
  { side: 'asset', category: 'Bond', chips: ['กองทุนตราสารหนี้', 'หุ้นกู้'] },
  { side: 'asset', category: 'Equity', chips: ['RMF', 'SSF', 'ThaiESG', 'หุ้นไทย', 'หุ้นต่างประเทศ'] },
  { side: 'asset', category: 'Gold', chips: ['ทองคำแท่ง'] },
  { side: 'asset', category: 'Crypto', chips: ['BTC'] },
  { side: 'asset', category: 'Real Estate', chips: ['บ้าน / คอนโด'] },
  { side: 'asset', category: 'Others', chips: [] },
  { side: 'liability', category: 'Mortgage', chips: ['สินเชื่อบ้าน'] },
  { side: 'liability', category: 'Car Loan', chips: ['สินเชื่อรถ'] },
  { side: 'liability', category: 'Credit Card', chips: ['บัตรเครดิต'] },
  { side: 'liability', category: 'Other Debts', chips: [] },
]

export interface PlanningChip { label: string; category: string }

/** Planning quick-add chips per section; the chip's label becomes the line's item */
export const PLANNING_CHIPS: Record<BudgetType, PlanningChip[]> = {
  Income: [
    { label: 'เงินเดือน', category: 'Salary' },
    { label: 'รายได้เสริม', category: 'Others' },
    { label: 'ค่าเช่า', category: 'Rental' },
    { label: 'ดอกเบี้ย / ปันผล', category: 'Interest Money' },
  ],
  Saving: [
    { label: 'เงินสำรองฉุกเฉิน', category: 'Saving' },
    { label: 'เงินออม', category: 'Saving' },
    { label: 'PVD', category: 'Investment' },
    { label: 'RMF', category: 'Investment' },
    { label: 'ThaiESG', category: 'Investment' },
    { label: 'กองทุนหุ้น', category: 'Investment' },
  ],
  Expense: [
    { label: 'ค่าเช่าบ้าน', category: 'Housing' },
    { label: 'ผ่อนบ้าน', category: 'Mortgage' },
    { label: 'อาหาร', category: 'Daily Living' },
    { label: 'เดินทาง', category: 'Daily Living' },
    { label: 'ค่าน้ำไฟ / โทรศัพท์', category: 'Bills & Utilities' },
    { label: 'ประกัน', category: 'Insurance' },
    { label: 'ผ่อนของ / บัตรเครดิต', category: 'Debt' },
    { label: 'ช้อปปิ้ง', category: 'Daily Living' },
    { label: 'ท่องเที่ยว', category: 'Travel' },
  ],
}

/** Chips whose name is not used yet among the given item names (case and surrounding spaces ignored) */
export function unusedChips<T extends string | { label: string }>(chips: T[], used: string[]): T[] {
  const taken = new Set(used.map((u) => u.trim().toLowerCase()))
  return chips.filter((c) => !taken.has((typeof c === 'string' ? c : c.label).trim().toLowerCase()))
}

export const TIER_INFO: Record<Tier, string> = {
  Foundation: 'เงินต้นปลอดภัย',
  Core: 'ลงทุนหลักระยะยาว',
  Growth: 'เน้นโต ผันผวนขึ้น',
  'High Risk': 'เสี่ยงสูง',
}

export const INVEST_TYPES = ['Cash', 'Bonds', 'Equity', 'ETF', 'Commodities', 'Crypto']
export const COUNTRIES = ['Thailand', 'Global', 'United States', 'China', 'Vietnam', 'Netherlands', 'Crypto']
