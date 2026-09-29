import { env } from 'cloudflare:test'
import { importJWK, SignJWT } from 'jose'
import type { Bindings } from '../worker/env'
import app from '../worker/index'

export type TestEnv = Bindings & { TEST_PRIVATE_JWK: string }
export const testEnv = env as unknown as TestEnv
export const ORIGIN = 'https://money-plan.test'

// Emails allowed to log in during this test file; ALLOWED_EMAILS is rebuilt from this set on every call()
const allowed = new Set<string>()
export const allow = (...emails: string[]) => { for (const e of emails) allowed.add(e.toLowerCase()) }
export const disallow = (email: string) => { allowed.delete(email.toLowerCase()) }

let n = 0
export const uniqueEmail = (prefix = 'user') => `${prefix}-${++n}-${crypto.randomUUID().slice(0, 8)}@test.dev`

/** A Google-style ID token signed with the test key (or another key to test bad signatures) */
export async function googleToken(email: string, opts: {
  aud?: string; iss?: string; expiresIn?: string | number; verified?: boolean; key?: CryptoKey
} = {}) {
  const key = opts.key ?? ((await importJWK(JSON.parse(testEnv.TEST_PRIVATE_JWK), 'RS256')) as CryptoKey)
  return new SignJWT({ email, email_verified: opts.verified ?? true, name: `Name ${email}`, picture: 'https://example.com/p.png' })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(opts.iss ?? 'https://accounts.google.com')
    .setAudience(opts.aud ?? testEnv.GOOGLE_CLIENT_ID)
    .setSubject(`sub-${email}`)
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? '1h')
    .sign(key)
}

export interface CallInit {
  method?: string
  json?: unknown                     // sets content-type: application/json and defaults the method to POST
  body?: string
  headers?: Record<string, string>
  cookie?: string
  env?: Partial<TestEnv>
  origin?: string
}
export async function call(path: string, init: CallInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  if (init.cookie) headers.set('cookie', init.cookie)
  let body = init.body
  if (init.json !== undefined) {
    headers.set('content-type', 'application/json')
    body = JSON.stringify(init.json)
  }
  const bindings = { ...testEnv, ALLOWED_EMAILS: [...allowed].join(','), ...init.env }
  const method = init.method ?? (init.json !== undefined ? 'POST' : 'GET')
  return app.request(`${init.origin ?? ORIGIN}${path}`, { method, headers, body }, bindings)
}

/** Allow the email, log in with a Google token, return the session cookie ("mp_session=…") */
export async function login(email = uniqueEmail()): Promise<{ email: string; cookie: string }> {
  allow(email)
  const res = await call('/api/auth/google', { json: { credential: await googleToken(email) } })
  if (res.status !== 200) throw new Error(`login failed ${res.status}: ${await res.text()}`)
  return { email, cookie: (res.headers.get('set-cookie') ?? '').split(';')[0] }
}

/** JSON body of a response that must be 2xx */
export async function ok<T = any>(res: Response | Promise<Response>): Promise<T> {
  const r = await res
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`)
  return r.json() as Promise<T>
}

export async function uidOf(email: string): Promise<number> {
  const row = await testEnv.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email.toLowerCase()).first<{ id: number }>()
  if (!row) throw new Error(`no user ${email}`)
  return row.id
}

/** Run SQL straight against the test D1 (setup + assertions) */
export const sql = (query: string, ...p: unknown[]) => testEnv.DB.prepare(query).bind(...p)
