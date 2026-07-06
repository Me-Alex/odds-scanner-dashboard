import { NextResponse } from 'next/server'
import { requireAuthFromRequest, AuthError } from '@/lib/auth'

export const runtime = 'edge'

export async function GET(request: Request) {
  try {
    await requireAuthFromRequest(request)

    try {
      // D1 first
      const D1 = await import('@/lib/cloudflare-db')
      const db = await D1.getD1()

      const result = await db
        .prepare('SELECT * FROM Bookmaker ORDER BY name ASC')
        .all()

      const bookmakers = (result.results || []) as Record<string, unknown>[]
      const mapped = bookmakers.map((b) => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
        isActive: b.isActive === 1 || b.isActive === true,
        lastScrapeAt: b.lastScrapeAt || null,
        lastError: b.lastError || null,
        eventsCount: b.eventsCount || 0,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
      }))

      return NextResponse.json({ bookmakers: mapped })
    } catch {
      // Prisma fallback
      const { db } = await import('@/lib/db')

      const bookmakers = await db.bookmaker.findMany({
        orderBy: { name: 'asc' },
      })

      const mapped = bookmakers.map((b) => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
        isActive: b.isActive,
        lastScrapeAt: b.lastScrapeAt?.toISOString() || null,
        lastError: b.lastError || null,
        eventsCount: b.eventsCount,
        createdAt: b.createdAt.toISOString(),
        updatedAt: b.updatedAt.toISOString(),
      }))

      return NextResponse.json({ bookmakers: mapped })
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}