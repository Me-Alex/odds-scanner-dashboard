import { NextResponse } from 'next/server'
import { requireAuthFromRequest, AuthError } from '@/lib/auth'

export const runtime = 'edge'

export async function GET(request: Request) {
  try {
    await requireAuthFromRequest(request)

    const { searchParams } = new URL(request.url)
    const sport = searchParams.get('sport')
    const minEdge = parseFloat(searchParams.get('minEdge') || '0.01')
    const limit = parseInt(searchParams.get('limit') || '50', 10)
    const includeSeen = searchParams.get('includeSeen') === '1'

    try {
      // D1 first
      const D1 = await import('@/lib/cloudflare-db')
      const db = await D1.getD1()

      let query = 'SELECT * FROM ArbOpportunity WHERE edge >= ?'
      const binds: unknown[] = [minEdge]

      if (!includeSeen) {
        query += ' AND seen = 0'
      }
      if (sport) {
        query += ' AND sport = ?'
        binds.push(sport)
      }

      query += ' ORDER BY edge DESC LIMIT ?'
      binds.push(limit)

      const stmt = db.prepare(query)
      const result = await stmt.bind(...binds).all()
      const opportunities = (result.results || []) as Record<string, unknown>[]

      // Mark returned opportunities as seen
      if (!includeSeen && opportunities.length > 0) {
        const ids = opportunities.map((o) => o.id)
        for (const id of ids) {
          await db.prepare('UPDATE ArbOpportunity SET seen = 1 WHERE id = ?').bind(id).run()
        }
      }

      return NextResponse.json({ opportunities })
    } catch {
      // Prisma fallback
      const { db } = await import('@/lib/db')

      const where: Record<string, unknown> = { edge: { gte: minEdge } }
      if (!includeSeen) where.seen = false
      if (sport) where.sport = sport

      const opportunities = await db.arbOpportunity.findMany({
        where,
        orderBy: { edge: 'desc' },
        take: limit,
      })

      // Mark as seen
      if (!includeSeen && opportunities.length > 0) {
        await db.arbOpportunity.updateMany({
          where: { id: { in: opportunities.map((o) => o.id) } },
          data: { seen: true },
        })
      }

      return NextResponse.json({
        opportunities: opportunities.map((o) => ({
          ...o,
          createdAt: o.createdAt.toISOString(),
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