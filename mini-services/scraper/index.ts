/**
 * ArbDesk Scraper Service
 * Port: 3001
 * Fetches real odds from Romanian bookmaker APIs (Digitain platform),
 * stores them in SQLite via Prisma, and detects arbitrage opportunities.
 */

import { createServer, IncomingMessage, ServerResponse } from 'http'
import { Server } from 'socket.io'
import { PrismaClient } from '/home/z/my-project/node_modules/@prisma/client'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProviderConfig {
  name: string
  slug: string
  url: string
}

interface DigitainOutcome {
  mboDisplayName: Record<string, string>
  mboOddValue: number
  mboActive: boolean
  isLive: boolean
}

interface DigitainBet {
  idBet: string
  mbDisplayName: Record<string, string>
  mbOutcomes: DigitainOutcome[]
}

interface DigitainEvent {
  idMatch: string
  mType: string
  idSport: string
  sportName: Record<string, string>
  idCategory: string
  categoryName: Record<string, string>
  idTournament: string
  tournamentName: Record<string, string>
  team1Name: Record<string, string>
  team2Name: Record<string, string>
  matchDateTime: number
  bettingStatus: boolean
  matchBets: DigitainBet[]
}

interface NormalizedEvent {
  externalId: string
  provider: string
  sport: string
  category: string
  tournament: string
  homeTeam: string
  awayTeam: string
  matchTime: Date
  bettingStatus: boolean
  isLive: boolean
  oddsSnapshot: string
  oddsCount: number
}

interface Odds1X2 {
  home: number | null
  draw: number | null
  away: number | null
}

interface ProviderOdds {
  provider: string
  eventId: string
  odds1x2: Odds1X2
  markets: MarketData[]
}

interface MarketData {
  name: string
  outcomes: { name: string; odds: number }[]
}

interface MatchedEvent {
  sport: string
  competition: string
  homeTeam: string
  awayTeam: string
  matchTime: Date
  providers: ProviderOdds[]
}

interface Arb3Way {
  sport: string
  competition: string
  homeTeam: string
  awayTeam: string
  legs: { selection: string; odds: number; bookmaker: string; impliedProb: number }[]
  impliedTotal: number
  edge: number
}

interface Arb2Way {
  sport: string
  competition: string
  homeTeam: string
  awayTeam: string
  marketName: string
  selection1: string
  selection2: string
  bookmaker1: string
  bookmaker2: string
  odds1: number
  odds2: number
  impliedProb1: number
  impliedProb2: number
  edge: number
}

interface ProviderStatus {
  status: 'success' | 'error' | 'pending'
  eventsFound: number
  lastScrapeAt: string | null
  errorMsg?: string
  durationMs?: number
}

// ─── Config ──────────────────────────────────────────────────────────────────

const PORT = 3001
const SCRAPE_INTERVAL_MS = 60_000
const MIN_ARB_EDGE = 0.01 // 1% minimum edge to store
const MATCH_TIME_THRESHOLD_MS = 60 * 60 * 1000 // 1 hour to match events across providers
const UPSERT_BATCH_SIZE = 20

const PROVIDERS: ProviderConfig[] = [
  {
    name: 'Winner / MrPlay',
    slug: 'winner',
    url: 'https://micros-prod1-sb.gambling-solutions.ro/api/digitain-fetcher/v2/public/events',
  },
  {
    name: '888',
    slug: 'e888',
    url: 'https://micros-eagle-prod1-sb.gambling-solutions.ro/api/digitain-fetcher/v2/public/events',
  },
]

// ─── Database ────────────────────────────────────────────────────────────────

const db = new PrismaClient({
  datasourceUrl: 'file:/home/z/my-project/db/custom.db',
})

// ─── State ───────────────────────────────────────────────────────────────────

const startTime = Date.now()
let lastScrapeAt: Date | null = null
let isScraping = false

const providerStatuses: Map<string, ProviderStatus> = new Map()
PROVIDERS.forEach((p) => {
  providerStatuses.set(p.slug, {
    status: 'pending',
    eventsFound: 0,
    lastScrapeAt: null,
  })
})

let wsClients: any[] = []

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extract text from a Digitain localized object. Key "2" = English. */
function localized(obj: Record<string, string> | undefined, lang = '2'): string {
  if (!obj) return ''
  return obj[lang] || obj['42'] || Object.values(obj)[0] || ''
}

/** Send JSON response on an HTTP handler. */
function json(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  res.end(JSON.stringify(data))
}

/** Parse a URL query string into a Record. */
function parseQuery(url: string): Record<string, string> {
  const q = url.includes('?') ? url.split('?')[1] : ''
  const params: Record<string, string> = {}
  for (const pair of q.split('&')) {
    const [k, v] = pair.split('=')
    if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || '')
  }
  return params
}

// ─── Fetch Provider ──────────────────────────────────────────────────────────

async function fetchProvider(provider: ProviderConfig): Promise<DigitainEvent[]> {
  const startMs = Date.now()
  const status = providerStatuses.get(provider.slug)!

  try {
    console.log(`[scraper] Fetching from ${provider.name}...`)

    const response = await fetch(provider.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept-Encoding': 'gzip',
      },
      body: '{}',
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    // Bun's fetch automatically decompresses gzip responses
    const json = (await response.json()) as {
      data?: { events?: DigitainEvent[] }
    }
    const events = json?.data?.events || []

    const durationMs = Date.now() - startMs
    status.status = 'success'
    status.eventsFound = events.length
    status.lastScrapeAt = new Date().toISOString()
    status.durationMs = durationMs
    delete status.errorMsg

    console.log(
      `[scraper] ${provider.name}: ${events.length} events fetched in ${durationMs}ms`
    )
    return events
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    const durationMs = Date.now() - startMs
    status.status = 'error'
    status.eventsFound = 0
    status.lastScrapeAt = new Date().toISOString()
    status.durationMs = durationMs
    status.errorMsg = message

    console.error(`[scraper] ${provider.name} FAILED: ${message}`)
    return []
  }
}

// ─── Normalize Events ────────────────────────────────────────────────────────

function normalizeEvent(
  event: DigitainEvent,
  provider: ProviderConfig
): NormalizedEvent {
  const markets: Record<string, Record<string, number>> = {}
  let oddsCount = 0

  for (const bet of event.matchBets || []) {
    const marketName = localized(bet.mbDisplayName)
    if (!marketName) continue
    markets[marketName] = {}
    for (const outcome of bet.mbOutcomes || []) {
      if (outcome.mboActive && outcome.mboOddValue > 0) {
        const outcomeName = localized(outcome.mboDisplayName)
        if (outcomeName) {
          markets[marketName][outcomeName] = outcome.mboOddValue
          oddsCount++
        }
      }
    }
  }

  return {
    externalId: event.idMatch,
    provider: provider.slug,
    sport: localized(event.sportName),
    category: localized(event.categoryName),
    tournament: localized(event.tournamentName),
    homeTeam: localized(event.team1Name),
    awayTeam: localized(event.team2Name),
    matchTime: new Date(event.matchDateTime),
    bettingStatus: event.bettingStatus ?? true,
    isLive: event.mType === 'live',
    oddsSnapshot: JSON.stringify(markets),
    oddsCount,
  }
}

// ─── Odds Movement Tracking ─────────────────────────────────────────────────

async function trackOddsMovements(
  events: NormalizedEvent[],
  provider: ProviderConfig
) {
  if (events.length === 0) return

  // Fetch all existing events for this provider in one query
  const externalIds = events.map((e) => e.externalId)
  const existing = await db.scrapedEvent.findMany({
    where: {
      externalId: { in: externalIds },
      provider: provider.slug,
    },
    select: { externalId: true, oddsSnapshot: true },
  })

  const existingMap = new Map(existing.map((e) => [e.externalId, e.oddsSnapshot]))

  const movements: {
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
  }[] = []

  for (const evt of events) {
    const oldSnapshot = existingMap.get(evt.externalId)
    if (!oldSnapshot) continue

    let oldOdds: Record<string, Record<string, number>>
    let newOdds: Record<string, Record<string, number>>

    try {
      oldOdds = JSON.parse(oldSnapshot)
      newOdds = JSON.parse(evt.oddsSnapshot)
    } catch {
      continue
    }

    for (const [market, outcomes] of Object.entries(newOdds)) {
      for (const [selection, newOdd] of Object.entries(outcomes)) {
        const oldOdd = oldOdds[market]?.[selection]
        if (oldOdd !== undefined && Math.abs(newOdd - oldOdd) > 0.005) {
          movements.push({
            eventId: evt.externalId,
            provider: evt.provider,
            sport: evt.sport,
            homeTeam: evt.homeTeam,
            awayTeam: evt.awayTeam,
            marketType: market,
            selection,
            oldOdds: oldOdd,
            newOdds: newOdd,
            change: +(newOdd - oldOdd).toFixed(4),
          })
        }
      }
    }
  }

  if (movements.length > 0) {
    // Batch insert movements
    for (let i = 0; i < movements.length; i += 50) {
      await db.oddsMovement.createMany({ data: movements.slice(i, i + 50) })
    }
    console.log(
      `[scraper] ${provider.name}: ${movements.length} odds movements detected`
    )
  }
}

// ─── Upsert Events to DB ────────────────────────────────────────────────────

async function upsertEvents(events: NormalizedEvent[]) {
  for (let i = 0; i < events.length; i += UPSERT_BATCH_SIZE) {
    const batch = events.slice(i, i + UPSERT_BATCH_SIZE)
    await Promise.all(
      batch.map((evt) =>
        db.scrapedEvent.upsert({
          where: {
            externalId_provider: {
              externalId: evt.externalId,
              provider: evt.provider,
            },
          },
          create: {
            externalId: evt.externalId,
            provider: evt.provider,
            sport: evt.sport,
            category: evt.category,
            tournament: evt.tournament,
            homeTeam: evt.homeTeam,
            awayTeam: evt.awayTeam,
            matchTime: evt.matchTime,
            bettingStatus: evt.bettingStatus,
            isLive: evt.isLive,
            oddsSnapshot: evt.oddsSnapshot,
            oddsCount: evt.oddsCount,
          },
          update: {
            sport: evt.sport,
            category: evt.category,
            tournament: evt.tournament,
            homeTeam: evt.homeTeam,
            awayTeam: evt.awayTeam,
            matchTime: evt.matchTime,
            bettingStatus: evt.bettingStatus,
            isLive: evt.isLive,
            oddsSnapshot: evt.oddsSnapshot,
            oddsCount: evt.oddsCount,
            fetchedAt: new Date(),
          },
        })
      )
    )
  }
}

// ─── Update Bookmaker ────────────────────────────────────────────────────────

async function updateBookmaker(
  provider: ProviderConfig,
  eventsCount: number,
  status: string,
  errorMsg?: string
) {
  await db.bookmaker.upsert({
    where: { slug: provider.slug },
    create: {
      name: provider.name,
      slug: provider.slug,
      isActive: true,
      lastScrapeAt: new Date(),
      eventsCount,
      lastError: errorMsg || null,
    },
    update: {
      lastScrapeAt: new Date(),
      eventsCount,
      lastError: errorMsg || null,
      isActive: status === 'success',
    },
  })
}

// ─── Match Events Across Providers ───────────────────────────────────────────

function parseOdds1X2(oddsSnapshot: string): Odds1X2 {
  try {
    const markets: Record<string, Record<string, number>> = JSON.parse(oddsSnapshot)
    const m = markets['Final']
    if (m) {
      return {
        home: m['1'] ?? null,
        draw: m['X'] ?? null,
        away: m['2'] ?? null,
      }
    }
  } catch {
    /* ignore */
  }
  return { home: null, draw: null, away: null }
}

function parseMarkets(oddsSnapshot: string): MarketData[] {
  try {
    const markets: Record<string, Record<string, number>> = JSON.parse(oddsSnapshot)
    return Object.entries(markets).map(([name, outcomes]) => ({
      name,
      outcomes: Object.entries(outcomes).map(([oname, odds]) => ({
        name: oname,
        odds,
      })),
    }))
  } catch {
    return []
  }
}

function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
}

async function getMatchedEvents(): Promise<MatchedEvent[]> {
  const events = await db.scrapedEvent.findMany({
    where: {
      provider: { in: PROVIDERS.map((p) => p.slug) },
      bettingStatus: true,
    },
    orderBy: { matchTime: 'asc' },
  })

  // Group by normalized (sport, homeTeam, awayTeam) with matchTime within threshold
  const groups = new Map<string, MatchedEvent>()

  for (const evt of events) {
    const odds1x2 = parseOdds1X2(evt.oddsSnapshot)
    const markets = parseMarkets(evt.oddsSnapshot)

    const keyBase = `${normalizeTeamName(evt.sport)}|${normalizeTeamName(evt.homeTeam)}|${normalizeTeamName(evt.awayTeam)}`

    let matched = false
    for (const [existingKey, group] of groups.entries()) {
      const existingBase = existingKey.substring(
        0,
        existingKey.lastIndexOf('|')
      )
      if (existingBase === keyBase) {
        const timeDiff = Math.abs(
          group.matchTime.getTime() - evt.matchTime.getTime()
        )
        if (timeDiff <= MATCH_TIME_THRESHOLD_MS) {
          const existingIdx = group.providers.findIndex(
            (p) => p.provider === evt.provider
          )
          if (existingIdx >= 0) {
            // Update existing provider entry with latest data
            group.providers[existingIdx] = {
              provider: evt.provider,
              eventId: evt.id,
              odds1x2,
              markets,
            }
          } else {
            group.providers.push({
              provider: evt.provider,
              eventId: evt.id,
              odds1x2,
              markets,
            })
          }
          matched = true
          break
        }
      }
    }

    if (!matched) {
      groups.set(`${keyBase}|${evt.matchTime.getTime()}`, {
        sport: evt.sport,
        competition: evt.category,
        homeTeam: evt.homeTeam,
        awayTeam: evt.awayTeam,
        matchTime: evt.matchTime,
        providers: [
          { provider: evt.provider, eventId: evt.id, odds1x2, markets },
        ],
      })
    }
  }

  return Array.from(groups.values()).filter((g) => g.providers.length >= 2)
}

// ─── Arb Detection: 3-Way (1X2) ─────────────────────────────────────────────

function find3WayArbs(matchEvent: MatchedEvent): Arb3Way[] {
  const valid = matchEvent.providers.filter(
    (p) => p.odds1x2.home && p.odds1x2.draw && p.odds1x2.away
  )
  if (valid.length < 2) return []

  let bestArb: Arb3Way | null = null

  // With N providers, enumerate all combos where each leg can come from any
  // provider, but at least 2 different providers are used.
  for (const pHome of valid) {
    for (const pDraw of valid) {
      for (const pAway of valid) {
        // Must use at least 2 different bookmakers
        const bookmakers = new Set([pHome.provider, pDraw.provider, pAway.provider])
        if (bookmakers.size < 2) continue

        const homeOdds = pHome.odds1x2.home!
        const drawOdds = pDraw.odds1x2.draw!
        const awayOdds = pAway.odds1x2.away!

        const implied = 1 / homeOdds + 1 / drawOdds + 1 / awayOdds
        if (implied < 1) {
          const edge = (1 - implied) / implied
          if (edge >= MIN_ARB_EDGE) {
            if (!bestArb || edge > bestArb.edge) {
              bestArb = {
                sport: matchEvent.sport,
                competition: matchEvent.competition,
                homeTeam: matchEvent.homeTeam,
                awayTeam: matchEvent.awayTeam,
                legs: [
                  { selection: '1', odds: homeOdds, bookmaker: pHome.provider, impliedProb: +(1 / homeOdds).toFixed(4) },
                  { selection: 'X', odds: drawOdds, bookmaker: pDraw.provider, impliedProb: +(1 / drawOdds).toFixed(4) },
                  { selection: '2', odds: awayOdds, bookmaker: pAway.provider, impliedProb: +(1 / awayOdds).toFixed(4) },
                ],
                impliedTotal: +implied.toFixed(4),
                edge: +edge.toFixed(4),
              }
            }
          }
        }
      }
    }
  }

  return bestArb ? [bestArb] : []
}

// ─── Arb Detection: 2-Way ────────────────────────────────────────────────────

function find2WayArbs(matchEvent: MatchedEvent): Arb2Way[] {
  const results: Arb2Way[] = []

  // Collect all 2-outcome markets across all providers
  // Build: marketName → [{provider, outcome1Name, outcome1Odds, outcome2Name, outcome2Odds}]
  const marketMap = new Map<
    string,
    Array<{
      provider: string
      eventId: string
      outcomes: { name: string; odds: number }[]
    }>
  >()

  for (const p of matchEvent.providers) {
    for (const market of p.markets) {
      // Skip 1X2 (handled separately) and markets with != 2 outcomes
      if (market.name === 'Final') continue
      if (market.outcomes.length !== 2) continue

      const entries = marketMap.get(market.name) || []
      entries.push({
        provider: p.provider,
        eventId: p.eventId,
        outcomes: market.outcomes,
      })
      marketMap.set(market.name, entries)
    }
  }

  // For each 2-outcome market, check cross-bookmaker arbs
  for (const [marketName, entries] of marketMap.entries()) {
    if (entries.length < 2) continue

    for (let i = 0; i < entries.length; i++) {
      for (let j = 0; j < entries.length; j++) {
        if (i === j) continue
        const eA = entries[i]
        const eB = entries[j]

        // Match outcomes by name between the two providers
        const outA0 = eA.outcomes[0]
        const outA1 = eA.outcomes[1]
        const outB0 = eB.outcomes[0]
        const outB1 = eB.outcomes[1]

        // Try: A's outcome[0] vs B's outcome[1]
        if (
          outA0.name === outB0.name &&
          outA1.name === outB1.name
        ) {
          // Arb: take outA0 from A, outB1 from B
          const imp = 1 / outA0.odds + 1 / outB1.odds
          if (imp < 1) {
            const edge = (1 - imp) / imp
            if (edge >= MIN_ARB_EDGE) {
              results.push({
                sport: matchEvent.sport,
                competition: matchEvent.competition,
                homeTeam: matchEvent.homeTeam,
                awayTeam: matchEvent.awayTeam,
                marketName,
                selection1: outA0.name,
                selection2: outB1.name,
                bookmaker1: eA.provider,
                bookmaker2: eB.provider,
                odds1: outA0.odds,
                odds2: outB1.odds,
                impliedProb1: +(1 / outA0.odds).toFixed(4),
                impliedProb2: +(1 / outB1.odds).toFixed(4),
                edge: +edge.toFixed(4),
              })
            }
            // Arb: take outB0 from B, outA1 from A
            const imp2 = 1 / outB0.odds + 1 / outA1.odds
            if (imp2 < 1) {
              const edge2 = (1 - imp2) / imp2
              if (edge2 >= MIN_ARB_EDGE) {
                results.push({
                  sport: matchEvent.sport,
                  competition: matchEvent.competition,
                  homeTeam: matchEvent.homeTeam,
                  awayTeam: matchEvent.awayTeam,
                  marketName,
                  selection1: outB0.name,
                  selection2: outA1.name,
                  bookmaker1: eB.provider,
                  bookmaker2: eA.provider,
                  odds1: outB0.odds,
                  odds2: outA1.odds,
                  impliedProb1: +(1 / outB0.odds).toFixed(4),
                  impliedProb2: +(1 / outA1.odds).toFixed(4),
                  edge: +edge2.toFixed(4),
                })
              }
            }
          }

          // Also try cross-matching: A's outcome[0] with B's outcome[0] (if names differ)
          if (outA0.name !== outB0.name) {
            const impCross1 = 1 / outA0.odds + 1 / outB0.odds
            if (impCross1 < 1) {
              const edgeCross = (1 - impCross1) / impCross1
              if (edgeCross >= MIN_ARB_EDGE) {
                results.push({
                  sport: matchEvent.sport,
                  competition: matchEvent.competition,
                  homeTeam: matchEvent.homeTeam,
                  awayTeam: matchEvent.awayTeam,
                  marketName,
                  selection1: outA0.name,
                  selection2: outB0.name,
                  bookmaker1: eA.provider,
                  bookmaker2: eB.provider,
                  odds1: outA0.odds,
                  odds2: outB0.odds,
                  impliedProb1: +(1 / outA0.odds).toFixed(4),
                  impliedProb2: +(1 / outB0.odds).toFixed(4),
                  edge: +edgeCross.toFixed(4),
                })
              }
            }
            const impCross2 = 1 / outA1.odds + 1 / outB1.odds
            if (impCross2 < 1) {
              const edgeCross2 = (1 - impCross2) / impCross2
              if (edgeCross2 >= MIN_ARB_EDGE) {
                results.push({
                  sport: matchEvent.sport,
                  competition: matchEvent.competition,
                  homeTeam: matchEvent.homeTeam,
                  awayTeam: matchEvent.awayTeam,
                  marketName,
                  selection1: outA1.name,
                  selection2: outB1.name,
                  bookmaker1: eA.provider,
                  bookmaker2: eB.provider,
                  odds1: outA1.odds,
                  odds2: outB1.odds,
                  impliedProb1: +(1 / outA1.odds).toFixed(4),
                  impliedProb2: +(1 / outB1.odds).toFixed(4),
                  edge: +edgeCross2.toFixed(4),
                })
              }
            }
          }
        }
      }
    }
  }

  // Deduplicate: keep best edge per (event, market, bookmaker pair)
  const seen = new Set<string>()
  return results.filter((arb) => {
    const bk1 = [arb.bookmaker1, arb.bookmaker2].sort()[0]
    const bk2 = [arb.bookmaker1, arb.bookmaker2].sort()[1]
    const sel1 = [arb.selection1, arb.selection2].sort()[0]
    const sel2 = [arb.selection1, arb.selection2].sort()[1]
    const key = `${arb.marketName}|${bk1}|${bk2}|${sel1}|${sel2}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ─── Store Arb Opportunities ─────────────────────────────────────────────────

async function storeArb3Way(arb: Arb3Way, io: Server) {
  const legsJson = JSON.stringify(
    arb.legs.map((l) => ({
      selection: l.selection,
      odds: l.odds,
      bookmaker: l.bookmaker,
      impliedProb: l.impliedProb,
    }))
  )

  const bookmakers = [...new Set(arb.legs.map((l) => l.bookmaker))]

  const record = await db.arbOpportunity.create({
    data: {
      sport: arb.sport,
      competition: arb.competition,
      homeTeam: arb.homeTeam,
      awayTeam: arb.awayTeam,
      marketType: '1X2',
      selection1: legsJson,
      selection2: arb.legs
        .map(
          (l) =>
            `${l.selection}@${l.bookmaker}(${l.odds.toFixed(2)})`
        )
        .join(' + '),
      bookmaker1: bookmakers[0] || '',
      bookmaker2: bookmakers[1] || '',
      odds1: arb.impliedTotal,
      odds2: arb.edge,
      impliedProb1: arb.impliedTotal,
      impliedProb2: 1 - arb.impliedTotal,
      edge: arb.edge,
    },
  })

  // Push to WebSocket clients
  const payload = {
    type: 'arb',
    data: {
      id: record.id,
      sport: arb.sport,
      competition: arb.competition,
      homeTeam: arb.homeTeam,
      awayTeam: arb.awayTeam,
      marketType: '1X2',
      legs: arb.legs,
      impliedTotal: arb.impliedTotal,
      edge: arb.edge,
      createdAt: record.createdAt,
    },
  }
  io.emit('arb-opportunity', payload)
  console.log(
    `[scraper] 3-WAY ARB: ${arb.homeTeam} vs ${arb.awayTeam} — edge ${((arb.edge) * 100).toFixed(2)}%`
  )
}

async function storeArb2Way(arb: Arb2Way, io: Server) {
  const record = await db.arbOpportunity.create({
    data: {
      sport: arb.sport,
      competition: arb.competition,
      homeTeam: arb.homeTeam,
      awayTeam: arb.awayTeam,
      marketType: arb.marketName,
      selection1: arb.selection1,
      selection2: arb.selection2,
      bookmaker1: arb.bookmaker1,
      bookmaker2: arb.bookmaker2,
      odds1: arb.odds1,
      odds2: arb.odds2,
      impliedProb1: arb.impliedProb1,
      impliedProb2: arb.impliedProb2,
      edge: arb.edge,
    },
  })

  const payload = {
    type: 'arb',
    data: {
      id: record.id,
      sport: arb.sport,
      competition: arb.competition,
      homeTeam: arb.homeTeam,
      awayTeam: arb.awayTeam,
      marketType: arb.marketName,
      selection1: arb.selection1,
      selection2: arb.selection2,
      bookmaker1: arb.bookmaker1,
      bookmaker2: arb.bookmaker2,
      odds1: arb.odds1,
      odds2: arb.odds2,
      edge: arb.edge,
      createdAt: record.createdAt,
    },
  }
  io.emit('arb-opportunity', payload)
  console.log(
    `[scraper] 2-WAY ARB: ${arb.homeTeam} vs ${arb.awayTeam} — ${arb.marketName} — edge ${((arb.edge) * 100).toFixed(2)}%`
  )
}

// ─── Full Arb Detection Pipeline ─────────────────────────────────────────────

async function detectArbitrage(io: Server) {
  console.log('[scraper] Running arbitrage detection...')
  const matchedEvents = await getMatchedEvents()
  console.log(
    `[scraper] ${matchedEvents.length} events matched across multiple providers`
  )

  let totalArbs = 0

  for (const matchEvent of matchedEvents) {
    // 3-way (1X2)
    const arbs3w = find3WayArbs(matchEvent)
    for (const arb of arbs3w) {
      await storeArb3Way(arb, io)
      totalArbs++
    }

    // 2-way (Over/Under, etc.)
    const arbs2w = find2WayArbs(matchEvent)
    for (const arb of arbs2w) {
      await storeArb2Way(arb, io)
      totalArbs++
    }
  }

  console.log(`[scraper] Arbitrage detection complete: ${totalArbs} new opportunities`)
  return totalArbs
}

// ─── Main Scrape Cycle ───────────────────────────────────────────────────────

async function scrape(io: Server) {
  if (isScraping) {
    console.log('[scraper] Scrape already in progress, skipping')
    return
  }
  isScraping = true

  const cycleStart = Date.now()
  console.log(`[scraper] === Scrape cycle started at ${new Date().toISOString()} ===`)

  try {
    // 1. Fetch from all providers simultaneously
    const fetchResults = await Promise.all(
      PROVIDERS.map(async (provider) => {
        const rawEvents = await fetchProvider(provider)
        const normalized = rawEvents.map((e) => normalizeEvent(e, provider))
        return { provider, normalized }
      })
    )

    // 2. For each provider: track movements, then upsert, then update bookmaker
    for (const { provider, normalized } of fetchResults) {
      const status = providerStatuses.get(provider.slug)!

      // Track odds movements (compare with existing DB data BEFORE upsert)
      await trackOddsMovements(normalized, provider)

      // Upsert events
      if (normalized.length > 0) {
        await upsertEvents(normalized)
      }

      // Update bookmaker status
      await updateBookmaker(
        provider,
        normalized.length,
        status.status,
        status.errorMsg
      )
    }

    // 3. Detect arbitrage opportunities
    const arbCount = await detectArbitrage(io)

    // 4. Log scraping results
    const totalEvents = fetchResults.reduce((s, r) => s + r.normalized.length, 0)
    await db.scrapingLog.create({
      data: {
        provider: 'all',
        status: 'success',
        eventsFound: totalEvents,
        durationMs: Date.now() - cycleStart,
      },
    })

    console.log(
      `[scraper] === Cycle complete: ${totalEvents} total events, ${arbCount} arbs in ${Date.now() - cycleStart}ms ===`
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[scraper] Scrape cycle error: ${message}`)

    await db.scrapingLog.create({
      data: {
        provider: 'all',
        status: 'error',
        errorMsg: message,
        durationMs: Date.now() - cycleStart,
      },
    })
  } finally {
    lastScrapeAt = new Date()
    isScraping = false
  }
}

// ─── HTTP Server ─────────────────────────────────────────────────────────────

const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = req.url || '/'

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    res.end()
    return
  }

  // Route: GET /health
  if (url === '/health' || url === '/health/') {
    const uptime = Math.floor((Date.now() - startTime) / 1000)
    json(res, {
      status: 'ok',
      uptime,
      lastScrapeAt: lastScrapeAt?.toISOString() || null,
      providers: PROVIDERS.map((p) => ({
        slug: p.slug,
        name: p.name,
        ...providerStatuses.get(p.slug),
      })),
    })
    return
  }

  // Route: GET /scrape/trigger
  if (url === '/scrape/trigger' || url === '/scrape/trigger/') {
    if (isScraping) {
      json(res, { status: 'already_running', message: 'A scrape is already in progress' })
      return
    }
    // Trigger async scrape
    scrape(io).catch((err) => console.error('[scraper] Trigger error:', err))
    json(res, { status: 'triggered', message: 'Scrape cycle started' })
    return
  }

  // Route: GET /scrape/status
  if (url === '/scrape/status' || url === '/scrape/status/') {
    const logs = await db.scrapingLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    })
    json(res, {
      isScraping,
      lastScrapeAt: lastScrapeAt?.toISOString() || null,
      providers: PROVIDERS.map((p) => ({
        slug: p.slug,
        name: p.name,
        ...providerStatuses.get(p.slug),
      })),
      recentLogs: logs,
    })
    return
  }

  // 404
  json(res, { error: 'Not found' }, 404)
})

// ─── WebSocket Server ────────────────────────────────────────────────────────

const io = new Server(httpServer, {
  path: '/',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

io.on('connection', (socket) => {
  console.log(`[scraper] WebSocket client connected: ${socket.id}`)
  wsClients.push(socket)

  // Send current status on connect
  socket.emit('status', {
    lastScrapeAt: lastScrapeAt?.toISOString() || null,
    providers: PROVIDERS.map((p) => ({
      slug: p.slug,
      ...providerStatuses.get(p.slug),
    })),
  })

  socket.on('disconnect', () => {
    wsClients = wsClients.filter((s) => s.id !== socket.id)
    console.log(`[scraper] WebSocket client disconnected: ${socket.id}`)
  })

  socket.on('error', (err) => {
    console.error(`[scraper] WebSocket error (${socket.id}):`, err)
  })
})

// ─── Start Server ────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`[scraper] ArbDesk Scraper Service running on port ${PORT}`)
  console.log(`[scraper] Endpoints:`)
  console.log(`  GET /health        — Service health & uptime`)
  console.log(`  GET /scrape/trigger — Manually trigger a scrape`)
  console.log(`  GET /scrape/status  — Last scrape results per provider`)
  console.log(`  WS  /               — Real-time arb opportunity push`)
  console.log(`[scraper] Scrape interval: every ${SCRAPE_INTERVAL_MS / 1000}s`)
  console.log(`[scraper] Providers: ${PROVIDERS.map((p) => p.name).join(', ')}`)
})

// Run initial scrape immediately, then every 60 seconds
scrape(io).catch((err) => console.error('[scraper] Initial scrape error:', err))
const scrapeTimer = setInterval(() => {
  scrape(io).catch((err) => console.error('[scraper] Interval scrape error:', err))
}, SCRAPE_INTERVAL_MS)

// ─── Graceful Shutdown ───────────────────────────────────────────────────────

async function shutdown(signal: string) {
  console.log(`\n[scraper] Received ${signal}, shutting down...`)
  clearInterval(scrapeTimer)
  io.close()
  httpServer.close()
  await db.$disconnect()
  console.log('[scraper] Shutdown complete')
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

process.on('uncaughtException', (err) => {
  console.error('[scraper] Uncaught exception:', err)
})
process.on('unhandledRejection', (err) => {
  console.error('[scraper] Unhandled rejection:', err)
})