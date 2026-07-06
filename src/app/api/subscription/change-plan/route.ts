import { NextRequest, NextResponse } from 'next/server'
import { requireAuthFromRequest } from '@/lib/auth'
import { db } from '@/lib/db'

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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = (error as { statusCode?: number })?.statusCode ?? 500
    return NextResponse.json({ error: message }, { status })
  }
}