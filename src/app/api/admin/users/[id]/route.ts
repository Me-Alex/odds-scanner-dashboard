import { NextRequest, NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/auth'
import { db } from '@/lib/db'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdminFromRequest(request)
    const { id } = await params

    const body = await request.json()
    const { subscriptionTier, role, isActive } = body

    const updateData: Record<string, unknown> = {}
    if (subscriptionTier) updateData.subscriptionTier = subscriptionTier
    if (role) updateData.role = role
    if (typeof isActive === 'boolean') updateData.isActive = isActive

    const user = await db.user.update({
      where: { id },
      data: updateData,
    })

    // Log activity
    const actions: string[] = []
    if (subscriptionTier) actions.push(`subscription changed to ${subscriptionTier}`)
    if (role) actions.push(`role changed to ${role}`)
    if (typeof isActive === 'boolean') actions.push(`active set to ${isActive}`)

    if (actions.length > 0) {
      await db.activityLog.create({
        data: {
          userId: user.id,
          action: 'admin_update',
          details: `Admin ${admin.email}: ${actions.join(', ')}`,
        },
      })
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        subscriptionTier: user.subscriptionTier,
        subscriptionExpiresAt: user.subscriptionExpiresAt?.toISOString() ?? null,
        isActive: user.isActive,
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
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