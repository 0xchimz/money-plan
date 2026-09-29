import { Hono, type Context, type MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { createLocalJWKSet, createRemoteJWKSet, errors, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose'
import type { AuthConfig } from '../shared/types'
import { now, one, run, stmt } from './db'
import type { AppEnv, Bindings } from './env'
import { bad, body, HttpError } from './http'
import { findOrCreateUser, getMe, type GoogleProfile } from './users'

export const COOKIE = 'mp_session'
const SESSION_DAYS = 30
const GOOGLE_JWKS = 'https://www.googleapis.com/oauth2/v3/certs'
const ISSUERS = ['accounts.google.com', 'https://accounts.google.com']

let remoteKeys: JWTVerifyGetKey | null = null
const googleKeys = (env: Bindings): JWTVerifyGetKey =>
  env.GOOGLE_JWKS_JSON ? createLocalJWKSet(JSON.parse(env.GOOGLE_JWKS_JSON)) : (remoteKeys ??= createRemoteJWKSet(new URL(GOOGLE_JWKS)))

export const allowed = (env: Bindings, email: string) =>
  env.ALLOWED_EMAILS.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase())

/** Check a Google ID token: signature (Google's keys), issuer, audience = our client id, expiry, verified email */
export async function verifyGoogleToken(env: Bindings, credential: string): Promise<GoogleProfile> {
  let payload: JWTPayload
  try {
    ({ payload } = await jwtVerify(credential, googleKeys(env), { issuer: ISSUERS, audience: env.GOOGLE_CLIENT_ID }))
  } catch (e) {
    if (e instanceof errors.JWKSTimeout || !(e instanceof errors.JOSEError)) throw new HttpError(503, 'ระบบ login ของ Google ไม่ตอบ ลองใหม่อีกครั้ง')
    throw new HttpError(401, 'token ของ Google ไม่ถูกต้องหรือหมดอายุ')
  }
  const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : ''
  if (!email || payload.email_verified !== true) throw new HttpError(401, 'บัญชี Google นี้ยังไม่ได้ยืนยันอีเมล')
  return {
    email,
    name: typeof payload.name === 'string' ? payload.name : null,
    picture: typeof payload.picture === 'string' ? payload.picture : null,
  }
}

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
export const hashToken = async (token: string) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))))

async function startSession(c: Context<AppEnv>, uid: number) {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const token = hex(bytes)
  const t = now()
  await c.env.DB.batch([
    stmt(c.env.DB, 'DELETE FROM sessions WHERE user_id = ? AND expires_at < ?', uid, t),
    stmt(c.env.DB, 'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
      await hashToken(token), uid, t, new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString()),
  ])
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === 'https:',
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_DAYS * 86_400,
  })
}

/** DEV_USER_EMAIL acts as the logged-in user, but only for requests to localhost */
function devEmail(c: Context<AppEnv>): string | null {
  const email = c.env.DEV_USER_EMAIL?.trim().toLowerCase()
  if (!email) return null
  const host = new URL(c.req.url).hostname
  return host === 'localhost' || host === '127.0.0.1' ? email : null
}

export const authRoutes = new Hono<AppEnv>()

authRoutes.get('/config', (c) => {
  const config: AuthConfig = { googleClientId: c.env.GOOGLE_CLIENT_ID, dev: devEmail(c) != null }
  return c.json(config)
})

authRoutes.post('/google', async (c) => {
  const { credential } = await body<{ credential?: unknown }>(c)
  if (typeof credential !== 'string' || !credential) throw bad('ไม่มี credential จาก Google')
  const profile = await verifyGoogleToken(c.env, credential)
  if (!allowed(c.env, profile.email)) throw new HttpError(403, 'not_allowed', { email: profile.email })
  const user = await findOrCreateUser(c.env.DB, profile)
  await startSession(c, user.id)
  return c.json(await getMe(c.env.DB, user.id))
})

authRoutes.post('/logout', async (c) => {
  const token = getCookie(c, COOKIE)
  if (token) await run(c.env.DB, 'DELETE FROM sessions WHERE token_hash = ?', await hashToken(token))
  deleteCookie(c, COOKIE, { path: '/' })
  return c.json({ ok: true })
})

const PUBLIC = ['/api/auth/', '/api/health']

/** Every other /api/* route needs a live session whose email is still on the allowlist */
export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (PUBLIC.some((p) => c.req.path.startsWith(p))) return next()
  const dev = devEmail(c)
  if (dev) {
    const user = await findOrCreateUser(c.env.DB, { email: dev, name: 'Dev', picture: null })
    c.set('uid', user.id)
    c.set('email', user.email)
    return next()
  }
  const token = getCookie(c, COOKIE)
  if (!token) return c.json({ error: 'กรุณาเข้าสู่ระบบ' }, 401)
  const row = await one<{ user_id: number; email: string }>(c.env.DB,
    'SELECT s.user_id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?',
    await hashToken(token), now())
  if (!row) return c.json({ error: 'session หมดอายุ กรุณาเข้าสู่ระบบใหม่' }, 401)
  if (!allowed(c.env, row.email)) return c.json({ error: 'not_allowed', email: row.email }, 403)
  c.set('uid', row.user_id)
  c.set('email', row.email)
  await next()
}
