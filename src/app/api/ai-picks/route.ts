import { NextResponse } from 'next/server'
import { requireAuthFromRequest, AuthError } from '@/lib/auth'

export const runtime = 'edge'

export async function GET(request: Request) {
  try {
    const user = await requireAuthFromRequest(request)

    const { searchParams } = new URL(request.url)
    const sport = searchParams.get('sport')
    const result = searchParams.get('result')
    const limit = parseInt(searchParams.get('limit') || '50', 10)

    try {
      // D1 first
      const D1 = await import('@/lib/cloudflare-db')
      const db = await D1.getD1()

      let query = 'SELECT * FROM AiPickLog WHERE userId = ?'
      const binds: unknown[] = [user.id]
      if (sport) {
        query += ' AND sport = ?'
        binds.push(sport)
      }
      if (result) {
        query += ' AND result = ?'
        binds.push(result)
      }

      query += ' ORDER BY createdAt DESC LIMIT ?'
      binds.push(limit)

      const stmt = db.prepare(query)
      const picksResult = await stmt.bind(...binds).all()

      return NextResponse.json({ picks: picksResult.results || [] })
    } catch {
      // Prisma fallback
      const { db } = await import('@/lib/db')

      const where: Record<string, unknown> = { userId: user.id }
      if (sport) where.sport = sport
      if (result) where.result = result

      const picks = await db.aiPickLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
      })

      return NextResponse.json({
        picks: picks.map((p) => ({
          ...p,
          createdAt: p.createdAt.toISOString(),
          settledAt: p.settledAt?.toISOString() || null,
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