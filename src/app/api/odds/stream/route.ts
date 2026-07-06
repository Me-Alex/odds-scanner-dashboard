import { requireAuthFromRequest, AuthError } from '@/lib/auth'
import { generateOddsData } from '@/lib/odds-data'

export const runtime = 'edge'

export async function GET(request: Request) {
  try {
    await requireAuthFromRequest(request)

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        let intervalId: ReturnType<typeof setInterval> | undefined

        const sendUpdate = async () => {
          try {
            const data = await fetchOddsSnapshot()
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
          } catch {
            // On error, still send something
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'fetch_failed' })}\n\n`))
          }
        }

        // Send initial data immediately
        await sendUpdate()

        // Then every 10 seconds
        intervalId = setInterval(sendUpdate, 10_000)

        // Clean up on close
        request.signal.addEventListener('abort', () => {
          if (intervalId) clearInterval(intervalId)
          try { controller.close() } catch { /* already closed */ }
        })
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    if (error instanceof AuthError) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: error.statusCode,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    console.error('Route error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

async function fetchOddsSnapshot() {
  const now = new Date().toISOString()

  try {
    const D1 = await import('@/lib/cloudflare-db')
    const db = await D1.getD1()
    const result = await db.prepare('SELECT COUNT(*) as count FROM ScrapedEvent').first<{ count: number }>()
    const hasData = (result?.count ?? 0) > 0

    if (!hasData) {
      return { ...generateOddsData(), fetchedAt: now }
    }

    const eventsResult = await db
      .prepare('SELECT * FROM ScrapedEvent ORDER BY fetchedAt DESC LIMIT 200')
      .all()
    const events = eventsResult.results || []

    return {
      mode: 'live',
      fetchedAt: now,
      eventCount: Array.isArray(events) ? events.length : 0,
      events: Array.isArray(events) ? events.slice(0, 20) : [],
    }
  } catch {
    const { db } = await import('@/lib/db')
    const count = await db.scrapedEvent.count()

    if (count === 0) {
      return { ...generateOddsData(), fetchedAt: now }
    }

    const events = await db.scrapedEvent.findMany({
      orderBy: { fetchedAt: 'desc' },
      take: 200,
    })

    return {
      mode: 'live',
      fetchedAt: now,
      eventCount: events.length,
      events: events.slice(0, 20).map((e) => ({
        ...e,
        matchTime: e.matchTime.toISOString(),
        fetchedAt: e.fetchedAt.toISOString(),
      })),
    }
  }
}