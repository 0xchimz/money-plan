import type { AuthConfig, Balance, BudgetLineInput, Classification, Me, NewBalanceItem, Overview, Planning, ScenarioId, Tier, TierTargets } from '@shared/types'

export * from '@shared/types'

/** Categorical slots in validated order (dataviz reference palette); a 9th series folds into Other */
export const SERIES = Array.from({ length: 8 }, (_, i) => `var(--chart-${i + 1})`)
export const OTHER_COLOR = 'var(--baseline)'
// Fixed categorical slots — colour follows the entity, never its rank
export const TIER_COLOR: Record<Tier, string> = {
  Foundation: 'var(--chart-1)',
  Core: 'var(--chart-2)',
  Growth: 'var(--chart-3)',
  'High Risk': 'var(--chart-4)',
}

export class ApiError extends Error {
  status: number
  body: Record<string, unknown>
  constructor(status: number, message: string, body: Record<string, unknown>) {
    super(message)
    this.status = status
    this.body = body
  }
}

// App sets this so any 401 (session gone mid-use) sends the user back to the login page
let onUnauthorized: () => void = () => {}
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn }

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin' }
  // every write is JSON (the server refuses anything else), even when there is nothing to send
  if (method !== 'GET') {
    init.headers = { 'content-type': 'application/json' }
    init.body = JSON.stringify(body ?? {})
  }
  const r = await fetch(url, init)
  if (r.ok) return (await r.json()) as T
  let data: Record<string, unknown> = {}
  try { data = await r.json() } catch { /* not JSON */ }
  if (r.status === 401) onUnauthorized()
  throw new ApiError(r.status, typeof data.error === 'string' ? data.error : `HTTP ${r.status}`, data)
}
const get = <T>(url: string) => request<T>('GET', url)

export const api = {
  authConfig: () => get<AuthConfig>('/api/auth/config'),
  loginGoogle: (credential: string) => request<Me>('POST', '/api/auth/google', { credential }),
  logout: () => request<{ ok: true }>('POST', '/api/auth/logout'),
  me: () => get<Me>('/api/me'),

  overview: () => get<Overview>('/api/overview'),
  setTierTargets: (t: TierTargets) => request<Overview>('PUT', '/api/tier-targets', t),

  planning: () => get<Planning>('/api/planning'),
  addLine: (scenario: ScenarioId, line: BudgetLineInput) => request<Planning>('POST', `/api/planning/${scenario}/lines`, line),
  updateLine: (id: number, patch: Partial<BudgetLineInput>) => request<Planning>('PATCH', `/api/planning/lines/${id}`, patch),
  deleteLine: (id: number) => request<Planning>('DELETE', `/api/planning/lines/${id}`),
  copyScenario: (to: ScenarioId) => request<Planning>('POST', `/api/planning/${to}/copy`, { from: 'main' }),

  balance: (month?: string | null) => get<Balance>(`/api/balance${month ? `?month=${month}` : ''}`),
  startMonth: (month: string) => request<Balance>('POST', `/api/balance/${month}/start`),
  closeMonth: (month: string) => request<Balance>('POST', `/api/balance/${month}/close`),
  discardDraft: (month: string) => request<Balance>('DELETE', `/api/balance/${month}`),
  setEntry: (month: string, id: number, thb: number, expr: string | null) => request<Balance>('PUT', `/api/balance/${month}/entries/${id}`, { thb, expr }),
  removeEntry: (month: string, id: number) => request<Balance>('DELETE', `/api/balance/${month}/entries/${id}`),
  restoreEntry: (month: string, id: number) => request<Balance>('POST', `/api/balance/${month}/entries/${id}/restore`),
  confirmRows: (month: string, ids: number[]) => request<Balance>('POST', `/api/balance/${month}/confirm`, { ids }),
  setTransfer: (month: string, bank: string, done: boolean) => request<Balance>('POST', `/api/balance/${month}/transfers/${encodeURIComponent(bank)}`, { done }),
  addBalanceItem: (month: string, item: NewBalanceItem) => request<Balance>('POST', `/api/balance/${month}/items`, item),
  classifyItem: (month: string, id: number, c: Classification) => request<Balance>('PATCH', `/api/balance/${month}/items/${id}`, c),
}
