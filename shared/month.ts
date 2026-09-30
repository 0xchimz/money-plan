export const isMonth = (s: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s)

export function addMonth(ym: string, n: number) {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7)
}

/** Calendar month in Thailand (UTC+7, no daylight saving) */
export const bangkokMonth = (at = new Date()) => new Date(at.getTime() + 7 * 3_600_000).toISOString().slice(0, 7)

/** Months a first balance sheet may start at: this month in Bangkok and the 11 before it, newest first */
export const firstMonthOptions = (at = new Date()) => Array.from({ length: 12 }, (_, i) => addMonth(bangkokMonth(at), -i))

const TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

/** 2026-09 → ก.ย. '26 (chart axis label) */
export function monthLabel(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  return `${TH_MON[m - 1]} '${String(y).slice(2)}`
}

/** 2026-09 → 2026-09-30 */
export function lastDay(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

/** Today's date in Thailand, YYYY-MM-DD */
export const bangkokDate = (at = new Date()) => new Date(at.getTime() + 7 * 3_600_000).toISOString().slice(0, 10)
