import { NextResponse } from 'next/server'
import { requireAuthFromRequest, AuthError } from '@/lib/auth'

export const runtime = 'edge'

export async function GET(request: Request) {
  try {
    await requireAuthFromRequest(request)

    const { searchParams } = new URL(request.url)
    const sport = searchParams.get('sport')
    const hours = parseInt(searchParams.get('hours') || '24', 10)
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

    try {
      // D1 first
      const D1 = await import('@/lib/cloudflare-db')
      const db = await D1.getD1()

      let query = 'SELECT * FROM OddsMovement WHERE createdAt >= ?'
      const binds: unknown[] = [since]

      if (sport) {
        query += ' AND sport = ?'
        binds.push(sport)
      }

      query += ' ORDER BY createdAt DESC LIMIT 100'

      const stmt = db.prepare(query)
      const result = await stmt.bind(...binds).all()

      return NextResponse.json({ movements: result.results || [] })
    } catch {
      // Prisma fallback
      const { db } = await import('@/lib/db')

      const where: Record<string, unknown> = {
        createdAt: { gte: new Date(since) },
      }
      if (sport) where.sport = sport

      const movements = await db.oddsMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 100,
      })

      return NextResponse.json({
        movements: movements.map((m) => ({
          ...m,
          createdAt: m.createdAt.toISOString(),
        })),
      })
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}