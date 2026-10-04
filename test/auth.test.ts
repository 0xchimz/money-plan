import { generateKeyPair } from 'jose'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetGoogleKeysForTests } from '../worker/auth'
import { allow, call, disallow, googleToken, login, ok, sql, testEnv, uidOf, uniqueEmail } from './helpers'

const count = async (query: string, ...p: unknown[]) => (await sql(query, ...p).first<{ n: number }>())!.n

describe('Google login', () => {
  it('creates the user with defaults and sets a session cookie', async () => {
    const email = uniqueEmail()
    allow(email)
    const res = await call('/api/auth/google', { json: { credential: await googleToken(email) } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ email, name: `Name ${email}`, picture: 'https://example.com/p.png' })
    const cookie = res.headers.get('set-cookie')!
    expect(cookie).toMatch(/^mp_session=[0-9a-f]{64};/)
    for (const flag of [/HttpOnly/, /Secure/, /SameSite=Lax/, /Path=\//, /Max-Age=2592000/]) expect(cookie).toMatch(flag)
    const uid = await uidOf(email)
    expect(await count('SELECT COUNT(*) AS n FROM budget_scenarios WHERE user_id = ?', uid)).toBe(3)
    expect(await count('SELECT COUNT(*) AS n FROM tier_targets WHERE user_id = ?', uid)).toBe(4)
    const names = (await sql('SELECT id, name FROM budget_scenarios WHERE user_id = ? ORDER BY sort', uid).all<{ id: string; name: string }>()).results
    expect(names).toEqual([{ id: 'main', name: 'ปัจจุบัน' }, { id: 'proj', name: 'Projection' }, { id: 'em', name: 'ตกงาน' }])
  })

  it('keeps one user row across logins', async () => {
    const { email } = await login()
    await login(email)
    expect(await count('SELECT COUNT(*) AS n FROM users WHERE email = ?', email)).toBe(1)
    expect(await count('SELECT COUNT(*) AS n FROM budget_scenarios WHERE user_id = ?', await uidOf(email))).toBe(3)
  })

  it('stores only a hash of the session token', async () => {
    const { email, cookie } = await login()
    const token = cookie.split('=')[1]
    const rows = (await sql('SELECT token_hash FROM sessions WHERE user_id = ?', await uidOf(email)).all<{ token_hash: string }>()).results
    expect(rows).toHaveLength(1)
    expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(rows[0].token_hash).not.toBe(token)
  })

  it.each([
    ['a wrong audience', { aud: 'someone-else.apps.googleusercontent.com' }],
    ['a wrong issuer', { iss: 'https://evil.example' }],
    ['an expired token', { expiresIn: Math.floor(Date.now() / 1000) - 60 }],
    ['an unverified email', { verified: false }],
  ])('rejects %s', async (_, opts) => {
    const email = uniqueEmail()
    allow(email)
    const res = await call('/api/auth/google', { json: { credential: await googleToken(email, opts) } })
    expect(res.status).toBe(401)
    expect(await count('SELECT COUNT(*) AS n FROM users WHERE email = ?', email)).toBe(0)
  })

  it('rejects a token signed by another key', async () => {
    const email = uniqueEmail()
    allow(email)
    const { privateKey } = await generateKeyPair('RS256')
    const res = await call('/api/auth/google', { json: { credential: await googleToken(email, { key: privateKey }) } })
    expect(res.status).toBe(401)
  })

  it('rejects garbage and a missing credential', async () => {
    expect((await call('/api/auth/google', { json: { credential: 'abc' } })).status).toBe(401)
    expect((await call('/api/auth/google', { json: {} })).status).toBe(400)
  })

  it('fails closed (403 not_allowed) instead of 500 when ALLOWED_EMAILS is missing (F4)', async () => {
    const email = uniqueEmail()
    const res = await call('/api/auth/google', { json: { credential: await googleToken(email) }, env: { ALLOWED_EMAILS: undefined } })
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'not_allowed', email })
    expect(await count('SELECT COUNT(*) AS n FROM users WHERE email = ?', email)).toBe(0)
  })

  it('refuses emails outside the allowlist without creating a user', async () => {
    const email = uniqueEmail('stranger')
    const res = await call('/api/auth/google', { json: { credential: await googleToken(email) } })
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'not_allowed', email })
    expect(await count('SELECT COUNT(*) AS n FROM users WHERE email = ?', email)).toBe(0)
  })

  it.each([
    ['missing', undefined as unknown as string],
    ['empty', ''],
  ])('fails closed (503) instead of skipping the audience check when GOOGLE_CLIENT_ID is %s', async (_, GOOGLE_CLIENT_ID) => {
    const email = uniqueEmail()
    allow(email)
    const res = await call('/api/auth/google', { json: { credential: await googleToken(email) }, env: { GOOGLE_CLIENT_ID } })
    expect(res.status).toBe(503)
    expect(await count('SELECT COUNT(*) AS n FROM users WHERE email = ?', email)).toBe(0)
  })

  describe('Google JWKS unreachable (remote key path)', () => {
    beforeEach(() => __resetGoogleKeysForTests())
    afterEach(() => {
      vi.restoreAllMocks()
      __resetGoogleKeysForTests()
    })

    it('answers 503, not 401, when fetching the JWKS rejects', async () => {
      const email = uniqueEmail()
      allow(email)
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))
      const res = await call('/api/auth/google', { json: { credential: await googleToken(email) }, env: { GOOGLE_JWKS_JSON: undefined } })
      expect(res.status).toBe(503)
      expect(await count('SELECT COUNT(*) AS n FROM users WHERE email = ?', email)).toBe(0)
    })

    it('answers 503, not 401, when the JWKS endpoint answers non-200', async () => {
      const email = uniqueEmail()
      allow(email)
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('boom', { status: 500 }))
      const res = await call('/api/auth/google', { json: { credential: await googleToken(email) }, env: { GOOGLE_JWKS_JSON: undefined } })
      expect(res.status).toBe(503)
      expect(await count('SELECT COUNT(*) AS n FROM users WHERE email = ?', email)).toBe(0)
    })
  })
})

describe('session', () => {
  it('needs a cookie', async () => {
    expect((await call('/api/me')).status).toBe(401)
  })

  it('returns the logged-in user', async () => {
    const { email, cookie } = await login()
    expect(await ok(call('/api/me', { cookie }))).toEqual({ email, name: `Name ${email}`, picture: 'https://example.com/p.png' })
  })

  it('expires', async () => {
    const { email, cookie } = await login()
    await sql("UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000Z' WHERE user_id = ?", await uidOf(email)).run()
    expect((await call('/api/me', { cookie })).status).toBe(401)
  })

  it('ends on logout', async () => {
    const { cookie } = await login()
    const res = await call('/api/auth/logout', { json: {}, cookie })
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toMatch(/mp_session=;.*Max-Age=0/)
    expect((await call('/api/me', { cookie })).status).toBe(401)
  })

  it('stops working when the email leaves the allowlist', async () => {
    const { email, cookie } = await login()
    disallow(email)
    const res = await call('/api/me', { cookie })
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'not_allowed', email })
  })

  it('answers unknown API paths with JSON 404 once logged in', async () => {
    const { cookie } = await login()
    const res = await call('/api/nope', { cookie })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'ไม่พบ' })
  })

  it('needs auth (401, not a 404 leak) for an unknown path under /api/auth/', async () => {
    const res = await call('/api/auth/nope')
    expect(res.status).toBe(401)
  })
})

describe('JSON-only writes', () => {
  it('rejects a form post', async () => {
    const res = await call('/api/auth/logout', { method: 'POST', body: 'x=1', headers: { 'content-type': 'application/x-www-form-urlencoded' } })
    expect(res.status).toBe(415)
  })
})

describe('demo login', () => {
  const dev = { DEV_USER_EMAIL: 'Dev@Example.com' }
  const local = { origin: 'http://localhost:5173', env: dev }

  it('does not log anyone in until the button is pressed', async () => {
    expect((await call('/api/me', local)).status).toBe(401)
  })

  it('starts a session as DEV_USER_EMAIL on localhost, without the allowlist', async () => {
    const res = await call('/api/auth/dev', { json: {}, ...local })
    expect(res.status).toBe(200)
    const cookie = res.headers.get('set-cookie')!.split(';')[0]
    const me = await ok(call('/api/me', { ...local, cookie }))
    expect(me.email).toBe('dev@example.com')
  })

  it('does not exist on any other host, and its session is refused there', async () => {
    expect((await call('/api/auth/dev', { json: {}, env: dev })).status).toBe(404)
    expect((await call('/api/auth/dev', { json: {}, origin: 'http://localhost:5173' })).status).toBe(404)
    const cookie = (await call('/api/auth/dev', { json: {}, ...local })).headers.get('set-cookie')!.split(';')[0]
    expect((await call('/api/me', { env: dev, cookie })).status).toBe(403)
  })

  it('shows in the auth config', async () => {
    expect(await ok(call('/api/auth/config', { origin: 'http://localhost:5173', env: dev }))).toEqual({ googleClientId: testEnv.GOOGLE_CLIENT_ID, dev: true })
    expect(await ok(call('/api/auth/config'))).toEqual({ googleClientId: testEnv.GOOGLE_CLIENT_ID, dev: false })
  })
})
