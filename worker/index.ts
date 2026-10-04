import { Hono } from 'hono'
import { authRoutes, requireUser } from './auth'
import type { AppEnv } from './env'
import { HttpError, jsonOnly, body, idParam, monthParam } from './http'
import { getMe } from './users'
import { addScenario, addTaxLine, applyScenario, deleteScenario, deleteTaxLine, getTax, setLinkedLine, setReserve, updateScenario, updateTaxLine, yearParam } from './tax'
import { addLine, copyScenario, deleteLine, getPlanning, updateLine } from './planning'
import { addItem, classifyItem, closeMonth, confirmRows, discardDraft, getBalance, removeEntry, restoreEntry, setCurrency, setEntry, setRate, setTransfer, startMonth } from './balance'
import { ecbUsdThb } from './fx'
import { getOverview, setTierTargets } from './overview'

const app = new Hono<AppEnv>()

app.onError((e, c) => {
  if (e instanceof HttpError) return c.json({ error: e.message, ...e.extra }, e.status)
  console.error(e)
  return c.json({ error: 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง' }, 500)
})
app.notFound((c) => c.json({ error: 'ไม่พบ' }, 404))

app.use('/api/*', jsonOnly)
app.use('/api/*', requireUser)
app.get('/api/health', (c) => c.json({ ok: true }))

// ---- routes added by later tasks go below this line ----

app.route('/api/auth', authRoutes)
app.get('/api/me', async (c) => c.json(await getMe(c.env.DB, c.var.uid)))

// ---- Planning ----
app.get('/api/planning', async (c) => c.json(await getPlanning(c.env.DB, c.var.uid)))
app.post('/api/planning/:scenario/lines', async (c) => {
  await addLine(c.env.DB, c.var.uid, c.req.param('scenario'), await body(c))
  return c.json(await getPlanning(c.env.DB, c.var.uid))
})
app.patch('/api/planning/lines/:id', async (c) => {
  await updateLine(c.env.DB, c.var.uid, idParam(c), await body(c))
  return c.json(await getPlanning(c.env.DB, c.var.uid))
})
app.delete('/api/planning/lines/:id', async (c) => {
  await deleteLine(c.env.DB, c.var.uid, idParam(c))
  return c.json(await getPlanning(c.env.DB, c.var.uid))
})
app.post('/api/planning/:scenario/copy', async (c) => {
  const { from } = await body<{ from?: unknown }>(c)
  await copyScenario(c.env.DB, c.var.uid, c.req.param('scenario'), from)
  return c.json(await getPlanning(c.env.DB, c.var.uid))
})

// ---- Tax ----
const taxOf = (c: { env: AppEnv['Bindings']; var: AppEnv['Variables'] }, year: number) => getTax(c.env.DB, c.var.uid, year)
app.get('/api/tax', async (c) => c.json(await taxOf(c, yearParam(c.req.query('year')))))
app.post('/api/tax/:year/lines', async (c) => {
  const y = yearParam(c.req.param('year'))
  await addTaxLine(c.env.DB, c.var.uid, y, await body(c))
  return c.json(await taxOf(c, y))
})
app.patch('/api/tax/lines/:id', async (c) => c.json(await taxOf(c, await updateTaxLine(c.env.DB, c.var.uid, idParam(c), await body(c)))))
app.delete('/api/tax/lines/:id', async (c) => c.json(await taxOf(c, await deleteTaxLine(c.env.DB, c.var.uid, idParam(c)))))
app.put('/api/tax/:year/budget-lines/:lineId', async (c) => {
  const y = yearParam(c.req.param('year'))
  await setLinkedLine(c.env.DB, c.var.uid, y, idParam(c, 'lineId'), await body(c))
  return c.json(await taxOf(c, y))
})
app.put('/api/tax/:year/reserve', async (c) => {
  const y = yearParam(c.req.param('year'))
  await setReserve(c.env.DB, c.var.uid, y, await body(c))
  return c.json(await taxOf(c, y))
})
app.post('/api/tax/:year/scenarios', async (c) => {
  const y = yearParam(c.req.param('year'))
  await addScenario(c.env.DB, c.var.uid, y, await body(c))
  return c.json(await taxOf(c, y))
})
app.patch('/api/tax/scenarios/:id', async (c) => c.json(await taxOf(c, await updateScenario(c.env.DB, c.var.uid, idParam(c), await body(c)))))
app.delete('/api/tax/scenarios/:id', async (c) => c.json(await taxOf(c, await deleteScenario(c.env.DB, c.var.uid, idParam(c)))))
app.post('/api/tax/scenarios/:id/apply', async (c) => c.json(await taxOf(c, await applyScenario(c.env.DB, c.var.uid, idParam(c)))))

// ---- Balance ----
const balanceOf = (c: { env: AppEnv['Bindings']; var: AppEnv['Variables'] }, month: string | null) => getBalance(c.env.DB, c.var.uid, month)
app.get('/api/balance', async (c) => c.json(await balanceOf(c, c.req.query('month') || null)))
app.post('/api/balance/:month/start', async (c) => {
  const m = monthParam(c)
  await startMonth(c.env.DB, c.var.uid, m)
  return c.json(await balanceOf(c, m))
})
app.post('/api/balance/:month/close', async (c) => {
  const m = monthParam(c)
  await closeMonth(c.env.DB, c.var.uid, m)
  return c.json(await balanceOf(c, m))
})
app.delete('/api/balance/:month', async (c) => {
  await discardDraft(c.env.DB, c.var.uid, monthParam(c))
  return c.json(await balanceOf(c, null))
})
app.put('/api/balance/:month/entries/:id', async (c) => {
  const m = monthParam(c)
  await setEntry(c.env.DB, c.var.uid, m, idParam(c), await body(c))
  return c.json(await balanceOf(c, m))
})
app.post('/api/balance/:month/entries/:id/currency', async (c) => {
  const m = monthParam(c)
  const { currency } = await body<{ currency?: unknown }>(c)
  await setCurrency(c.env.DB, c.var.uid, m, idParam(c), currency)
  return c.json(await balanceOf(c, m))
})
app.put('/api/balance/:month/fx', async (c) => {
  const m = monthParam(c)
  const { usdThb } = await body<{ usdThb?: unknown }>(c)
  await setRate(c.env.DB, c.var.uid, m, usdThb)
  return c.json(await balanceOf(c, m))
})
app.get('/api/balance/:month/fx/ecb', async (c) => c.json(await ecbUsdThb(monthParam(c))))
app.delete('/api/balance/:month/entries/:id', async (c) => {
  const m = monthParam(c)
  await removeEntry(c.env.DB, c.var.uid, m, idParam(c))
  return c.json(await balanceOf(c, m))
})
app.post('/api/balance/:month/entries/:id/restore', async (c) => {
  const m = monthParam(c)
  await restoreEntry(c.env.DB, c.var.uid, m, idParam(c))
  return c.json(await balanceOf(c, m))
})
app.post('/api/balance/:month/confirm', async (c) => {
  const m = monthParam(c)
  const { ids } = await body<{ ids?: unknown }>(c)
  await confirmRows(c.env.DB, c.var.uid, m, ids)
  return c.json(await balanceOf(c, m))
})
app.post('/api/balance/:month/items', async (c) => {
  const m = monthParam(c)
  await addItem(c.env.DB, c.var.uid, m, await body(c))
  return c.json(await balanceOf(c, m))
})
app.patch('/api/balance/:month/items/:id', async (c) => {
  const m = monthParam(c)
  await classifyItem(c.env.DB, c.var.uid, idParam(c), await body(c))
  return c.json(await balanceOf(c, m))
})
app.post('/api/balance/:month/transfers/:bank', async (c) => {
  const m = monthParam(c)
  const { done } = await body<{ done?: unknown }>(c)
  await setTransfer(c.env.DB, c.var.uid, m, c.req.param('bank'), done)
  return c.json(await balanceOf(c, m))
})

// ---- Overview ----
app.get('/api/overview', async (c) => c.json(await getOverview(c.env.DB, c.var.uid)))
app.put('/api/tier-targets', async (c) => {
  await setTierTargets(c.env.DB, c.var.uid, await body(c))
  return c.json(await getOverview(c.env.DB, c.var.uid))
})

export default app
