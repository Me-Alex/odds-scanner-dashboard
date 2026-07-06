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
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    try {
      // D1 first
      const D1 = await import('@/lib/cloudflare-db')
      const db = await D1.getD1()

      let query = 'SELECT * FROM Bet WHERE userId = ?'
      const binds: unknown[] = [user.id]

      if (sport) {
        query += ' AND sport = ?'
        binds.push(sport)
      }
      if (result) {
        query += ' AND result = ?'
        binds.push(result)
      }

      // Get total count
      const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total')
      const countResult = await db.prepare(countQuery).bind(...binds).first<{ total: number }>()
      const total = countResult?.total ?? 0

      query += ' ORDER BY createdAt DESC LIMIT ? OFFSET ?'
      binds.push(limit, offset)

      const stmt = db.prepare(query)
      const betsResult = await stmt.bind(...binds).all()
      const bets = (betsResult.results || []) as Record<string, unknown>[]

      return NextResponse.json({
        bets,
        total,
        limit,
        offset,
      })
    } catch {
      // Prisma fallback
      const { db } = await import('@/lib/db')

      const where: Record<string, unknown> = { userId: user.id }
      if (sport) where.sport = sport
      if (result) where.result = result

      const [bets, total] = await Promise.all([
        db.bet.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
        }),
        db.bet.count({ where }),
      ])

      return NextResponse.json({
        bets: bets.map((b) => ({
          ...b,
          createdAt: b.createdAt.toISOString(),
          updatedAt: b.updatedAt.toISOString(),
          settledAt: b.settledAt?.toISOString() || null,
        })),
        total,
        limit,
        offset,
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

// ─── POST: Create a new bet ────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const user = await requireAuthFromRequest(request)

    const body = await request.json()
    const {
      externalEventId,
      provider,
      sport,
      competition,
      homeTeam,
      awayTeam,
      market,
      selection,
      odds,
      stake,
      notes,
    } = body

    if (!homeTeam || !awayTeam || !market || !selection || odds == null || stake == null) {
      return NextResponse.json(
        { error: 'Missing required fields: homeTeam, awayTeam, market, selection, odds, stake' },
        { status: 400 }
      )
    }

    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    try {
      // D1 first
      const D1 = await import('@/lib/cloudflare-db')
      const db = await D1.getD1()

      await db
        .prepare(
          `INSERT INTO Bet (id, userId, externalEventId, provider, sport, competition, homeTeam, awayTeam, market, selection, odds, stake, result, payout, settledAt, notes, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, ?, ?, ?)`
        )
        .bind(id, user.id, externalEventId || null, provider || null, sport || null, competition || null, homeTeam, awayTeam, market, selection, odds, stake, notes || null, now, now)
        .run()

      return NextResponse.json({ id, createdAt: now }, { status: 201 })
    } catch {
      // Prisma fallback
      const { db } = await import('@/lib/db')

      const bet = await db.bet.create({
        data: {
          userId: user.id,
          externalEventId: externalEventId || null,
          provider: provider || null,
          sport: sport || null,
          competition: competition || null,
          homeTeam,
          awayTeam,
          market,
          selection,
          odds,
          stake,
          notes: notes || null,
        },
      })

      return NextResponse.json({ id: bet.id, createdAt: bet.createdAt.toISOString() }, { status: 201 })
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}