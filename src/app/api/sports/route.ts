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
        .prepare('SELECT sport, COUNT(*) as eventCount FROM ScrapedEvent GROUP BY sport ORDER BY eventCount DESC')
        .all()

      return NextResponse.json({ sports: result.results || [] })
    } catch {
      // Prisma fallback
      const { db } = await import('@/lib/db')

      const sports = await db.scrapedEvent.groupBy({
        by: ['sport'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      })

      const mapped = sports.map((s) => ({
        sport: s.sport,
        eventCount: s._count.id,
      }))

      return NextResponse.json({ sports: mapped })
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}