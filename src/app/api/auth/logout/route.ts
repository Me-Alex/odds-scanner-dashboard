import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization')

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authorization token required' },
        { status: 401 },
      )
    }

    const token = authHeader.split(' ')[1]

    // Find and delete the session
    const session = await db.session.findUnique({
      where: { token },
    })

    if (session) {
      await db.session.delete({
        where: { id: session.id },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Logout error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}