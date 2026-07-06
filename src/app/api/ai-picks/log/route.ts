import { NextResponse } from 'next/server'
import { requireAuthFromRequest, AuthError } from '@/lib/auth'

export const runtime = 'edge'

export async function POST(request: Request) {
  try {
    const user = await requireAuthFromRequest(request)

    const body = await request.json()
    const {
      sport,
      competition,
      homeTeam,
      awayTeam,
      market,
      selection,
      odds,
      confidence,
      reasoning,
      sourceEventId,
    } = body

    if (!sport || !homeTeam || !awayTeam || !market || !selection || odds == null) {
      return NextResponse.json(
        { error: 'Missing required fields: sport, homeTeam, awayTeam, market, selection, odds' },
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
          `INSERT INTO AiPickLog (id, userId, sport, competition, homeTeam, awayTeam, market, selection, odds, confidence, reasoning, sourceEventId, result, settledAt, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?)`
        )
        .bind(id, user.id, sport, competition || null, homeTeam, awayTeam, market, selection, odds, confidence ?? null, reasoning ?? null, sourceEventId ?? null, now)
        .run()

      return NextResponse.json({ id, createdAt: now }, { status: 201 })
    } catch {
      // Prisma fallback
      const { db } = await import('@/lib/db')

      const pick = await db.aiPickLog.create({
        data: {
          userId: user.id,
          sport,
          competition: competition || null,
          homeTeam,
          awayTeam,
          market,
          selection,
          odds,
          confidence: confidence ?? null,
          reasoning: reasoning ?? null,
          sourceEventId: sourceEventId ?? null,
        },
      })

      return NextResponse.json({ id: pick.id, createdAt: pick.createdAt.toISOString() }, { status: 201 })
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}