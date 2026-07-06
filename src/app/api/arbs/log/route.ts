import { NextResponse } from 'next/server'
import { requireAuthFromRequest, AuthError } from '@/lib/auth'

export const runtime = 'edge'

export async function POST(request: Request) {
  try {
    await requireAuthFromRequest(request)

    const body = await request.json()
    const {
      eventId,
      sport,
      competition,
      homeTeam,
      awayTeam,
      marketType,
      selection1,
      selection2,
      bookmaker1,
      bookmaker2,
      odds1,
      odds2,
      edge,
    } = body

    if (!sport || !homeTeam || !awayTeam || !marketType || !selection1 || !selection2 || !bookmaker1 || !bookmaker2 || odds1 == null || odds2 == null || edge == null) {
      return NextResponse.json(
        { error: 'Missing required fields: sport, homeTeam, awayTeam, marketType, selection1, selection2, bookmaker1, bookmaker2, odds1, odds2, edge' },
        { status: 400 }
      )
    }

    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const impliedProb1 = Math.round((1 / odds1) * 10000) / 10000
    const impliedProb2 = Math.round((1 / odds2) * 10000) / 10000

    try {
      // D1 first
      const D1 = await import('@/lib/cloudflare-db')
      const db = await D1.getD1()

      await db
        .prepare(
          `INSERT INTO ArbOpportunity (id, eventId, sport, competition, homeTeam, awayTeam, marketType, selection1, selection2, bookmaker1, bookmaker2, odds1, odds2, edge, impliedProb1, impliedProb2, seen, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
        )
        .bind(id, eventId || null, sport, competition || '', homeTeam, awayTeam, marketType, selection1, selection2, bookmaker1, bookmaker2, odds1, odds2, edge, impliedProb1, impliedProb2, now)
        .run()

      return NextResponse.json({ id, createdAt: now }, { status: 201 })
    } catch {
      // Prisma fallback
      const { db } = await import('@/lib/db')

      const arb = await db.arbOpportunity.create({
        data: {
          eventId: eventId || null,
          sport,
          competition: competition || '',
          homeTeam,
          awayTeam,
          marketType,
          selection1,
          selection2,
          bookmaker1,
          bookmaker2,
          odds1,
          odds2,
          edge,
          impliedProb1,
          impliedProb2,
        },
      })

      return NextResponse.json({ id: arb.id, createdAt: arb.createdAt.toISOString() }, { status: 201 })
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}