import { Hono } from 'hono'
import { authRoutes, requireUser } from './auth'
import type { AppEnv } from './env'
import { HttpError, jsonOnly, body, idParam, monthParam } from './http'
import { getMe } from './users'
import { addLine, copyScenario, deleteLine, getPlanning, updateLine } from './planning'
import { addItem, classifyItem, closeMonth, confirmRows, discardDraft, getBalance, removeEntry, restoreEntry, setEntry, setTransfer, startMonth } from './balance'
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
  const { thb, expr } = await body<{ thb?: unknown; expr?: unknown }>(c)
  await setEntry(c.env.DB, c.var.uid, m, idParam(c), thb, expr)
  return c.json(await balanceOf(c, m))
})
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
