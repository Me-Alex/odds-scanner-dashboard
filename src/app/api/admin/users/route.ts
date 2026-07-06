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

export async function GET(request: NextRequest) {
  try {
    await requireAdminFromRequest(request)

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')?.trim()

    if (isCF()) {
      return await handleUsersD1(search)
    }
    return await handleUsersPrisma(search)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = (error as { statusCode?: number })?.statusCode ?? 500
    return NextResponse.json({ error: message }, { status })
  }
}

// ─── D1 Implementation ────────────────────────────────────────────────

async function handleUsersD1(search?: string | null) {
  const db = await D1.getD1()
  const users = await D1.getAllUsers(db, search || undefined)

  const formattedUsers = users.map((u: Record<string, unknown>) => ({
    id: u.id,
    email: u.email,
    name: u.name || null,
    role: u.role,
    subscriptionTier: u.subscriptionTier,
    subscriptionExpiresAt: u.subscriptionExpiresAt || null,
    isActive: u.isActive === 1 || u.isActive === true,
    lastLoginAt: u.lastLoginAt || null,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  }))

  return NextResponse.json({ users: formattedUsers })
}

// ─── Prisma Implementation (Local Dev) ────────────────────────────────

async function handleUsersPrisma(search?: string | null) {
  const { db } = await import('@/lib/db')

  const users = await db.user.findMany({
    where: search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
          ],
        }
      : undefined,
    orderBy: { createdAt: 'desc' },
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

  const formattedUsers = users.map((u) => ({
    ...u,
    subscriptionExpiresAt: u.subscriptionExpiresAt?.toISOString() ?? null,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  }))

  return NextResponse.json({ users: formattedUsers })
}