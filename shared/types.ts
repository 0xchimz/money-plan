// API contract shared by the Worker and the SPA: every request/response shape lives here

export type Tier = 'Foundation' | 'Core' | 'Growth' | 'High Risk'
export const TIERS: Tier[] = ['Foundation', 'Core', 'Growth', 'High Risk']
export type TierTargets = Record<Tier, number>

export interface Me { email: string; name: string | null; picture: string | null }
export interface AuthConfig { googleClientId: string; dev: boolean }

// ---- Planning (monthly plan, three fixed scenarios) ----
export type ScenarioId = 'main' | 'proj' | 'em'
export type BudgetType = 'Income' | 'Saving' | 'Expense'
export const BUDGET_TYPES: BudgetType[] = ['Income', 'Saving', 'Expense']
export interface BudgetLineRow {
  id: number
  scenario: ScenarioId
  type: BudgetType
  category: string
  item: string
  thb: number
  expr: string | null
  account: string | null
}
export type BudgetLineInput = Pick<BudgetLineRow, 'type' | 'category' | 'item' | 'thb' | 'expr' | 'account'>
export interface Scenario { id: ScenarioId; name: string; note: string | null; lines: BudgetLineRow[] }
/** Emergency-fund target = months × a monthly amount: the ตกงาน plan's expenses ('plan') or a typed one ('custom') */
export type EfMode = 'plan' | 'custom'
export interface EfTarget {
  mode: EfMode
  months: number                                             // 1..60, shared by both modes
  monthly: number | null                                     // typed THB per month; kept while the mode is 'plan'
  expr: string | null                                        // what was typed when it was a sum
}
export type EfTargetInput = Pick<EfTarget, 'mode' | 'months'> & Partial<Pick<EfTarget, 'monthly' | 'expr'>>
export interface Planning {
  scenarios: Scenario[]
  /** Emergency Funds total on the latest balance month (draft included); null before any month exists */
  ef: { month: string; status: MonthStatus; thb: number } | null
  efTarget: EfTarget
}

// ---- Balance (month-end balance sheet) ----
export type BalanceSide = 'asset' | 'liability'
export type MonthStatus = 'draft' | 'closed'
export type Currency = 'THB' | 'USD'
export interface BalanceRow {
  id: number
  side: BalanceSide
  category: string
  item: string
  tier: Tier | null
  type: string | null
  country: string | null
  thb: number                                                // THB value; for a USD row = usd × the month's rate
  usd: number | null                                         // amount typed in USD; null = a THB row
  expr: string | null                                        // what was typed, in the row's currency
  confirmed: boolean
  prev: number | null
  prevUsd: number | null                                     // last month's USD amount when that row was in USD
}
export interface BalanceTransfers {
  banks: { bank: string; thb: number; doneAt: string | null; subs: { sub: string | null; thb: number; items: string[]; notes: string[] }[] }[]
  skipped: { item: string; thb: number }[]
  fromIncome: { source: string; item: string; thb: number; note: string | null }[]
}
export interface Balance {
  months: { month: string; status: MonthStatus }[]          // newest first
  next: string | null                                        // the month "start next" would create
  firstMonths: string[]                                      // allowed first months (Bangkok time), newest first; [] once any month exists
  month: string | null
  status: MonthStatus | null
  prevMonth: string | null
  fx: { usdThb: number | null; confirmed: boolean; prev: number | null }  // THB per 1 USD this month; confirmed = typed or checked this month
  rows: BalanceRow[]
  hidden: { id: number; side: BalanceSide; category: string; item: string; prev: number | null }[]
  history: { month: string; assets: number; liabilities: number; net: number; draft: boolean }[]  // newest first
  targets: Record<string, number>                            // { 'Emergency Funds': months × monthly amount } when there is an amount
  efTarget: EfTarget
  emExpense: number                                          // ตกงาน plan's expenses per month; 0 = no plan yet
  transfers: BalanceTransfers | null
  hasClosed: boolean
}
export interface NewBalanceItem {
  side: BalanceSide
  category: string
  item: string
  tier: Tier | null
  type: string | null
  country: string | null
  thb?: number
  usd?: number                                               // instead of thb: a USD row (the month needs a rate)
  expr?: string | null
}
export type Classification = Pick<NewBalanceItem, 'tier' | 'type' | 'country'>

/** Reference rate offered next to the month's own rate (ECB via frankfurter.dev) */
export interface FxQuote { rate: number; date: string; source: 'ECB' }

// ---- Overview (closed months only) ----
export interface BalanceGroup { category: string; thb: number; items: { item: string; thb: number }[] }
export interface Overview {
  checklist: { planning: boolean; balanceStarted: boolean; closed: boolean }
  month: string | null                                       // latest closed month; null = show the checklist
  netWorth: number
  totalAssets: number
  totalLiabilities: number
  prev: { month: string; netWorth: number } | null
  netHistory: { month: string; label: string; assets: number; liabilities: number; net: number; live: boolean }[]  // newest first
  balance: { assets: BalanceGroup[]; liabilities: BalanceGroup[] }
  categoryHistory: { month: string; label: string; live: boolean; values: Record<string, number> }[]            // newest first, assets only
  contributions: { label: string; value: number }[]          // category → change in net worth vs prev month (debt down = +)
  investTotal: number
  tiers: { tier: Tier; thb: number; pct: number; target: number; gap: number }[]
  investments: { symbol: string; tier: Tier; type: string; country: string; thb: number }[]
  ef: number                                                 // Emergency Funds total in the latest closed month
}

// ---- Sankey (money flow of one scenario) ----
export interface SankeyNode { id: string; label: string; column: number; color: string; note?: string }
export interface SankeyLink { source: string; target: string; value: number }
