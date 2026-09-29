import type { BalanceTransfers, BudgetLineRow } from './types'

type Line = Pick<BudgetLineRow, 'type' | 'category' | 'item' | 'thb' | 'account'>
type Sub = BalanceTransfers['banks'][number]['subs'][number]

const round = (v: number) => Math.round(v * 100) / 100

/**
 * What to transfer to which bank when closing a month, from the ปัจจุบัน plan: Saving + Expense lines grouped by the
 * account column "bank/sub-account: note". Lines without an account are not transfers (PVD, social security);
 * an account named after an income line (Rental) is paid straight from that income.
 */
export function transfers(lines: Line[], done: Map<string, string>): BalanceTransfers | null {
  const live = lines.filter((l) => l.thb > 0)
  if (!live.length) return null
  const incomes = new Set(live.filter((l) => l.type === 'Income').flatMap((l) => [l.category, l.item]))
  const banks = new Map<string, { bank: string; thb: number; subs: Sub[] }>()
  const skipped: BalanceTransfers['skipped'] = []
  const fromIncome: BalanceTransfers['fromIncome'] = []
  for (const l of live.filter((x) => x.type !== 'Income')) {
    if (!l.account?.trim()) {
      skipped.push({ item: l.item, thb: l.thb })
      continue
    }
    const [path, ...rest] = l.account.split(':')
    const note = rest.join(':').trim() || null
    const [bank, ...subParts] = path.split('/').map((x) => x.trim())
    if (incomes.has(bank)) {
      fromIncome.push({ source: bank, item: l.item, thb: l.thb, note })
      continue
    }
    const sub = subParts.join('/') || null
    const b = banks.get(bank) ?? { bank, thb: 0, subs: [] }
    let s = b.subs.find((x) => x.sub === sub)
    if (!s) {
      s = { sub, thb: 0, items: [], notes: [] }
      b.subs.push(s)
    }
    b.thb += l.thb
    s.thb += l.thb
    s.items.push(l.item)
    if (note && !s.notes.includes(note)) s.notes.push(note)
    banks.set(bank, b)
  }
  return {
    banks: [...banks.values()].sort((a, b) => b.thb - a.thb).map((b) => ({
      bank: b.bank,
      thb: round(b.thb),
      doneAt: done.get(b.bank) ?? null,
      subs: b.subs.sort((x, y) => y.thb - x.thb).map((s) => ({ ...s, thb: round(s.thb) })),
    })),
    skipped,
    fromIncome,
  }
}
