// Thai personal income tax rules, one data set per tax year (CE). A new year = a new entry here + tests; shared/tax.ts never changes for it.
import type { BudgetType } from './types'

export type TaxSection = 'income' | 'family' | 'insurance' | 'fund' | 'home' | 'donation' | 'other' | 'wht' | 'reserve'

export interface TaxKind {
  key: string                        // stored in budget_lines.tax_kind and tax_lines.kind
  section: TaxSection
  label: string
  budgetTypes: BudgetType[]          // plan lines of these types may pick this kind; [] = typed on the tax page only
  income?: 'wage' | 'rent'           // income kinds: which expense rule applies
  cap?: number                       // fixed cap per year
  capPctOfIncome?: number            // cap as a share of total assessable income
  group?: string                     // shares a cap with the other kinds of this group
  multiplier?: number                // donations: deduction = amount × multiplier
  auto?: number                      // granted without typing (personal allowance)
  money?: 'kept' | 'spent'           // money that leaves the wallet: still the user's (funds) or gone (premiums, donations)
  advice?: string                    // present = suggest topping this kind up; the text says what it costs the user
}

export interface TaxRules {
  year: number
  brackets: { upTo: number | null; rate: number }[]
  kinds: TaxKind[]
  groupCaps: { id: string; label: string; cap: number }[]
  expense: { wage: { rate: number; cap: number }; rent: { rate: number } }
  altTax: { rate: number; minIncome: number; waiveUpTo: number }
  donation: { capPctOfNet: number }
  filingMonth: string                // YYYY-MM the tax is paid in
}

const OUT: BudgetType[] = ['Saving', 'Expense']

const RULES_2026: TaxRules = {
  year: 2026,
  brackets: [
    { upTo: 150_000, rate: 0 }, { upTo: 300_000, rate: 0.05 }, { upTo: 500_000, rate: 0.10 }, { upTo: 750_000, rate: 0.15 },
    { upTo: 1_000_000, rate: 0.20 }, { upTo: 2_000_000, rate: 0.25 }, { upTo: 5_000_000, rate: 0.30 }, { upTo: null, rate: 0.35 },
  ],
  kinds: [
    { key: 'inc_wage', section: 'income', label: 'เงินเดือน / โบนัส 40(1)', budgetTypes: ['Income'], income: 'wage' },
    { key: 'inc_freelance', section: 'income', label: 'Freelance / รับจ้าง 40(2)', budgetTypes: ['Income'], income: 'wage' },
    { key: 'inc_rent', section: 'income', label: 'ค่าเช่าบ้าน / อาคาร 40(5)', budgetTypes: ['Income'], income: 'rent' },
    { key: 'ded_self', section: 'family', label: 'ลดหย่อนส่วนตัว', budgetTypes: [], auto: 60_000 },
    { key: 'ded_spouse', section: 'family', label: 'คู่สมรสไม่มีเงินได้', budgetTypes: [], cap: 60_000 },
    { key: 'ded_parent', section: 'family', label: 'บิดามารดา (30,000 ต่อคน)', budgetTypes: [], cap: 120_000 },
    { key: 'ded_child', section: 'family', label: 'บุตร', budgetTypes: [] },
    { key: 'ded_sso', section: 'insurance', label: 'ประกันสังคม', budgetTypes: OUT, money: 'spent' },
    { key: 'ded_life', section: 'insurance', label: 'ประกันชีวิต', budgetTypes: OUT, group: 'lifeHealth', money: 'spent', advice: 'เบี้ยประกันเป็นเงินที่จ่ายออกไป' },
    { key: 'ded_health', section: 'insurance', label: 'ประกันสุขภาพตัวเอง', budgetTypes: OUT, cap: 25_000, group: 'lifeHealth', money: 'spent' },
    { key: 'ded_parent_health', section: 'insurance', label: 'ประกันสุขภาพบิดามารดา', budgetTypes: OUT, cap: 15_000, money: 'spent', advice: 'เบี้ยประกันเป็นเงินที่จ่ายออกไป' },
    { key: 'ded_rmf', section: 'fund', label: 'RMF', budgetTypes: OUT, capPctOfIncome: 0.30, group: 'retire', money: 'kept', advice: 'เงินยังเป็นของเรา ล็อกถึงอายุ 55 และถือครบ 5 ปี' },
    { key: 'ded_pvd', section: 'fund', label: 'กองทุนสำรองเลี้ยงชีพ (PVD)', budgetTypes: OUT, group: 'retire', money: 'kept' },
    { key: 'ded_gpf', section: 'fund', label: 'กบข.', budgetTypes: OUT, group: 'retire', money: 'kept' },
    { key: 'ded_pension', section: 'fund', label: 'ประกันบำนาญ', budgetTypes: OUT, cap: 200_000, capPctOfIncome: 0.15, group: 'retire', money: 'kept' },
    { key: 'ded_nsf', section: 'fund', label: 'กอช.', budgetTypes: OUT, cap: 30_000, group: 'retire', money: 'kept' },
    { key: 'ded_esg', section: 'fund', label: 'Thai ESG', budgetTypes: OUT, cap: 300_000, capPctOfIncome: 0.30, money: 'kept', advice: 'เงินยังเป็นของเรา ต้องถือครบ 5 ปี' },
    { key: 'ded_home_interest', section: 'home', label: 'ดอกเบี้ยบ้าน', budgetTypes: OUT, cap: 100_000 },
    { key: 'don_general', section: 'donation', label: 'บริจาคทั่วไป (1 เท่า)', budgetTypes: OUT, multiplier: 1, money: 'spent' },
    { key: 'don_double', section: 'donation', label: 'บริจาคการศึกษา / กีฬา / โรงพยาบาลรัฐ (2 เท่า)', budgetTypes: OUT, multiplier: 2, money: 'spent', advice: 'เงินบริจาคออกจากกระเป๋า ภาษีช่วยจ่ายบางส่วน' },
    { key: 'ded_other', section: 'other', label: 'ลดหย่อนอื่น', budgetTypes: OUT },
    { key: 'wht', section: 'wht', label: 'ภาษีหัก ณ ที่จ่าย', budgetTypes: OUT },
    { key: 'reserve', section: 'reserve', label: 'เงินสำรองภาษี', budgetTypes: OUT },
  ],
  groupCaps: [
    { id: 'lifeHealth', label: 'ประกันชีวิต + สุขภาพตัวเอง', cap: 100_000 },
    { id: 'retire', label: 'กลุ่มเกษียณ', cap: 500_000 },
  ],
  expense: { wage: { rate: 0.5, cap: 100_000 }, rent: { rate: 0.3 } },
  altTax: { rate: 0.005, minIncome: 120_000, waiveUpTo: 5_000 },
  donation: { capPctOfNet: 0.10 },
  filingMonth: '2027-03',
}

export const TAX_RULES: Record<number, TaxRules> = { 2026: RULES_2026 }
export const taxYears = () => Object.keys(TAX_RULES).map(Number).sort((a, b) => a - b)
/** Rules of that year, or of the latest year that has rules (plan lines are tagged against these) */
export const rulesFor = (year: number): TaxRules => TAX_RULES[year] ?? TAX_RULES[taxYears().at(-1)!]
export const kindOf = (rules: TaxRules, key: string) => rules.kinds.find((k) => k.key === key)

export const SECTION_TH: Record<TaxSection, string> = {
  income: 'เงินได้', family: 'ครอบครัว', insurance: 'ประกัน', fund: 'กองทุนและการออม', home: 'บ้าน',
  donation: 'บริจาค', other: 'ลดหย่อนอื่น', wht: 'หัก ณ ที่จ่าย', reserve: 'เงินสำรองภาษี',
}
/** Sections shown as cards on the tax page, in order (the reserve has its own card) */
export const PAGE_SECTIONS: TaxSection[] = ['income', 'family', 'insurance', 'fund', 'home', 'donation', 'other', 'wht']
