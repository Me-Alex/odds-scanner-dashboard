import { NextResponse } from 'next/server'
import { requireAuthFromRequest, AuthError } from '@/lib/auth'

export const runtime = 'edge'

// ─── PATCH: Update a bet ───────────────────────────────────────────────

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthFromRequest(request)
    const { id } = await params

    const body = await request.json()
    const { stake, odds, market, selection, notes, result } = body

    if (stake == null && odds == null && !market && !selection && notes === undefined && !result) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const now = new Date().toISOString()

    try {
      // D1 first
      const D1 = await import('@/lib/cloudflare-db')
      const db = await D1.getD1()

      // Check bet exists and user owns it (or is admin)
      const bet = await db.prepare('SELECT * FROM Bet WHERE id = ?').bind(id).first()
      if (!bet) {
        return NextResponse.json({ error: 'Bet not found' }, { status: 404 })
      }

      const betData = bet as Record<string, unknown>
      if (betData.userId !== user.id && user.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      // Build dynamic update
      const fields: string[] = []
      const values: unknown[] = []

      if (stake != null) { fields.push('stake = ?'); values.push(stake) }
      if (odds != null) { fields.push('odds = ?'); values.push(odds) }
      if (market) { fields.push('market = ?'); values.push(market) }
      if (selection) { fields.push('selection = ?'); values.push(selection) }
      if (notes !== undefined) { fields.push('notes = ?'); values.push(notes) }
      if (result) { fields.push('result = ?'); values.push(result) }
      fields.push('updatedAt = ?')
      values.push(now)
      values.push(id)

      await db
        .prepare(`UPDATE Bet SET ${fields.join(', ')} WHERE id = ?`)
        .bind(...values)
        .run()

      return NextResponse.json({ id, updatedAt: now })
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

      const updateData: Record<string, unknown> = {}
      if (stake != null) updateData.stake = stake
      if (odds != null) updateData.odds = odds
      if (market) updateData.market = market
      if (selection) updateData.selection = selection
      if (notes !== undefined) updateData.notes = notes
      if (result) updateData.result = result

      await db.bet.update({ where: { id }, data: updateData })

      return NextResponse.json({ id, updatedAt: now })
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── DELETE: Soft-delete a bet ─────────────────────────────────────────

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuthFromRequest(request)
    const { id } = await params

    const now = new Date().toISOString()

    try {
      // D1 first
      const D1 = await import('@/lib/cloudflare-db')
      const db = await D1.getD1()

      // Check bet exists and user owns it (or is admin)
      const bet = await db.prepare('SELECT * FROM Bet WHERE id = ?').bind(id).first()
      if (!bet) {
        return NextResponse.json({ error: 'Bet not found' }, { status: 404 })
      }

      const betData = bet as Record<string, unknown>
      if (betData.userId !== user.id && user.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      // Soft delete: set result to "void"
      await db
        .prepare("UPDATE Bet SET result = 'void', settledAt = ?, updatedAt = ? WHERE id = ?")
        .bind(now, now, id)
        .run()

      return NextResponse.json({ id, deleted: true, settledAt: now })
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

      // Soft delete
      await db.bet.update({
        where: { id },
        data: {
          result: 'void',
          settledAt: new Date(),
        },
      })

      return NextResponse.json({ id, deleted: true, settledAt: now })
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}