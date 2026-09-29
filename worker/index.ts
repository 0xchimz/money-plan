import { Hono } from 'hono'
import { authRoutes, requireUser } from './auth'
import type { AppEnv } from './env'
import { HttpError, jsonOnly } from './http'
import { getMe } from './users'

const app = new Hono<AppEnv>()

app.onError((e, c) => {
  if (e instanceof HttpError) return c.json({ error: e.message, ...e.extra }, e.status)
  console.error(e)
  return c.json({ error: 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง' }, 500)
})
app.notFound((c) => c.json({ error: 'ไม่พบ' }, 404))

app.use('/api/*', jsonOnly)
app.get('/api/health', (c) => c.json({ ok: true }))

// ---- routes added by later tasks go below this line ----

app.route('/api/auth', authRoutes)
app.use('/api/*', requireUser)
app.get('/api/me', async (c) => c.json(await getMe(c.env.DB, c.var.uid)))

export default app
