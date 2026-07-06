import { NextResponse } from 'next/server'
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

export async function GET(request: Request) {
  try {
    await requireAdminFromRequest(request)

    if (isCF()) {
      return await handleActivityD1()
    }
    return await handleActivityPrisma()
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = (error as { statusCode?: number })?.statusCode ?? 500
    return NextResponse.json({ error: message }, { status })
  }
}

// ─── D1 Implementation ────────────────────────────────────────────────

async function handleActivityD1() {
  const db = await D1.getD1()
  const logs = await D1.getActivityLogs(db, 50)

  const activities = logs.map((log: Record<string, unknown>) => ({
    id: log.id,
    userEmail: log.userEmail,
    userName: log.userName,
    action: log.action,
    details: log.details || null,
    ipAddress: log.ipAddress || null,
    createdAt: log.createdAt,
  }))

  return NextResponse.json({ activities })
}

// ─── Prisma Implementation (Local Dev) ────────────────────────────────

async function handleActivityPrisma() {
  const { db } = await import('@/lib/db')

  const logs = await db.activityLog.findMany({
    include: {
      user: {
        select: { email: true, name: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  const activities = logs.map((log) => ({
    id: log.id,
    userEmail: log.user.email,
    userName: log.user.name,
    action: log.action,
    details: log.details,
    ipAddress: log.ipAddress,
    createdAt: log.createdAt.toISOString(),
  }))

  return NextResponse.json({ activities })
}