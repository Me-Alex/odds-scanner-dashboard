import { NextRequest, NextResponse } from 'next/server'
import { getTokenFromRequest } from '@/lib/auth'

function isCF(): boolean {
  try {
    // @ts-expect-error
    return typeof process === 'undefined' || !process.versions?.node
  } catch {
    return true
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = await getTokenFromRequest(request)

    if (token) {
      if (isCF()) {
        const D1 = await import('@/lib/cloudflare-db')
        const db = await D1.getD1()
        await D1.deleteSession(db, token)
      } else {
        const { db } = await import('@/lib/db')
        await db.session.deleteMany({ where: { token } })
      }
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