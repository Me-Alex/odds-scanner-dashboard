import { NextResponse } from 'next/server'
import { requireAdminFromRequest } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(request: Request) {
  try {
    await requireAdminFromRequest(request)

    const logs = await db.scrapingLog.findMany({
      orderBy: { createdAt: 'desc' },
    })

    const formattedLogs = logs.map((log) => ({
      id: log.id,
      provider: log.provider,
      status: log.status,
      eventsFound: log.eventsFound,
      durationMs: log.durationMs,
      createdAt: log.createdAt.toISOString(),
    }))

    return NextResponse.json({ logs: formattedLogs })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = (error as { statusCode?: number })?.statusCode ?? 500
    return NextResponse.json({ error: message }, { status })
  }
}