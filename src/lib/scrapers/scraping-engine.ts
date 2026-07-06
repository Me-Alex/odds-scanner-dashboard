/**
 * Scraping Engine
 * Orchestrates scraping across all enabled bookmakers.
 * Handles: parallel/sequential scraping, DB writes, odds movement detection, arb detection.
 */

import type { NormalizedEvent, ScrapingResult, ArbDetection, OddsMovementRecord } from './types'
import { countOdds } from './types'
import { getEnabledAdapters, type AdapterEntry } from './registry'

// ─── In-memory cache for latest odds (for movement detection) ─────────

const previousOddsCache = new Map<string, Record<string, number>>()

// ─── Scrape all enabled bookmakers ─────────────────────────────────────

export interface FullScrapeResult {
  totalEvents: number
  results: Array<{
    provider: string
    status: string
    eventsFound: number
    durationMs: number
    error?: string
  }>
  newEvents: NormalizedEvent[]
  movements: OddsMovementRecord[]
  arbs: ArbDetection[]
  durationMs: number
}

export async function scrapeAll(sports?: string[]): Promise<FullScrapeResult> {
  const startMs = Date.now()
  const adapters = getEnabledAdapters()
  const allEvents: NormalizedEvent[] = []
  const results: FullScrapeResult['results'] = []

  // Scrape sequentially to respect rate limits
  for (const entry of adapters) {
    const providerStart = Date.now()
    try {
      const result = await entry.adapter.scrape(sports)
      allEvents.push(...result.events)

      results.push({
        provider: result.provider,
        status: result.status,
        eventsFound: result.eventsFound,
        durationMs: result.durationMs || (Date.now() - providerStart),
        error: result.error,
      })

      // Update entry status
      entry.lastScrapeAt = Date.now()
      entry.lastError = result.error
    } catch (err) {
      results.push({
        provider: entry.config.slug,
        status: 'error',
        eventsFound: 0,
        durationMs: Date.now() - providerStart,
        error: String(err),
      })
      entry.lastError = String(err)
    }

    // Minimum interval between requests
    if (entry.config.minInterval > 0) {
      const elapsed = Date.now() - providerStart
      if (elapsed < entry.config.minInterval) {
        await sleep(entry.config.minInterval - elapsed)
      }
    }
  }

  // Detect odds movements
  const movements = detectOddsMovements(allEvents)

  // Detect arbitrage opportunities
  const arbs = detectArbitrages(allEvents)

  return {
    totalEvents: allEvents.length,
    results,
    newEvents: allEvents,
    movements,
    arbs,
    durationMs: Date.now() - startMs,
  }
}

// ─── Scrape a single bookmaker ────────────────────────────────────────

export async function scrapeSingle(slug: string, sports?: string[]): Promise<ScrapingResult> {
  const { getAdapterBySlug } = await import('./registry')
  const entry = getAdapterBySlug(slug)
  if (!entry) {
    return {
      provider: slug,
      status: 'error',
      events: [],
      eventsFound: 0,
      durationMs: 0,
      error: `Unknown bookmaker: ${slug}`,
    }
  }

  const result = await entry.adapter.scrape(sports)
  entry.lastScrapeAt = Date.now()
  entry.lastError = result.error
  return result
}

// ─── Odds Movement Detection ──────────────────────────────────────────

function detectOddsMovements(events: NormalizedEvent[]): OddsMovementRecord[] {
  const movements: OddsMovementRecord[] = []

  for (const event of events) {
    const cacheKey = `${event.provider}|${event.externalId}`
    const prevOdds = previousOddsCache.get(cacheKey)

    if (!prevOdds) {
      // Store current odds for next comparison
      const flat: Record<string, number> = {}
      for (const [market, selections] of Object.entries(event.odds)) {
        for (const [selection, odds] of Object.entries(selections)) {
          flat[`${market}|${selection}`] = odds
        }
      }
      previousOddsCache.set(cacheKey, flat)
      continue
    }

    // Compare with previous odds
    const currentFlat: Record<string, number> = {}
    for (const [market, selections] of Object.entries(event.odds)) {
      for (const [selection, odds] of Object.entries(selections)) {
        currentFlat[`${market}|${selection}`] = odds
      }
    }

    for (const [key, newOdds] of Object.entries(currentFlat)) {
      const oldOdds = prevOdds[key]
      if (oldOdds !== undefined && oldOdds !== newOdds) {
        const [marketType, selection] = key.split('|')
        movements.push({
          eventId: event.externalId,
          provider: event.provider,
          sport: event.sport,
          homeTeam: event.homeTeam,
          awayTeam: event.awayTeam,
          marketType,
          selection,
          oldOdds,
          newOdds,
          change: Math.round((newOdds - oldOdds) * 100) / 100,
        })
      }
    }

    // Update cache
    previousOddsCache.set(cacheKey, currentFlat)
  }

  return movements
}

// ─── Arb Detection ────────────────────────────────────────────────────

export function detectArbitrages(events: NormalizedEvent[]): ArbDetection[] {
  // Group events by match (homeTeam + awayTeam + matchTime)
  const matchGroups = new Map<string, NormalizedEvent[]>()

  for (const event of events) {
    const key = `${event.homeTeam}|||${event.awayTeam}|||${event.matchTime}`
    if (!matchGroups.has(key)) matchGroups.set(key, [])
    matchGroups.get(key)!.push(event)
  }

  const arbs: ArbDetection[] = []

  for (const [, group] of Array.from(matchGroups.entries())) {
    if (group.length < 2) continue

    // Collect all markets across all bookmakers for this match
    const allMarkets = new Map<string, Map<string, { odds: number; provider: string }[]>>()

    for (const event of group) {
      for (const [market, selections] of Object.entries(event.odds)) {
        if (!allMarkets.has(market)) allMarkets.set(market, new Map())
        const marketMap = allMarkets.get(market)!

        for (const [selection, odds] of Object.entries(selections)) {
          if (!marketMap.has(selection)) marketMap.set(selection, [])
          marketMap.get(selection)!.push({ odds, provider: event.provider })
        }
      }
    }

    // Check each market for arb opportunities
    for (const [marketType, selections] of Array.from(allMarkets.entries())) {
      const selKeys = Array.from(selections.keys()) as string[]

      // For each pair of inverse selections (e.g., 1 vs 2, Over vs Under)
      for (let i = 0; i < selKeys.length; i++) {
        for (let j = i + 1; j < selKeys.length; j++) {
          const s1 = selKeys[i]
          const s2 = selKeys[j]

          const entries1 = selections.get(s1)!
          const entries2 = selections.get(s2)!

          // Find best cross-bookmaker odds
          for (const e1 of entries1) {
            for (const e2 of entries2) {
              if (e1.provider === e2.provider) continue
              // Skip aggregator self-comparison (the-odds-api provides multiple bookmakers)
              if (e1.provider === 'the-odds-api' && e2.provider === 'the-odds-api') continue

              const impl1 = 1 / e1.odds
              const impl2 = 1 / e2.odds
              const totalImpl = impl1 + impl2

              if (totalImpl < 1) {
                const edge = (1 - totalImpl) / totalImpl
                if (edge >= 0.005) { // 0.5% minimum
                  const homeTeam = group[0].homeTeam
                  const awayTeam = group[0].awayTeam
                  const sport = group[0].sport
                  const competition = group[0].category
                  const matchTime = group[0].matchTime

                  arbs.push({
                    homeTeam,
                    awayTeam,
                    sport,
                    competition,
                    marketType,
                    selection1: s1,
                    selection2: s2,
                    bookmaker1: e1.provider,
                    bookmaker2: e2.provider,
                    odds1: e1.odds,
                    odds2: e2.odds,
                    edge: Math.round(edge * 10000) / 10000,
                    impliedProb1: Math.round(impl1 * 10000) / 10000,
                    impliedProb2: Math.round(impl2 * 10000) / 10000,
                    matchTime,
                  })
                }
              }
            }
          }
        }
      }

      // Also check 3-way (1X2) arbs using best odds from different bookmakers
      if (selKeys.length >= 3) {
        const bestOdds: Map<string, { odds: number; provider: string }> = new Map()
        for (const [sel, entries] of Array.from(selections.entries())) {
          const best = entries.reduce((a, b) => a.odds > b.odds ? a : b)
          bestOdds.set(sel, best)
        }

        // Check if we can find a 1X2 arb
        const h = bestOdds.get('1') as { odds: number; provider: string } | undefined
        const d = bestOdds.get('X') as { odds: number; provider: string } | undefined
        const a = bestOdds.get('2') as { odds: number; provider: string } | undefined
        if (h && d && a) {
          // Check if all 3 come from different bookmakers (or at least 2 different)
          const providers = new Set([h.provider, d.provider, a.provider])
          if (providers.size >= 2) {
            const totalImpl = (1 / h.odds) + (1 / d.odds) + (1 / a.odds)
            if (totalImpl < 1) {
              const edge = (1 - totalImpl) / totalImpl
              if (edge >= 0.005) {
                arbs.push({
                  homeTeam: group[0].homeTeam,
                  awayTeam: group[0].awayTeam,
                  sport: group[0].sport,
                  competition: group[0].category,
                  marketType: '1X2',
                  selection1: '1',
                  selection2: '2',
                  bookmaker1: h.provider,
                  bookmaker2: a.provider,
                  odds1: h.odds,
                  odds2: a.odds,
                  edge: Math.round(edge * 10000) / 10000,
                  impliedProb1: Math.round((1 / h.odds) * 10000) / 10000,
                  impliedProb2: Math.round((1 / a.odds) * 10000) / 10000,
                  matchTime: group[0].matchTime,
                })
              }
            }
          }
        }
      }
    }
  }

  // Sort by edge descending
  arbs.sort((a, b) => b.edge - a.edge)
  return arbs.slice(0, 100)
}

// ─── Test a specific adapter ──────────────────────────────────────────

export async function testAdapter(slug: string): Promise<{ ok: boolean; latencyMs: number; error?: string; name?: string }> {
  const { getAdapterBySlug } = await import('./registry')
  const entry = getAdapterBySlug(slug)
  if (!entry) return { ok: false, latencyMs: 0, error: `Unknown bookmaker: ${slug}` }

  const result = await entry.adapter.testConnection()
  return { ...result, name: entry.config.name }
}

// ─── Test all adapters ────────────────────────────────────────────────

export async function testAllAdapters(): Promise<Array<{ slug: string; name: string; ok: boolean; latencyMs: number; error?: string }>> {
  const adapters = getEnabledAdapters()
  const results = []

  for (const entry of adapters) {
    const result = await entry.adapter.testConnection()
    results.push({
      slug: entry.config.slug,
      name: entry.config.name,
      ...result,
    })
  }

  return results
}

// ─── Utility ────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ─── Clear cache (useful for testing) ──────────────────────────────────

export function clearOddsCache(): void {
  previousOddsCache.clear()
}