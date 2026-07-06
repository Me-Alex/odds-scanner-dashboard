import { NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization')

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const token = authHeader.split(' ')[1]
    const session = await verifySession(token)

    if (!session || !session.user.isActive) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const { passwordHash: _, ...userWithoutPassword } = session.user

    return NextResponse.json({ user: userWithoutPassword })
  } catch (error) {
    console.error('Session validation error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}