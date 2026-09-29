const compact = (v: number, digits = 2) =>
  new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: digits }).format(v)

export const thb = (v: number) => `฿${Math.round(v).toLocaleString('en-US')}`
export const thbCompact = (v: number) => (Math.abs(v) < 1000 ? thb(v) : `฿${compact(v)}`)
export const usd = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`
export const usdCompact = (v: number) => `$${compact(v, 1)}`
export const pct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`
export const signed = (v: number, f: (n: number) => string) => `${v >= 0 ? '+' : '−'}${f(Math.abs(v))}`

export function amount(v: number | null) {
  if (v == null) return '—'
  const a = Math.abs(v)
  const digits = a >= 1000 ? 2 : a >= 1 ? 4 : 6
  return v.toLocaleString('en-US', { maximumFractionDigits: digits })
}

export function price(v: number | null) {
  if (v == null) return '—'
  return `$${v.toLocaleString('en-US', { maximumFractionDigits: v >= 100 ? 0 : v >= 1 ? 2 : 4 })}`
}

export function relativeTime(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return `${Math.floor(s / 86400)} d ago`
}

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Full amount, 2 decimals, commas — for anything typed or acted on */
export const money = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const TH_MON_LONG = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']

/** 2026-09 → ก.ย. 2026 (long: กันยายน 2026) */
export const thMonth = (ym: string, long = false) => {
  const [y, m] = ym.split('-').map(Number)
  return `${(long ? TH_MON_LONG : TH_MON)[m - 1]} ${y}`
}

/** ISO time → 27 ก.ย. 16:37 */
export const thDateTime = (iso: string) => {
  const d = new Date(iso)
  return `${d.getDate()} ${TH_MON[d.getMonth()]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
