import type { Context, MiddlewareHandler } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { isMonth } from '../shared/month'

// no parameter properties: tsconfig has erasableSyntaxOnly
export class HttpError extends Error {
  status: ContentfulStatusCode
  extra?: Record<string, unknown>
  constructor(status: ContentfulStatusCode, message: string, extra?: Record<string, unknown>) {
    super(message)
    this.status = status
    this.extra = extra
  }
}
export const bad = (message: string) => new HttpError(400, message)
export const notFound = (message = 'ไม่พบข้อมูล') => new HttpError(404, message)
export const conflict = (message: string) => new HttpError(409, message)

/** Writes must be JSON: an HTML form on another site cannot send that without a CORS preflight (we never allow CORS) */
export const jsonOnly: MiddlewareHandler = async (c, next) => {
  const m = c.req.method
  if (m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS' && !(c.req.header('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return c.json({ error: 'ต้องส่งข้อมูลเป็น JSON' }, 415)
  }
  await next()
}

export async function body<T = Record<string, unknown>>(c: Context): Promise<T> {
  try {
    return await c.req.json<T>()
  } catch {
    throw bad('ข้อมูลที่ส่งมาไม่ใช่ JSON ที่ถูกต้อง')
  }
}

export function monthParam(c: Context): string {
  const m = c.req.param('month') ?? ''
  if (!isMonth(m)) throw bad('เดือนต้องอยู่ในรูปแบบ YYYY-MM')
  return m
}

export function idParam(c: Context, key = 'id'): number {
  const n = Number(c.req.param(key))
  if (!Number.isInteger(n) || n <= 0) throw notFound()
  return n
}
