import { NextResponse } from 'next/server'
import { requireAuthFromRequest, AuthError } from '@/lib/auth'

export const runtime = 'edge'

export async function GET(request: Request) {
  try {
    await requireAuthFromRequest(request)

    const { searchParams } = new URL(request.url)
    const sport = searchParams.get('sport')

    try {
      // D1 first
      const D1 = await import('@/lib/cloudflare-db')
      const db = await D1.getD1()

      let query = 'SELECT * FROM ScrapedEvent'
      const binds: unknown[] = []

      if (sport) {
        query += ' WHERE sport = ?'
        binds.push(sport)
      }

      query += ' ORDER BY fetchedAt DESC LIMIT 500'

      const stmt = db.prepare(query)
      const result = await (binds.length > 0 ? stmt.bind(...binds) : stmt).all()
      const scrapedEvents = (result.results || []) as Record<string, unknown>[]

      if (!Array.isArray(scrapedEvents) || scrapedEvents.length === 0) {
        return NextResponse.json({ valueBets: [] })
      }

      const valueBets = computeValueBets(scrapedEvents)
      return NextResponse.json({ valueBets })
    } catch {
      // Prisma fallback
      const { db } = await import('@/lib/db')

      const where: Record<string, unknown> = {}
      if (sport) where.sport = sport

      const scrapedEvents = await db.scrapedEvent.findMany({
        where,
        orderBy: { fetchedAt: 'desc' },
        take: 500,
      })

      if (scrapedEvents.length === 0) {
        return NextResponse.json({ valueBets: [] })
      }

      const mapped = scrapedEvents.map((e) => ({
        ...e,
        matchTime: e.matchTime.toISOString(),
        fetchedAt: e.fetchedAt.toISOString(),
      }))

      const valueBets = computeValueBets(mapped)
      return NextResponse.json({ valueBets })
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function computeValueBets(events: Record<string, unknown>[]) {
  // Group by homeTeam+awayTeam+matchTime to find cross-bookmaker outliers
  const eventGroups = new Map<string, Record<string, unknown>[]>()

  for (const event of events) {
    const key = `${event.homeTeam}|${event.awayTeam}|${event.matchTime}`
    if (!eventGroups.has(key)) eventGroups.set(key, [])
    eventGroups.get(key)!.push(event)
  }

  const valueBets: Array<Record<string, unknown>> = []

  for (const [, group] of eventGroups) {
    if (group.length < 2) continue

    // Parse odds for each provider in the group
    const providerOdds: Map<string, Record<string, Record<string, number>>> = new Map()

    for (const row of group) {
      let odds: Record<string, Record<string, number>> = {}
      try {
        odds = JSON.parse((row.oddsSnapshot as string) || '{}')
      } catch {
        continue
      }
      providerOdds.set(row.provider as string, odds)
    }

    if (providerOdds.size < 2) continue

    // Collect all markets and selections
    const allMarkets = new Map<string, Map<string, { odds: number; provider: string }[]>>()

    for (const [provider, markets] of providerOdds) {
      for (const [market, selections] of Object.entries(markets)) {
        if (!allMarkets.has(market)) allMarkets.set(market, new Map())
        const marketMap = allMarkets.get(market)!

        for (const [selection, odds] of Object.entries(selections)) {
          if (!marketMap.has(selection)) marketMap.set(selection, [])
          marketMap.get(selection)!.push({ odds: odds as number, provider })
        }
      }
    }

    for (const [market, selections] of allMarkets) {
      for (const [selection, entries] of selections) {
        if (entries.length < 2) continue

        const avgOdds = entries.reduce((s, e) => s + e.odds, 0) / entries.length

        for (const entry of entries) {
          if (entry.odds > avgOdds * 1.05) {
            const edge = (entry.odds / avgOdds) - 1
            valueBets.push({
              id: crypto.randomUUID(),
              eventId: group[0].id,
              sport: group[0].sport,
              competition: group[0].category || '',
              homeTeam: group[0].homeTeam,
              awayTeam: group[0].awayTeam,
              marketType: market,
              selection,
              bookmaker: entry.provider,
              odds: entry.odds,
              consensusOdds: Math.round(avgOdds * 100) / 100,
              edge: Math.round(edge * 10000) / 10000,
              startsAt: group[0].matchTime,
            })
          }
        }
      }
    }
  }

  valueBets.sort((a, b) => (b.edge as number) - (a.edge as number))
  return valueBets.slice(0, 50)
}