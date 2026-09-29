import { Hono } from 'hono'
import { authRoutes, requireUser } from './auth'
import type { AppEnv } from './env'
import { HttpError, jsonOnly, body, idParam } from './http'
import { getMe } from './users'
import { addLine, copyScenario, deleteLine, getPlanning, updateLine } from './planning'

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

export default app
