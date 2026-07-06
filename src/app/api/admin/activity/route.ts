import { NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(request: Request) {
  try {
    await requireAdminFromRequest(request)

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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = (error as { statusCode?: number })?.statusCode ?? 500
    return NextResponse.json({ error: message }, { status })
  }
}