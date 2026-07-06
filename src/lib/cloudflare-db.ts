/**
 * Cloudflare D1 Database Helper
 * Provides functions to interact with Cloudflare D1 for edge runtime.
 * Used by API routes when running on Cloudflare Pages Workers.
 */

export interface D1Database {
  prepare(query: string): D1PreparedStatement
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<T[]>
  dump(): Promise<ArrayBuffer>
  exec(query: string): Promise<void>
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = unknown>(colName?: string): Promise<T | null>
  run(): Promise<D1Result>
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>
  raw<T = unknown[]>(): Promise<T>
}

export interface D1Result<T = Record<string, unknown>> {
  results?: T[]
  success: boolean
  meta?: Record<string, unknown>
}

export type Env = {
  DB: D1Database
}

// Get the D1 database binding from Cloudflare Workers environment
// Throws if not running on Cloudflare Pages (callers should catch and fall back to Prisma)
export async function getD1(): Promise<D1Database> {
  // Dynamic import to avoid bundling in non-Cloudflare environments
  const { getRequestContext } = await import('@cloudflare/next-on-pages')
  const { env } = await getRequestContext()
  return env.DB as D1Database
}

// ─── Helper Functions ────────────────────────────────────────────────

export async function getUserByEmail(db: D1Database, email: string) {
  const result = await db
    .prepare('SELECT * FROM User WHERE email = ?')
    .bind(email)
    .first()
  return result || null
}

export async function createUser(
  db: D1Database,
  data: {
    id: string
    email: string
    passwordHash: string
    name: string | null
    role: string
    subscriptionTier: string
    isActive: boolean
  }
) {
  const now = new Date().toISOString()
  await db
    .prepare(
      `INSERT INTO User (id, email, passwordHash, name, role, subscriptionTier, isActive, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      data.id,
      data.email,
      data.passwordHash,
      data.name,
      data.role,
      data.subscriptionTier,
      data.isActive ? 1 : 0,
      now,
      now
    )
    .run()
}

export async function createSession(
  db: D1Database,
  userId: string,
  token: string,
  expiresAt: string
) {
  const id = crypto.randomUUID()
  await db
    .prepare('INSERT INTO Session (id, userId, token, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?)')
    .bind(id, userId, token, expiresAt, new Date().toISOString())
    .run()
}

export async function getUserByToken(db: D1Database, token: string) {
  const result = await db
    .prepare(
      `SELECT s.token, s.expiresAt as sessionExpiresAt,
              u.id, u.email, u.name, u.role, u.subscriptionTier, 
              u.subscriptionExpiresAt, u.isActive, u.lastLoginAt,
              u.createdAt, u.updatedAt
       FROM Session s
       JOIN User u ON s.userId = u.id
       WHERE s.token = ?`
    )
    .bind(token)
    .first()
  return result || null
}

export async function deleteSession(db: D1Database, token: string) {
  await db.prepare('DELETE FROM Session WHERE token = ?').bind(token).run()
}

export async function updateSessionExpiry(
  db: D1Database,
  token: string,
  userId: string,
  expiresAt: string
) {
  await db
    .prepare('UPDATE Session SET expiresAt = ? WHERE token = ? AND userId = ?')
    .bind(expiresAt, token, userId)
    .run()
}

export async function updateUser(
  db: D1Database,
  userId: string,
  data: Record<string, unknown>
) {
  const fields: string[] = []
  const values: unknown[] = []

  for (const [key, value] of Object.entries(data)) {
    // Map camelCase to snake_case for DB columns
    const columnMap: Record<string, string> = {
      subscriptionTier: 'subscriptionTier',
      role: 'role',
      isActive: 'isActive',
      lastLoginAt: 'lastLoginAt',
      subscriptionExpiresAt: 'subscriptionExpiresAt',
    }
    const col = columnMap[key] || key
    fields.push(`${col} = ?`)
    if (key === 'isActive' && typeof value === 'boolean') {
      values.push(value ? 1 : 0)
    } else {
      values.push(value)
    }
  }

  fields.push("updatedAt = ?")
  values.push(new Date().toISOString())
  values.push(userId)

  await db
    .prepare(`UPDATE User SET ${fields.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run()
}

export async function getAllUsers(db: D1Database, search?: string) {
  let query = `SELECT id, email, name, role, subscriptionTier, subscriptionExpiresAt,
                      isActive, lastLoginAt, createdAt, updatedAt
               FROM User`
  const binds: unknown[] = []

  if (search) {
    query += ` WHERE email LIKE ? OR name LIKE ?`
    const pattern = `%${search}%`
    binds.push(pattern, pattern)
  }

  query += ` ORDER BY createdAt DESC`

  const stmt = db.prepare(query)
  const result = await (binds.length > 0 ? stmt.bind(...binds) : stmt).all()
  return result.results || []
}

export async function createActivityLog(
  db: D1Database,
  userId: string,
  action: string,
  details: string | null,
  ipAddress: string | null
) {
  const id = crypto.randomUUID()
  await db
    .prepare(
      'INSERT INTO ActivityLog (id, userId, action, details, ipAddress, createdAt) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .bind(id, userId, action, details, ipAddress, new Date().toISOString())
    .run()
}

export async function getActivityLogs(db: D1Database, limit: number = 50) {
  const result = await db
    .prepare(
      `SELECT al.id, al.action, al.details, al.ipAddress, al.createdAt,
              u.email as userEmail, u.name as userName
       FROM ActivityLog al
       JOIN User u ON al.userId = u.id
       ORDER BY al.createdAt DESC
       LIMIT ?`
    )
    .bind(limit)
    .all()
  return result.results || []
}

export async function getScrapingLogs(db: D1Database) {
  const result = await db
    .prepare('SELECT id, provider, status, eventsFound, durationMs, errorMsg, createdAt FROM ScrapingLog ORDER BY createdAt DESC')
    .all()
  return result.results || []
}

export async function countUsers(db: D1Database) {
  const result = await db.prepare('SELECT COUNT(*) as count FROM User').first<{ count: number }>()
  return result?.count ?? 0
}

export async function countActiveUsers(db: D1Database) {
  const result = await db.prepare('SELECT COUNT(*) as count FROM User WHERE isActive = 1').first<{ count: number }>()
  return result?.count ?? 0
}

export async function countUsersByTier(db: D1Database, tier: string) {
  const result = await db
    .prepare('SELECT COUNT(*) as count FROM User WHERE subscriptionTier = ? AND isActive = 1')
    .bind(tier)
    .first<{ count: number }>()
  return result?.count ?? 0
}

export async function countBets(db: D1Database) {
  const result = await db.prepare('SELECT COUNT(*) as count FROM BetJournal').first<{ count: number }>()
  return result?.count ?? 0
}

export async function countArbs(db: D1Database) {
  const result = await db.prepare('SELECT COUNT(*) as count FROM ArbAlert').first<{ count: number }>()
  return result?.count ?? 0
}

export async function countRecentScrapes(db: D1Database, since: string) {
  const result = await db
    .prepare('SELECT COUNT(*) as count FROM ScrapingLog WHERE createdAt >= ?')
    .bind(since)
    .first<{ count: number }>()
  return result?.count ?? 0
}

export async function countNewUsersSince(db: D1Database, since: string) {
  const result = await db
    .prepare('SELECT COUNT(*) as count FROM User WHERE createdAt >= ?')
    .bind(since)
    .first<{ count: number }>()
  return result?.count ?? 0
}

export async function getUserById(db: D1Database, id: string) {
  const result = await db
    .prepare(
      `SELECT id, email, name, role, subscriptionTier, subscriptionExpiresAt,
              isActive, lastLoginAt, createdAt, updatedAt
       FROM User WHERE id = ?`
    )
    .bind(id)
    .first()
  return result || null
}