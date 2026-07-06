import { NextResponse } from 'next/server'
import { requireAuthFromRequest, AuthError } from '@/lib/auth'

export const runtime = 'edge'

export async function GET(request: Request) {
  try {
    await requireAuthFromRequest(request)

    const { searchParams } = new URL(request.url)
    const sport = searchParams.get('sport')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const minEdge = parseFloat(searchParams.get('minEdge') || '0')
    const limit = parseInt(searchParams.get('limit') || '100', 10)

    try {
      // D1 first
      const D1 = await import('@/lib/cloudflare-db')
      const db = await D1.getD1()

      let query = 'SELECT * FROM ArbOpportunity WHERE 1=1'
      const binds: unknown[] = []

      if (sport) {
        query += ' AND sport = ?'
        binds.push(sport)
      }
      if (from) {
        query += ' AND createdAt >= ?'
        binds.push(from)
      }
      if (to) {
        query += ' AND createdAt <= ?'
        binds.push(to)
      }
      if (minEdge > 0) {
        query += ' AND edge >= ?'
        binds.push(minEdge)
      }

      query += ' ORDER BY createdAt DESC LIMIT ?'
      binds.push(limit)

      const stmt = db.prepare(query)
      const result = await stmt.bind(...binds).all()

      return NextResponse.json({ arbs: result.results || [] })
    } catch {
      // Prisma fallback
      const { db } = await import('@/lib/db')

      const where: Record<string, unknown> = {}
      if (sport) where.sport = sport
      if (minEdge > 0) where.edge = { gte: minEdge }

      if (from || to) {
        where.createdAt = {}
        if (from) (where.createdAt as Record<string, unknown>).gte = new Date(from)
        if (to) (where.createdAt as Record<string, unknown>).lte = new Date(to)
      }

      const arbs = await db.arbOpportunity.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
      })

      return NextResponse.json({
        arbs: arbs.map((a) => ({
          ...a,
          createdAt: a.createdAt.toISOString(),
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