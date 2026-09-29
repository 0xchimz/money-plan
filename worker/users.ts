import { TIERS, type Me, type Tier } from '../shared/types'
import { isConstraint, now, one, run, stmt, type Db } from './db'

export interface GoogleProfile { email: string; name: string | null; picture: string | null }

export const DEFAULT_SCENARIOS = [
  { id: 'main', name: 'ปัจจุบัน', note: null, sort: 0 },
  { id: 'proj', name: 'Projection', note: 'แผนอนาคต เช่น หลังขึ้นเงินเดือน แต่งงาน ย้ายบ้าน', sort: 1 },
  { id: 'em', name: 'ตกงาน', note: 'รายจ่ายที่ยังต้องจ่ายถ้าไม่มีรายได้ · ใช้คำนวณเป้าเงินสำรองฉุกเฉิน', sort: 2 },
] as const

export const DEFAULT_TARGETS: Record<Tier, number> = { Foundation: 0.1, Core: 0.4, Growth: 0.35, 'High Risk': 0.15 }

/** The user for a verified Google profile; a first login also creates the three scenarios and the tier targets in one batch */
export async function findOrCreateUser(db: Db, p: GoogleProfile): Promise<Me & { id: number }> {
  const email = p.email.toLowerCase()
  const hit = await one<{ id: number }>(db, 'SELECT id FROM users WHERE email = ?', email)
  if (hit) {
    await run(db, 'UPDATE users SET name = COALESCE(?, name), picture = COALESCE(?, picture) WHERE id = ?', p.name, p.picture, hit.id)
  } else {
    try {
      await db.batch([
        stmt(db, 'INSERT INTO users (email, name, picture, created_at) VALUES (?, ?, ?, ?)', email, p.name, p.picture, now()),
        ...DEFAULT_SCENARIOS.map((s) => stmt(db,
          'INSERT INTO budget_scenarios (user_id, id, name, note, sort) SELECT id, ?, ?, ?, ? FROM users WHERE email = ?',
          s.id, s.name, s.note, s.sort, email)),
        ...TIERS.map((t) => stmt(db,
          'INSERT INTO tier_targets (user_id, tier, target) SELECT id, ?, ? FROM users WHERE email = ?',
          t, DEFAULT_TARGETS[t], email)),
      ])
    } catch (e) {
      if (!isConstraint(e)) throw e // two first logins at once: the other request created the user
    }
  }
  return (await one<Me & { id: number }>(db, 'SELECT id, email, name, picture FROM users WHERE email = ?', email))!
}

export async function getMe(db: Db, uid: number): Promise<Me> {
  return (await one<Me>(db, 'SELECT email, name, picture FROM users WHERE id = ?', uid))!
}
