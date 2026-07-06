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
      return await handleScrapingLogsD1()
    }
    return await handleScrapingLogsPrisma()
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = (error as { statusCode?: number })?.statusCode ?? 500
    return NextResponse.json({ error: message }, { status })
  }
}

// ─── D1 Implementation ────────────────────────────────────────────────

async function handleScrapingLogsD1() {
  const db = await D1.getD1()
  const logs = await D1.getScrapingLogs(db)

  const formattedLogs = logs.map((log: Record<string, unknown>) => ({
    id: log.id,
    provider: log.provider,
    status: log.status,
    eventsFound: log.eventsFound,
    durationMs: log.durationMs || null,
    createdAt: log.createdAt,
  }))

  return NextResponse.json({ logs: formattedLogs })
}

// ─── Prisma Implementation (Local Dev) ────────────────────────────────

async function handleScrapingLogsPrisma() {
  const { db } = await import('@/lib/db')

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
}