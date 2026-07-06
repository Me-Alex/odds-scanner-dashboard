import { db } from '@/lib/db'
import { cookies } from 'next/headers'

export interface AuthUser {
  id: string
  email: string
  name: string | null
  role: string
  subscriptionTier: string
  subscriptionExpiresAt: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export async function verifyToken(token: string): Promise<AuthUser | null> {
  if (!token) return null

  const session = await db.session.findUnique({
    where: { token },
    include: { user: true },
  })

  if (!session || session.expiresAt < new Date() || !session.user.isActive) {
    // Clean up expired session
    if (session) {
      await db.session.delete({ where: { id: session.id } })
    }
    return null
  }

  const user = session.user
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    subscriptionTier: user.subscriptionTier,
    subscriptionExpiresAt: user.subscriptionExpiresAt?.toISOString() ?? null,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  }
}

export async function requireAuth(): Promise<AuthUser> {
  const cookieStore = await cookies()
  const token = cookieStore.get('arbdesk_token')?.value

  if (!token) {
    throw new AuthError('Unauthorized', 401)
  }

  const user = await verifyToken(token)
  if (!user) {
    throw new AuthError('Invalid or expired session', 401)
  }

  return user
}

export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireAuth()
  if (user.role !== 'admin') {
    throw new AuthError('Admin access required', 403)
  }
  return user
}

export async function getTokenFromRequest(request: Request): Promise<string | null> {
  // Try Authorization header first
  const authHeader = request.headers.get('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7)
  }

  // Try cookie
  const cookieHeader = request.headers.get('Cookie')
  if (cookieHeader) {
    const match = cookieHeader.match(/arbdesk_token=([^;]+)/)
    if (match) return match[1]
  }

  return null
}

export async function requireAuthFromRequest(request: Request): Promise<AuthUser> {
  const token = await getTokenFromRequest(request)

  if (!token) {
    throw new AuthError('Unauthorized', 401)
  }

  const user = await verifyToken(token)
  if (!user) {
    throw new AuthError('Invalid or expired session', 401)
  }

  return user
}

export async function requireAdminFromRequest(request: Request): Promise<AuthUser> {
  const user = await requireAuthFromRequest(request)
  if (user.role !== 'admin') {
    throw new AuthError('Admin access required', 403)
  }
  return user
}

export class AuthError extends Error {
  statusCode: number
  constructor(message: string, statusCode: number) {
    super(message)
    this.statusCode = statusCode
    this.name = 'AuthError'
  }
}

export function generateSessionToken(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('')
}