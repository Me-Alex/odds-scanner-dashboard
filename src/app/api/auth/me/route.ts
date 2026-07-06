import { NextRequest, NextResponse } from 'next/server'
import { requireAuthFromRequest, getTokenFromRequest, AuthError } from '@/lib/auth'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthFromRequest(request)

    // Refresh session — extend expiresAt by 7 days
    const token = await getTokenFromRequest(request)
    if (token) {
      const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

      try {
        const D1 = await import('@/lib/cloudflare-db')
        const db = await D1.getD1()
        await D1.updateSessionExpiry(db, token, user.id, newExpiresAt)
      } catch {
        // D1 not available (local dev) — fall back to Prisma
        const { db } = await import('@/lib/db')
        await db.session.updateMany({
          where: { token, userId: user.id },
          data: { expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
        })
      }
    }

    return NextResponse.json({ user })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }

    console.error('Me error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}