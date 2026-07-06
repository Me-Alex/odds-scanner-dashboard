import { NextResponse } from 'next/server'
import { requireAuthFromRequest, AuthError } from '@/lib/auth'

export const runtime = 'edge'

export async function POST(request: Request) {
  try {
    const user = await requireAuthFromRequest(request)

    const body = await request.json()
    const bets = body.bets

    if (!Array.isArray(bets) || bets.length === 0) {
      return NextResponse.json(
        { error: 'bets array is required (minimum 1 bet)' },
        { status: 400 }
      )
    }

    if (bets.length > 50) {
      return NextResponse.json(
        { error: 'Maximum 50 bets per import' },
        { status: 400 }
      )
    }

    const now = new Date().toISOString()
    const created: Array<{ id: string; createdAt: string }> = []
    const errors: Array<{ index: number; error: string }> = []

    for (let i = 0; i < bets.length; i++) {
      const b = bets[i]
      if (!b.homeTeam || !b.awayTeam || !b.market || !b.selection || b.odds == null || b.stake == null) {
        errors.push({ index: i, error: 'Missing required fields: homeTeam, awayTeam, market, selection, odds, stake' })
        continue
      }

      const id = crypto.randomUUID()

      try {
        const D1 = await import('@/lib/cloudflare-db')
        const db = await D1.getD1()

        await db
          .prepare(
            `INSERT INTO Bet (id, userId, externalEventId, provider, sport, competition, homeTeam, awayTeam, market, selection, odds, stake, result, payout, settledAt, notes, createdAt, updatedAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, ?, ?, ?)`
          )
          .bind(id, user.id, b.externalEventId || null, b.provider || null, b.sport || null, b.competition || null, b.homeTeam, b.awayTeam, b.market, b.selection, b.odds, b.stake, b.notes || null, now, now)
          .run()

        created.push({ id, createdAt: now })
      } catch {
        try {
          const { db } = await import('@/lib/db')
          await db.bet.create({
            data: {
              userId: user.id,
              externalEventId: b.externalEventId || null,
              provider: b.provider || null,
              sport: b.sport || null,
              competition: b.competition || null,
              homeTeam: b.homeTeam,
              awayTeam: b.awayTeam,
              market: b.market,
              selection: b.selection,
              odds: b.odds,
              stake: b.stake,
              notes: b.notes || null,
            },
          })
          created.push({ id, createdAt: now })
        } catch (err) {
          errors.push({ index: i, error: String(err) })
        }
      }
    }

    return NextResponse.json({
      imported: created.length,
      failed: errors.length,
      bets: created,
      errors: errors.length > 0 ? errors : undefined,
    }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}