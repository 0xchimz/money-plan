import { HISTORY, buildOverview, type OverviewEntry } from '../shared/overview'
import { TIERS, type Overview, type Tier } from '../shared/types'
import { all, one, stmt, type Db } from './db'
import { bad } from './http'

export async function getOverview(db: Db, uid: number): Promise<Overview> {
  const [closed, entries, targets, planned, started] = await Promise.all([
    all<{ month: string }>(db, "SELECT month FROM balance_months WHERE user_id = ? AND status = 'closed' ORDER BY month DESC LIMIT ?", uid, HISTORY),
    all<OverviewEntry>(db, `
      SELECT e.month, i.side, i.category, i.item, i.tier, i.type, i.country, e.thb FROM balance_entries e
      JOIN balance_items i ON i.user_id = e.user_id AND i.id = e.item_id
      JOIN balance_months m ON m.user_id = e.user_id AND m.month = e.month
      WHERE e.user_id = ? AND e.month IN (SELECT month FROM balance_months WHERE user_id = ? AND status = 'closed' ORDER BY month DESC LIMIT ?)`, uid, uid, HISTORY),
    all<{ tier: Tier; target: number }>(db, 'SELECT tier, target FROM tier_targets WHERE user_id = ?', uid),
    one<{ n: number }>(db, "SELECT COUNT(*) AS n FROM budget_lines WHERE user_id = ? AND scenario = 'main'", uid),
    one<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM balance_months WHERE user_id = ?', uid),
  ])
  return buildOverview({
    closedMonths: closed.map((m) => m.month),
    entries,
    targets: Object.fromEntries(targets.map((t) => [t.tier, t.target])),
    checklist: { planning: (planned?.n ?? 0) > 0, balanceStarted: (started?.n ?? 0) > 0 },
  })
}

/** Portfolio targets per tier as fractions; all four, each 0..1, together 1 (± 0.001) */
export async function setTierTargets(db: Db, uid: number, input: unknown) {
  const v = (input ?? {}) as Record<string, unknown>
  const vals = TIERS.map((t) => v[t])
  if (vals.some((x) => typeof x !== 'number' || !Number.isFinite(x) || x < 0 || x > 1)) throw bad('เป้าแต่ละกลุ่มต้องอยู่ระหว่าง 0–100%')
  if (Math.abs((vals as number[]).reduce((s, x) => s + x, 0) - 1) > 0.001) throw bad('เป้ารวมกันต้องได้ 100%')
  await db.batch(TIERS.map((t, i) => stmt(db,
    'INSERT INTO tier_targets (user_id, tier, target) VALUES (?, ?, ?) ON CONFLICT (user_id, tier) DO UPDATE SET target = excluded.target',
    uid, t, vals[i])))
}
