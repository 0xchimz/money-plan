// Reference USD/THB offered next to a month's own rate: the ECB rate via frankfurter.dev (free, no key).
// It is only a suggestion — the user's bank or exchange rate is what the month keeps.
import { bangkokDate, lastDay } from '../shared/month'
import type { FxQuote } from '../shared/types'

/** Rate on the month's last day (frankfurter answers with the last business day on or before it); latest while the month is still running */
export async function ecbUsdThb(month: string, today = bangkokDate(), fetcher: typeof fetch = fetch): Promise<FxQuote | null> {
  const end = lastDay(month)
  const url = `https://api.frankfurter.dev/v1/${end < today ? end : 'latest'}?base=USD&symbols=THB`
  try {
    const r = await fetcher(url, { cf: { cacheTtl: 3600, cacheEverything: true } })
    if (!r.ok) return null
    const j = (await r.json()) as { date?: unknown; rates?: { THB?: unknown } }
    const rate = j.rates?.THB
    if (typeof rate !== 'number' || !(rate > 0) || typeof j.date !== 'string') return null
    return { rate: Math.round(rate * 10000) / 10000, date: j.date, source: 'ECB' }
  } catch {
    return null
  }
}
