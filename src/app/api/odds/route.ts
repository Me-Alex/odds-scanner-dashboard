import { NextResponse } from 'next/server'
import { requireAuthFromRequest, AuthError } from '@/lib/auth'
import { generateOddsData } from '@/lib/odds-data'
import { countOdds } from '@/lib/scrapers/types'

export const runtime = 'edge'

export async function GET(request: Request) {
  try {
    await requireAuthFromRequest(request)

    const { searchParams } = new URL(request.url)
    const refresh = searchParams.get('refresh')
    const sport = searchParams.get('sport')
    const provider = searchParams.get('provider')
    const scrapeProvider = searchParams.get('scrape')  // Scrape a specific bookmaker

    // ─── Trigger scraping if refresh=1 ──────────────────────────────
    if (refresh === '1' || scrapeProvider) {
      const scrapeResult = await triggerScrape(scrapeProvider, sport || undefined)
      return NextResponse.json(scrapeResult)
    }

    // ─── Read from DB (existing logic) ─────────────────────────────
    try {
      // Try D1 first (Cloudflare)
      const D1 = await import('@/lib/cloudflare-db')
      const db = await D1.getD1()

      let query = 'SELECT * FROM ScrapedEvent'
      const binds: unknown[] = []
      const conditions: string[] = []

      if (sport) {
        conditions.push('sport = ?')
        binds.push(sport)
      }
      if (provider) {
        conditions.push('provider = ?')
        binds.push(provider)
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ')
      }

      query += ' ORDER BY fetchedAt DESC LIMIT 500'

      const stmt = db.prepare(query)
      const result = await (binds.length > 0 ? stmt.bind(...binds) : stmt).all()
      const scrapedEvents = result.results || []

      // If no scraped data, fall back to demo
      if (!Array.isArray(scrapedEvents) || scrapedEvents.length === 0) {
        const demoData = generateOddsData()
        return NextResponse.json(demoData)
      }

      return NextResponse.json(buildOddsResponse(scrapedEvents as Record<string, unknown>[]))
    } catch {
      // D1 not available (local dev) — fall back to Prisma
      const { db } = await import('@/lib/db')

      const where: Record<string, unknown> = {}
      if (sport) where.sport = sport
      if (provider) where.provider = provider

      const scrapedEvents = await db.scrapedEvent.findMany({
        where,
        orderBy: { fetchedAt: 'desc' },
        take: 500,
      })

      if (scrapedEvents.length === 0) {
        const demoData = generateOddsData()
        return NextResponse.json(demoData)
      }

      const mapped = scrapedEvents.map((e) => ({
        ...e,
        matchTime: e.matchTime.toISOString(),
        fetchedAt: e.fetchedAt.toISOString(),
      }))

      return NextResponse.json(buildOddsResponse(mapped))
    }
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode })
    }
    console.error('Route error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ─── Trigger Scraping ──────────────────────────────────────────────────

async function triggerScrape(scrapeProvider?: string, sport?: string) {
  try {
    const { scrapeSingle, scrapeAll } = await import('@/lib/scrapers/scraping-engine')

    let scrapeResult
    if (scrapeProvider) {
      const result = await scrapeSingle(scrapeProvider, sport ? [sport] : undefined)
      scrapeResult = {
        totalEvents: result.eventsFound,
        results: [{
          provider: result.provider,
          status: result.status,
          eventsFound: result.eventsFound,
          durationMs: result.durationMs,
          error: result.error,
        }],
      }
      await storeScrapedEvents(result.events)
      await storeScrapingLog(result)
    } else {
      const fullResult = await scrapeAll(sport ? [sport] : undefined)
      scrapeResult = fullResult

      // Store all events
      await storeScrapedEvents(fullResult.newEvents)

      // Store scraping logs
      for (const r of fullResult.results) {
        await storeScrapingLog({
          provider: r.provider,
          status: r.status,
          eventsFound: r.eventsFound,
          durationMs: r.durationMs,
          error: r.error,
        })
      }

      // Store odds movements
      if (fullResult.movements.length > 0) {
        await storeOddsMovements(fullResult.movements)
      }

      // Store arb opportunities
      if (fullResult.arbs.length > 0) {
        await storeArbOpportunities(fullResult.arbs)
      }
    }

    return {
      mode: 'live',
      fetchedAt: new Date().toISOString(),
      scraping: scrapeResult,
      message: `Scraped ${scrapeResult.totalEvents} events from ${scrapeResult.results.length} providers`,
    }
  } catch (err) {
    return {
      mode: 'error',
      fetchedAt: new Date().toISOString(),
      error: String(err),
      message: 'Scraping failed — check bookmaker connectivity',
    }
  }
}

// ─── Store Scraped Events in DB ────────────────────────────────────────

async function storeScrapedEvents(events: Array<{
  externalId: string
  provider: string
  sport: string
  category: string
  tournament: string
  homeTeam: string
  awayTeam: string
  matchTime: string
  bettingStatus: boolean
  isLive: boolean
  odds: Record<string, Record<string, number>>
}>) {
  if (events.length === 0) return

  const now = new Date().toISOString()

  try {
    const D1 = await import('@/lib/cloudflare-db')
    const db = await D1.getD1()

    // Upsert using INSERT OR REPLACE
    const stmts = events.map(event =>
      db.prepare(
        `INSERT OR REPLACE INTO ScrapedEvent (id, externalId, provider, sport, category, tournament, homeTeam, awayTeam, matchTime, bettingStatus, isLive, oddsSnapshot, oddsCount, fetchedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        `${event.provider}_${event.externalId}`,
        event.externalId,
        event.provider,
        event.sport,
        event.category,
        event.tournament,
        event.homeTeam,
        event.awayTeam,
        event.matchTime,
        event.bettingStatus ? 1 : 0,
        event.isLive ? 1 : 0,
        JSON.stringify(event.odds),
        countOdds(event.odds),
        now
      )
    )

    // Batch in groups of 50 to avoid D1 batch limits
    for (let i = 0; i < stmts.length; i += 50) {
      await db.batch(stmts.slice(i, i + 50))
    }
  } catch {
    // D1 unavailable — try Prisma (local dev)
    try {
      const { db } = await import('@/lib/db')
      for (const event of events) {
        await db.scrapedEvent.upsert({
          where: { externalId_provider: { externalId: event.externalId, provider: event.provider } },
          create: {
            externalId: event.externalId,
            provider: event.provider,
            sport: event.sport,
            category: event.category,
            tournament: event.tournament,
            homeTeam: event.homeTeam,
            awayTeam: event.awayTeam,
            matchTime: new Date(event.matchTime),
            bettingStatus: event.bettingStatus,
            isLive: event.isLive,
            oddsSnapshot: JSON.stringify(event.odds),
            oddsCount: countOdds(event.odds),
          },
          update: {
            oddsSnapshot: JSON.stringify(event.odds),
            oddsCount: countOdds(event.odds),
            bettingStatus: event.bettingStatus,
            isLive: event.isLive,
            fetchedAt: new Date(now),
          },
        })
      }
    } catch (prismaErr) {
      console.error('[Odds] Failed to store events in Prisma:', prismaErr)
    }
  }
}

// ─── Store Scraping Log ────────────────────────────────────────────────

async function storeScrapingLog(result: {
  provider: string
  status: string
  eventsFound: number
  durationMs: number
  error?: string
}) {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  try {
    const D1 = await import('@/lib/cloudflare-db')
    const db = await D1.getD1()
    await db.prepare(
      'INSERT INTO ScrapingLog (id, provider, status, eventsFound, errorMsg, durationMs, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, result.provider, result.status, result.eventsFound, result.error || null, result.durationMs, now).run()
  } catch {
    try {
      const { db } = await import('@/lib/db')
      await db.scrapingLog.create({
        data: {
          provider: result.provider,
          status: result.status,
          eventsFound: result.eventsFound,
          errorMsg: result.error || null,
          durationMs: result.durationMs,
        },
      })
    } catch { /* ignore */ }
  }
}

// ─── Store Odds Movements ──────────────────────────────────────────────

async function storeOddsMovements(movements: Array<{
  eventId: string
  provider: string
  sport: string
  homeTeam: string
  awayTeam: string
  marketType: string
  selection: string
  oldOdds: number
  newOdds: number
  change: number
}>) {
  const now = new Date().toISOString()

  try {
    const D1 = await import('@/lib/cloudflare-db')
    const db = await D1.getD1()

    const stmts = movements.slice(0, 200).map(m =>
      db.prepare(
        'INSERT INTO OddsMovement (id, eventId, provider, sport, homeTeam, awayTeam, marketType, selection, oldOdds, newOdds, change, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(crypto.randomUUID(), m.eventId, m.provider, m.sport, m.homeTeam, m.awayTeam, m.marketType, m.selection, m.oldOdds, m.newOdds, m.change, now)
    )

    for (let i = 0; i < stmts.length; i += 50) {
      await db.batch(stmts.slice(i, i + 50))
    }
  } catch {
    try {
      const { db } = await import('@/lib/db')
      await db.oddsMovement.createMany({
        data: movements.slice(0, 200).map(m => ({
          eventId: m.eventId,
          provider: m.provider,
          sport: m.sport,
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          marketType: m.marketType,
          selection: m.selection,
          oldOdds: m.oldOdds,
          newOdds: m.newOdds,
          change: m.change,
        })),
      })
    } catch { /* ignore */ }
  }
}

// ─── Store Arb Opportunities ───────────────────────────────────────────

async function storeArbOpportunities(arbs: Array<{
  homeTeam: string
  awayTeam: string
  sport: string
  competition: string
  marketType: string
  selection1: string
  selection2: string
  bookmaker1: string
  bookmaker2: string
  odds1: number
  odds2: number
  edge: number
  impliedProb1: number
  impliedProb2: number
  matchTime: string
}>) {
  const now = new Date().toISOString()

  try {
    const D1 = await import('@/lib/cloudflare-db')
    const db = await D1.getD1()

    const stmts = arbs.slice(0, 100).map(a =>
      db.prepare(
        `INSERT INTO ArbOpportunity (id, sport, competition, homeTeam, awayTeam, marketType, selection1, selection2, bookmaker1, bookmaker2, odds1, odds2, edge, impliedProb1, impliedProb2, seen, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
      ).bind(
        crypto.randomUUID(), a.sport, a.competition, a.homeTeam, a.awayTeam,
        a.marketType, a.selection1, a.selection2, a.bookmaker1, a.bookmaker2,
        a.odds1, a.odds2, a.edge, a.impliedProb1, a.impliedProb2, now
      )
    )

    for (let i = 0; i < stmts.length; i += 50) {
      await db.batch(stmts.slice(i, i + 50))
    }
  } catch {
    try {
      const { db } = await import('@/lib/db')
      await db.arbOpportunity.createMany({
        data: arbs.slice(0, 100).map(a => ({
          sport: a.sport,
          competition: a.competition,
          homeTeam: a.homeTeam,
          awayTeam: a.awayTeam,
          marketType: a.marketType,
          selection1: a.selection1,
          selection2: a.selection2,
          bookmaker1: a.bookmaker1,
          bookmaker2: a.bookmaker2,
          odds1: a.odds1,
          odds2: a.odds2,
          edge: a.edge,
          impliedProb1: a.impliedProb1,
          impliedProb2: a.impliedProb2,
        })),
      })
    } catch { /* ignore */ }
  }
}

// ─── Build Odds Response from DB rows ──────────────────────────────────

function buildOddsResponse(scrapedEvents: Record<string, unknown>[]) {
  // Group by event (homeTeam + awayTeam + matchTime)
  const eventMap = new Map<string, {
    id: string
    sport: string
    competition: string
    startsAt: string
    homeTeam: string
    awayTeam: string
    bookmakers: { name: string; lastUpdate: string; markets: Record<string, Record<string, number>> }[]
  }>()

  for (const row of scrapedEvents) {
    const key = `${row.homeTeam}|${row.awayTeam}|${row.matchTime}`
    if (!eventMap.has(key)) {
      eventMap.set(key, {
        id: row.id as string,
        sport: row.sport as string,
        competition: (row.category as string) || '',
        startsAt: row.matchTime as string,
        homeTeam: row.homeTeam as string,
        awayTeam: row.awayTeam as string,
        bookmakers: [],
      })
    }

    let odds: Record<string, Record<string, number>> = {}
    try {
      odds = JSON.parse((row.oddsSnapshot as string) || '{}')
    } catch {
      odds = {}
    }

    const event = eventMap.get(key)!
    event.bookmakers.push({
      name: row.provider as string,
      lastUpdate: row.fetchedAt as string,
      markets: odds,
    })
  }

  const groupedEvents = Array.from(eventMap.values())
  const opportunities = calculateArbs(groupedEvents)

  return {
    mode: 'live',
    fetchedAt: new Date().toISOString(),
    previousFetchedAt: scrapedEvents.length > 0 ? (scrapedEvents[scrapedEvents.length - 1].fetchedAt as string) : new Date().toISOString(),
    events: groupedEvents,
    opportunities,
    arbitrages: opportunities,
    valueBets: calculateValueBets(groupedEvents),
  }
}

// ─── Arb Calculation ───────────────────────────────────────────────────

function calculateArbs(events: { sport: string; competition: string; homeTeam: string; awayTeam: string; startsAt: string; bookmakers: { name: string; markets: Record<string, Record<string, number>> }[] }[]) {
  const arbs: Array<{
    id: string
    eventId: string
    sport: string
    competition: string
    homeTeam: string
    awayTeam: string
    marketType: string
    edge: number
    confidence: string
    bookmaker1: string
    bookmaker2: string
    selection1: string
    selection2: string
    odds1: number
    odds2: number
    impliedProb1: number
    impliedProb2: number
    startsAt: string
  }> = []

  for (const event of events) {
    const allMarkets = new Set<string>()
    for (const bm of event.bookmakers) {
      for (const market of Object.keys(bm.markets)) {
        allMarkets.add(market)
      }
    }

    for (const market of allMarkets) {
      const selections: Record<string, { odds: number; bookmaker: string }[]> = {}

      for (const bm of event.bookmakers) {
        const marketOdds = bm.markets[market]
        if (!marketOdds) continue
        for (const [selection, odds] of Object.entries(marketOdds)) {
          if (!selections[selection]) selections[selection] = []
          selections[selection].push({ odds: odds as number, bookmaker: bm.name })
        }
      }

      const selKeys = Object.keys(selections)
      if (selKeys.length < 2) continue

      for (let i = 0; i < selKeys.length; i++) {
        for (let j = i + 1; j < selKeys.length; j++) {
          const s1 = selKeys[i]
          const s2 = selKeys[j]

          for (const o1 of selections[s1]) {
            for (const o2 of selections[s2]) {
              if (o1.bookmaker === o2.bookmaker) continue

              const impl1 = 1 / o1.odds
              const impl2 = 1 / o2.odds
              const totalImpl = impl1 + impl2

              if (totalImpl < 1) {
                const edge = (1 - totalImpl) / totalImpl
                if (edge >= 0.005) {
                  arbs.push({
                    id: crypto.randomUUID(),
                    eventId: event.id,
                    sport: event.sport,
                    competition: event.competition,
                    homeTeam: event.homeTeam,
                    awayTeam: event.awayTeam,
                    marketType: market,
                    edge: Math.round(edge * 10000) / 10000,
                    confidence: edge > 0.05 ? 'high' : edge > 0.02 ? 'medium' : 'low',
                    bookmaker1: o1.bookmaker,
                    bookmaker2: o2.bookmaker,
                    selection1: s1,
                    selection2: s2,
                    odds1: o1.odds,
                    odds2: o2.odds,
                    impliedProb1: Math.round(impl1 * 10000) / 10000,
                    impliedProb2: Math.round(impl2 * 10000) / 10000,
                    startsAt: event.startsAt,
                  })
                }
              }
            }
          }
        }
      }
    }
  }

  arbs.sort((a, b) => b.edge - a.edge)
  return arbs.slice(0, 50)
}

// ─── Value Bet Calculation ────────────────────────────────────────────

function calculateValueBets(events: { sport: string; competition: string; homeTeam: string; awayTeam: string; startsAt: string; bookmakers: { name: string; markets: Record<string, Record<string, number>> }[] }[]) {
  const valueBets: Array<{
    id: string
    eventId: string
    sport: string
    competition: string
    homeTeam: string
    awayTeam: string
    marketType: string
    selection: string
    bookmaker: string
    odds: number
    consensusOdds: number
    edge: number
    startsAt: string
  }> = []

  for (const event of events) {
    const allMarkets = new Set<string>()
    for (const bm of event.bookmakers) {
      for (const market of Object.keys(bm.markets)) {
        allMarkets.add(market)
      }
    }

    for (const market of allMarkets) {
      const selectionOdds: Record<string, { bookmaker: string; odds: number }[]> = {}

      for (const bm of event.bookmakers) {
        const marketOdds = bm.markets[market]
        if (!marketOdds) continue
        for (const [selection, odds] of Object.entries(marketOdds)) {
          if (!selectionOdds[selection]) selectionOdds[selection] = []
          selectionOdds[selection].push({ bookmaker: bm.name, odds: odds as number })
        }
      }

      for (const [selection, entries] of Object.entries(selectionOdds)) {
        if (entries.length < 2) continue

        const avgOdds = entries.reduce((sum, e) => sum + e.odds, 0) / entries.length

        for (const entry of entries) {
          if (entry.odds > avgOdds * 1.05) {
            const edge = (entry.odds / avgOdds) - 1
            valueBets.push({
              id: crypto.randomUUID(),
              eventId: event.id,
              sport: event.sport,
              competition: event.competition,
              homeTeam: event.homeTeam,
              awayTeam: event.awayTeam,
              marketType: market,
              selection,
              bookmaker: entry.bookmaker,
              odds: entry.odds,
              consensusOdds: Math.round(avgOdds * 100) / 100,
              edge: Math.round(edge * 10000) / 10000,
              startsAt: event.startsAt,
            })
          }
        }
      }
    }
  }

  valueBets.sort((a, b) => b.edge - a.edge)
  return valueBets.slice(0, 50)
}