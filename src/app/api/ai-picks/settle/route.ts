import { NextResponse } from 'next/server'
import { requireAuthFromRequest, AuthError } from '@/lib/auth'

export const runtime = 'edge'

export async function POST(request: Request) {
  try {
    const user = await requireAuthFromRequest(request)

    const body = await request.json()
    const { id, result } = body

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

      const pick = await db.prepare('SELECT * FROM AiPickLog WHERE id = ?').bind(id).first()
      if (!pick) {
        return NextResponse.json({ error: 'AI pick not found' }, { status: 404 })
      }

      // Verify ownership (or admin)
      const pickData = pick as Record<string, unknown>
      if (pickData.userId && pickData.userId !== user.id && user.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      await db
        .prepare('UPDATE AiPickLog SET result = ?, settledAt = ? WHERE id = ?')
        .bind(result, now, id)
        .run()

      return NextResponse.json({ id, result, settledAt: now })
    } catch {
      // Prisma fallback
      const { db } = await import('@/lib/db')

      const pick = await db.aiPickLog.findUnique({ where: { id } })
      if (!pick) {
        return NextResponse.json({ error: 'AI pick not found' }, { status: 404 })
      }
      if (pick.userId && pick.userId !== user.id && user.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      await db.aiPickLog.update({
        where: { id },
        data: {
          result,
          settledAt: new Date(),
        },
      })

      return NextResponse.json({ id, result, settledAt: now })
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}