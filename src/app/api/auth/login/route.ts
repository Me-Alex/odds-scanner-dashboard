import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { generateSessionToken, AuthUser, AuthError } from '@/lib/auth'
import * as D1 from '@/lib/cloudflare-db'

// Environment detection
function isCF(): boolean {
  try {
    // @ts-expect-error - checking for Cloudflare Workers environment
    return typeof process === 'undefined' || !process.versions?.node
  } catch {
    return true
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    const normalizedEmail = email.toLowerCase().trim()

    if (isCF()) {
      return await handleLoginD1(normalizedEmail, password, request)
    }
    return await handleLoginPrisma(normalizedEmail, password, request)
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }

    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// ─── D1 Implementation ────────────────────────────────────────────────

async function handleLoginD1(email: string, password: string, request: NextRequest) {
  const db = await D1.getD1()
  const row = await D1.getUserByEmail(db, email)

  if (!row) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  }

  const user = row as Record<string, unknown>
  const isActive = user.isActive === 1 || user.isActive === true

  if (!isActive) {
    return NextResponse.json(
      { error: 'Account is deactivated. Please contact support.' },
      { status: 403 }
    )
  }

  if (!user.passwordHash) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  }

  const isValid = await bcrypt.compare(password, user.passwordHash as string)
  if (!isValid) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  }

  const token = generateSessionToken()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  await D1.createSession(db, user.id as string, token, expiresAt)

  await D1.updateUser(db, user.id as string, { lastLoginAt: new Date().toISOString() })

  const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? null
  await D1.createActivityLog(db, user.id as string, 'login', null, ip)

  const authUser: AuthUser = {
    id: user.id as string,
    email: user.email as string,
    name: (user.name as string) || null,
    role: user.role as string,
    subscriptionTier: user.subscriptionTier as string,
    subscriptionExpiresAt: (user.subscriptionExpiresAt as string) || null,
    isActive,
    createdAt: user.createdAt as string,
    updatedAt: user.updatedAt as string,
  }

  return NextResponse.json({ user: authUser, token })
}

// ─── Prisma Implementation (Local Dev) ────────────────────────────────

async function handleLoginPrisma(email: string, password: string, request: NextRequest) {
  const { db } = await import('@/lib/db')

  const user = await db.user.findUnique({ where: { email } })

  if (!user) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  }

  if (!user.isActive) {
    return NextResponse.json(
      { error: 'Account is deactivated. Please contact support.' },
      { status: 403 }
    )
  }

  if (!user.passwordHash) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  }

  const isValid = await bcrypt.compare(password, user.passwordHash)
  if (!isValid) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
  }

  const token = generateSessionToken()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  await db.session.create({ data: { userId: user.id, token, expiresAt } })
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  await db.activityLog.create({
    data: {
      userId: user.id,
      action: 'login',
      ipAddress: request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? null,
    },
  })

  const authUser: AuthUser = {
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

  return NextResponse.json({ user: authUser, token })
}