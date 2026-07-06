import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser, createActivityLog, getClientIp } from '@/lib/auth'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser(request)
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()
    const { role, subscriptionTier, subscriptionExpiresAt, isActive } = body

    // Build update data with only provided fields
    const updateData: Record<string, unknown> = {}
    if (role !== undefined) updateData.role = role
    if (subscriptionTier !== undefined) updateData.subscriptionTier = subscriptionTier
    if (subscriptionExpiresAt !== undefined) {
      updateData.subscriptionExpiresAt = subscriptionExpiresAt
        ? new Date(subscriptionExpiresAt)
        : null
    }
    if (isActive !== undefined) updateData.isActive = isActive

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const updatedUser = await db.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        subscriptionTier: true,
        subscriptionExpiresAt: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    // Log activity
    const changes = Object.entries(updateData)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join(', ')
    await createActivityLog({
      userId: user.id,
      action: 'admin_update_user',
      details: `Updated user ${updatedUser.email} (${id}): ${changes}`,
      ipAddress: getClientIp(request),
    })

    return NextResponse.json({ user: updatedUser })
  } catch (error) {
    console.error('Admin user update error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}