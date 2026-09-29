import { applyD1Migrations, env } from 'cloudflare:test'

type Migrations = Parameters<typeof applyD1Migrations>[1]
const e = env as unknown as { DB: D1Database; TEST_MIGRATIONS: Migrations }
await applyD1Migrations(e.DB, e.TEST_MIGRATIONS)
