import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTokenFromRequest } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const token = await getTokenFromRequest(request)

    if (token) {
      await db.session.deleteMany({
        where: { token },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Logout error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}