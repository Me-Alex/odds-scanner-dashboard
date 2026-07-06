import { NextResponse } from 'next/server'
import { requireAuthFromRequest } from '@/lib/auth'
import { generateOddsData } from '@/lib/odds-data'

export const runtime = 'edge'

export async function GET(request: Request) {
  try {
    await requireAuthFromRequest(request)
    const data = generateOddsData()
    return NextResponse.json(data)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    const status = (error as { statusCode?: number })?.statusCode ?? 500
    return NextResponse.json({ error: message }, { status })
  }
}