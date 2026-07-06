import { NextResponse } from 'next/server'
import { requireAuthFromRequest, AuthError } from '@/lib/auth'

export const runtime = 'edge'

export async function POST(request: Request) {
  try {
    const user = await requireAuthFromRequest(request)

    const body = await request.json()
    const { id, result, payout } = body

    if (!id || !result) {
      return NextResponse.json({ error: 'id and result are required' }, { status: 400 })
    }

    const validResults = ['won', 'lost', 'void']
    if (!validResults.includes(result)) {
      return NextResponse.json({ error: `result must be one of: ${validResults.join(', ')}` }, { status: 400 })
    }

    const now = new Date().toISOString()

    try {
      // D1 first
      const D1 = await import('@/lib/cloudflare-db')
      const db = await D1.getD1()

      // Check bet exists
      const bet = await db.prepare('SELECT * FROM Bet WHERE id = ?').bind(id).first()
      if (!bet) {
        return NextResponse.json({ error: 'Bet not found' }, { status: 404 })
      }

      // Verify ownership (or admin)
      const betData = bet as Record<string, unknown>
      if (betData.userId !== user.id && user.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const finalPayout = payout ?? (result === 'won' ? Math.round(((betData.odds as number) * (betData.stake as number)) * 100) / 100 : 0)

      await db
        .prepare('UPDATE Bet SET result = ?, payout = ?, settledAt = ?, updatedAt = ? WHERE id = ?')
        .bind(result, finalPayout, now, now, id)
        .run()

      return NextResponse.json({ id, result, payout: finalPayout, settledAt: now })
    } catch {
      // Prisma fallback
      const { db } = await import('@/lib/db')

      const bet = await db.bet.findUnique({ where: { id } })
      if (!bet) {
        return NextResponse.json({ error: 'Bet not found' }, { status: 404 })
      }
      if (bet.userId !== user.id && user.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      const finalPayout = payout ?? (result === 'won' ? Math.round(bet.odds * bet.stake * 100) / 100 : 0)

      await db.bet.update({
        where: { id },
        data: {
          result,
          payout: finalPayout,
          settledAt: new Date(),
        },
      })

      return NextResponse.json({ id, result, payout: finalPayout, settledAt: now })
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}