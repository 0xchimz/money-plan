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

  it('creates the tax tables and enforces their foreign keys', async () => {
    const { results } = await sql("SELECT name FROM sqlite_master WHERE type = 'table'").all<{ name: string }>()
    expect(results.map((r) => r.name)).toEqual(expect.arrayContaining(['tax_years', 'tax_lines', 'tax_scenarios']))
    const cols = await sql("SELECT name FROM pragma_table_info('budget_lines')").all<{ name: string }>()
    expect(cols.results.map((c) => c.name)).toContain('tax_kind')
    // a tax line needs its tax year, and cannot point at a plan line that is not this user's
    await expect(sql("INSERT INTO tax_lines (user_id, year, kind, label) VALUES (999999, 2026, 'ded_rmf', 'x')").run()).rejects.toThrow(/FOREIGN KEY/i)
  })
})
