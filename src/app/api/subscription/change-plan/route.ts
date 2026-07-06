import { NextRequest, NextResponse } from 'next/server'
import { requireAuthFromRequest, AuthUser } from '@/lib/auth'
import * as D1 from '@/lib/cloudflare-db'

export const runtime = 'edge'

const VALID_TIERS = ['free', 'pro', 'enterprise'] as const

export async function POST(request: NextRequest) {
  try {
    const authUser = await requireAuthFromRequest(request)

    const body = await request.json()
    const { tier } = body

    if (!tier || !VALID_TIERS.includes(tier)) {
      return NextResponse.json(
        { error: `Invalid tier. Must be one of: ${VALID_TIERS.join(', ')}` },
        { status: 400 }
      )
    }

    try {
      return await handleChangePlanD1(authUser, tier)
    } catch {
      // D1 not available (local dev) — fall back to Prisma
      return await handleChangePlanPrisma(authUser, tier)
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = (error as { statusCode?: number })?.statusCode ?? 500
    return NextResponse.json({ error: message }, { status })
  }
}

// ─── D1 Implementation ────────────────────────────────────────────────

async function handleChangePlanD1(authUser: AuthUser, tier: string) {
  const db = await D1.getD1()
  const expiresAt = tier === 'free' ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  await D1.updateUser(db, authUser.id, {
    subscriptionTier: tier,
    subscriptionExpiresAt: expiresAt,
  })

  await D1.createActivityLog(db, authUser.id, 'subscription_change', `Changed subscription to ${tier}`, null)

  const updatedUser = await D1.getUserById(db, authUser.id)

  return NextResponse.json({
    user: updatedUser
      ? {
          id: updatedUser.id as string,
          email: updatedUser.email as string,
          name: (updatedUser.name as string) || null,
          role: updatedUser.role as string,
          subscriptionTier: updatedUser.subscriptionTier as string,
          subscriptionExpiresAt: (updatedUser.subscriptionExpiresAt as string) || null,
          isActive: updatedUser.isActive === 1 || updatedUser.isActive === true,
          createdAt: updatedUser.createdAt as string,
          updatedAt: updatedUser.updatedAt as string,
        }
      : authUser,
  })
}

// ─── Prisma Implementation (Local Dev) ────────────────────────────────

async function handleChangePlanPrisma(authUser: AuthUser, tier: string) {
  const { db } = await import('@/lib/db')

  const expiresAt = tier === 'free' ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

  const user = await db.user.update({
    where: { id: authUser.id },
    data: {
      subscriptionTier: tier,
      subscriptionExpiresAt: expiresAt,
    },
  })

  await db.activityLog.create({
    data: {
      userId: user.id,
      action: 'subscription_change',
      details: `Changed subscription to ${tier}`,
    },
  })

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      subscriptionTier: user.subscriptionTier,
      subscriptionExpiresAt: user.subscriptionExpiresAt?.toISOString() ?? null,
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    },
  })
}