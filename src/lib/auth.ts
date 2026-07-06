import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { db } from '@/lib/db'

const SESSION_EXPIRY_DAYS = 7

/**
 * Hash a plain-text password using bcrypt.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

/**
 * Verify a plain-text password against a stored hash.
 */
export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

/**
 * Create a new session token (random 32-byte hex string).
 */
export function createSessionToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Create a session in the database for a given user.
 * Returns the token string.
 */
export async function createSession(
  userId: string,
): Promise<string> {
  const token = createSessionToken()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + SESSION_EXPIRY_DAYS)

  await db.session.create({
    data: {
      userId,
      token,
      expiresAt,
    },
  })

  return token
}

/**
 * Verify a session token and return the associated session with user.
 * Returns null if the session is invalid, expired, or not found.
 */
export async function verifySession(
  token: string,
) {
  const session = await db.session.findUnique({
    where: { token },
    include: { user: true },
  })

  if (!session) return null

  if (new Date() > session.expiresAt) {
    // Clean up expired session
    await db.session.delete({ where: { id: session.id } })
    return null
  }

  return session
}

/**
 * Create an activity log entry.
 */
export async function createActivityLog(params: {
  userId: string
  action: string
  details?: string
  ipAddress?: string | null
}): Promise<void> {
  await db.activityLog.create({
    data: {
      userId: params.userId,
      action: params.action,
      details: params.details ?? null,
      ipAddress: params.ipAddress ?? null,
    },
  })
}

/**
 * Extract the Bearer token from the Authorization header.
 * Returns null if no valid token is found.
 */
function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null
  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null
  return parts[1]
}

/**
 * Get the current authenticated user from a Request object.
 * Checks the Authorization header for a Bearer token and validates the session.
 * Returns the user object (without passwordHash) or null.
 */
export async function getCurrentUser(request: Request) {
  const authHeader = request.headers.get('Authorization')
  const token = extractBearerToken(authHeader)

  if (!token) return null

  const session = await verifySession(token)
  if (!session) return null

  // Check if user is active
  if (!session.user.isActive) return null

  // Omit passwordHash from the returned user
  const { passwordHash: _, ...userWithoutPassword } = session.user
  return userWithoutPassword
}

/**
 * Get the client IP address from request headers.
 */
export function getClientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() ?? null
  }
  return request.headers.get('x-real-ip') ?? null
}