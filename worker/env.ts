export interface Bindings {
  DB: D1Database
  GOOGLE_CLIENT_ID: string
  ALLOWED_EMAILS: string
  DEV_USER_EMAIL?: string
  /** Tests only: a JWKS JSON used instead of Google's keys */
  GOOGLE_JWKS_JSON?: string
}

export type AppEnv = { Bindings: Bindings; Variables: { uid: number; email: string } }
