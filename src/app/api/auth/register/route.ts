import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { generateSessionToken, AuthUser, AuthError } from '@/lib/auth'
import * as D1 from '@/lib/cloudflare-db'

const ADMIN_EMAILS = ['admin@arbdesk.com', 'me.alex.21.3@gmail.com']

function isCF(): boolean {
  try {
    // @ts-expect-error
    return typeof process === 'undefined' || !process.versions?.node
  } catch {
    return true
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password, name } = body

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      )
    }

    const normalizedEmail = email.toLowerCase().trim()

    if (isCF()) {
      return await handleRegisterD1(normalizedEmail, password, name, request)
    }
    return await handleRegisterPrisma(normalizedEmail, password, name, request)
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }

    console.error('Register error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// ─── D1 Implementation ────────────────────────────────────────────────

async function handleRegisterD1(email: string, password: string, name: string | undefined, request: NextRequest) {
  const db = await D1.getD1()

  const existing = await D1.getUserByEmail(db, email)
  if (existing) {
    return NextResponse.json(
      { error: 'An account with this email already exists' },
      { status: 409 }
    )
  }

  const isAdmin = ADMIN_EMAILS.includes(email)
  const passwordHash = await bcrypt.hash(password, 12)
  const userId = crypto.randomUUID()

  await D1.createUser(db, {
    id: userId,
    email,
    passwordHash,
    name: name?.trim() || null,
    role: isAdmin ? 'admin' : 'user',
    subscriptionTier: isAdmin ? 'enterprise' : 'free',
    isActive: true,
  })

  const token = generateSessionToken()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  await D1.createSession(db, userId, token, expiresAt)

  const ip = request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? null
  await D1.createActivityLog(db, userId, 'register', null, ip)

  const authUser: AuthUser = {
    id: userId,
    email,
    name: name?.trim() || null,
    role: isAdmin ? 'admin' : 'user',
    subscriptionTier: isAdmin ? 'enterprise' : 'free',
    subscriptionExpiresAt: null,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  return NextResponse.json({ user: authUser, token }, { status: 201 })
}

// ─── Prisma Implementation (Local Dev) ────────────────────────────────

async function handleRegisterPrisma(email: string, password: string, name: string | undefined, request: NextRequest) {
  const { db } = await import('@/lib/db')

  const existing = await db.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json(
      { error: 'An account with this email already exists' },
      { status: 409 }
    )
  }

  const isAdmin = ADMIN_EMAILS.includes(email)
  const passwordHash = await bcrypt.hash(password, 12)

  const user = await db.user.create({
    data: {
      email,
      passwordHash,
      name: name?.trim() || null,
      role: isAdmin ? 'admin' : 'user',
      subscriptionTier: isAdmin ? 'enterprise' : 'free',
      isActive: true,
    },
  })

  const token = generateSessionToken()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  await db.session.create({ data: { userId: user.id, token, expiresAt } })
  await db.activityLog.create({
    data: {
      userId: user.id,
      action: 'register',
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

  return NextResponse.json({ user: authUser, token }, { status: 201 })
}