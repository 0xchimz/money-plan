import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'
import { exportJWK, generateKeyPair } from 'jose'
import { defineConfig } from 'vitest/config'

export default defineConfig(async () => {
  const migrations = await readD1Migrations('./migrations')
  // Stand-in for Google's signing key: tests sign ID tokens with the private half, the Worker checks with the public half
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true })
  const pub = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' }
  const priv = { ...(await exportJWK(privateKey)), kid: 'test-key', alg: 'RS256' }
  return {
    plugins: [
      cloudflareTest({
        main: './worker/index.ts',
        miniflare: {
          // @cloudflare/vitest-pool-workers 0.22.0 bundles workerd 1.20260815.1, whose newest
          // supported compatibility date is 2026-08-22 (wrangler bundles a newer workerd that
          // does support 2026-09-01, used in wrangler.jsonc for the real deploy)
          compatibilityDate: '2026-08-22',
          d1Databases: { DB: 'money-plan-test' },
          bindings: {
            GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
            ALLOWED_EMAILS: '',
            GOOGLE_JWKS_JSON: JSON.stringify({ keys: [pub] }),
            TEST_PRIVATE_JWK: JSON.stringify(priv),
            TEST_MIGRATIONS: migrations,
          },
        },
      }),
    ],
    test: {
      include: ['test/**/*.test.ts'],
      setupFiles: ['./test/apply-migrations.ts'],
    },
  }
})
