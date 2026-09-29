export type Db = D1Database

export async function all<T>(db: Db, sql: string, ...p: unknown[]): Promise<T[]> {
  return (await db.prepare(sql).bind(...p).all<T>()).results
}
export function one<T>(db: Db, sql: string, ...p: unknown[]): Promise<T | null> {
  return db.prepare(sql).bind(...p).first<T>()
}
export function run(db: Db, sql: string, ...p: unknown[]) {
  return db.prepare(sql).bind(...p).run()
}
/** A bound statement for db.batch([...]) */
export const stmt = (db: Db, sql: string, ...p: unknown[]) => db.prepare(sql).bind(...p)
export const now = () => new Date().toISOString()
export const isConstraint = (e: unknown) => e instanceof Error && /constraint/i.test(e.message)
