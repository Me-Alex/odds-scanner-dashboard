import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { generateSessionToken, AuthUser, AuthError } from '@/lib/auth'

const ADMIN_EMAILS = ['admin@arbdesk.com', 'me.alex.21.3@gmail.com']

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

    const existing = await db.user.findUnique({
      where: { email: normalizedEmail },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 }
      )
    }

    const isAdmin = ADMIN_EMAILS.includes(normalizedEmail)
    const passwordHash = await bcrypt.hash(password, 12)

    const user = await db.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        name: name?.trim() || null,
        role: isAdmin ? 'admin' : 'user',
        subscriptionTier: isAdmin ? 'enterprise' : 'free',
        isActive: true,
      },
    })

    const token = generateSessionToken()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    await db.session.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    })

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