import { NextRequest, NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/auth'
import * as D1 from '@/lib/cloudflare-db'

function isCF(): boolean {
  try {
    // @ts-expect-error
    return typeof process === 'undefined' || !process.versions?.node
  } catch {
    return true
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdminFromRequest(request)
    const { id } = await params

    const body = await request.json()
    const { subscriptionTier, role, isActive } = body

    if (isCF()) {
      return await handleUpdateD1(id, body, admin)
    }
    return await handleUpdatePrisma(id, body, admin)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = (error as { statusCode?: number })?.statusCode ?? 500
    return NextResponse.json({ error: message }, { status })
  }
}

// ─── D1 Implementation ────────────────────────────────────────────────

async function handleUpdateD1(userId: string, body: Record<string, unknown>, admin: { email: string }) {
  const db = await D1.getD1()

  const updateData: Record<string, unknown> = {}
  if (body.subscriptionTier) updateData.subscriptionTier = body.subscriptionTier
  if (body.role) updateData.role = body.role
  if (typeof body.isActive === 'boolean') updateData.isActive = body.isActive

  await D1.updateUser(db, userId, updateData)

  // Log activity
  const actions: string[] = []
  if (body.subscriptionTier) actions.push(`subscription changed to ${body.subscriptionTier}`)
  if (body.role) actions.push(`role changed to ${body.role}`)
  if (typeof body.isActive === 'boolean') actions.push(`active set to ${body.isActive}`)

  if (actions.length > 0) {
    await D1.createActivityLog(db, userId, 'admin_update', `Admin ${admin.email}: ${actions.join(', ')}`, null)
  }

  const user = await D1.getUserById(db, userId)

  return NextResponse.json({
    user: user
      ? {
          id: user.id as string,
          email: user.email as string,
          name: (user.name as string) || null,
          role: user.role as string,
          subscriptionTier: user.subscriptionTier as string,
          subscriptionExpiresAt: (user.subscriptionExpiresAt as string) || null,
          isActive: user.isActive === 1 || user.isActive === true,
          lastLoginAt: (user.lastLoginAt as string) || null,
          createdAt: user.createdAt as string,
          updatedAt: user.updatedAt as string,
        }
      : null,
  })
}

// ─── Prisma Implementation (Local Dev) ────────────────────────────────

async function handleUpdatePrisma(userId: string, body: Record<string, unknown>, admin: { email: string }) {
  const { db } = await import('@/lib/db')

  const updateData: Record<string, unknown> = {}
  if (body.subscriptionTier) updateData.subscriptionTier = body.subscriptionTier
  if (body.role) updateData.role = body.role
  if (typeof body.isActive === 'boolean') updateData.isActive = body.isActive

  const user = await db.user.update({
    where: { id: userId },
    data: updateData,
  })

  // Log activity
  const actions: string[] = []
  if (body.subscriptionTier) actions.push(`subscription changed to ${body.subscriptionTier}`)
  if (body.role) actions.push(`role changed to ${body.role}`)
  if (typeof body.isActive === 'boolean') actions.push(`active set to ${body.isActive}`)

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
}