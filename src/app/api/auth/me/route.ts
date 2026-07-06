import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuthFromRequest, getTokenFromRequest, AuthError } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthFromRequest(request)

    // Refresh session — extend expiresAt by 7 days
    const token = await getTokenFromRequest(request)
    if (token) {
      const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      await db.session.updateMany({
        where: { token, userId: user.id },
        data: { expiresAt: newExpiresAt },
      })
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