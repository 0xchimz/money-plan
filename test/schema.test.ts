import { describe, expect, it } from 'vitest'
import { call, sql } from './helpers'

describe('scaffold', () => {
  it('answers health', async () => {
    const r = await call('/api/health')
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true })
  })

  it('creates every table', async () => {
    const { results } = await sql("SELECT name FROM sqlite_master WHERE type = 'table'").all<{ name: string }>()
    expect(results.map((r) => r.name)).toEqual(expect.arrayContaining([
      'users', 'sessions', 'tier_targets', 'budget_scenarios', 'budget_lines',
      'balance_items', 'balance_months', 'balance_entries', 'balance_transfers',
    ]))
  })

  it('enforces foreign keys', async () => {
    await expect(sql("INSERT INTO balance_months (user_id, month, status, updated_at) VALUES (999999, '2026-01', 'draft', 'x')").run())
      .rejects.toThrow(/FOREIGN KEY/i)
  })
})
