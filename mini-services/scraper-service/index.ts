/**
 * ArbDesk Scraper Service
 * Port: 3003
 *
 * Uses z-ai-web-dev-sdk to search + LLM-parse Romanian football odds,
 * then seeds them into Cloudflare D1.
 *
 * Endpoints:
 *   POST /scrape  — Search for odds, parse with LLM, return structured JSON
 *   POST /seed    — Push odds JSON array into Cloudflare D1
 *   GET  /status  — Last scrape info
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import ZAI from 'z-ai-web-dev-sdk'

// ─── Config ────────────────────────────────────────────────────────────

const PORT = 3003

const CF_ACCOUNT_ID = '5af2a80e53141e61fafbb9c45fe9ac2d'
const CF_DATABASE_ID = '5067943f-6a75-4f58-afbd-b311fb2aab39'
const CF_API_TOKEN = process.env.CF_API_TOKEN || ''

const D1_QUERY_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${CF_DATABASE_ID}/query`

// ─── State ─────────────────────────────────────────────────────────────

interface ScrapedEventRow {
  id: string
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
  oddsSnapshot: string
  oddsCount: number
  fetchedAt: string
}

let lastScrapeAt: string | null = null
let lastScrapeError: string | null = null
let lastScrapeEventsCount = 0
let zaiInstance: InstanceType<typeof ZAI> | null = null

// ─── ZAI Singleton ─────────────────────────────────────────────────────

async function getZAI(): Promise<InstanceType<typeof ZAI>> {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create()
  }
  return zaiInstance
}

// ─── D1 Helper ─────────────────────────────────────────────────────────

async function d1Query(sql: string, params: unknown[] = []) {
  const resp = await fetch(D1_QUERY_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`D1 query failed (${resp.status}): ${text}`)
  }

  const json = (await resp.json()) as {
    result?: { results?: unknown[] }
    errors?: unknown[]
    success: boolean
  }

  if (!json.success || json.errors?.length) {
    throw new Error(`D1 errors: ${JSON.stringify(json.errors)}`)
  }

  return json.result?.results || []
}

// ─── HTML → plain text ─────────────────────────────────────────────────

function htmlToText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, ' | ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ─── LLM Parse Prompt ──────────────────────────────────────────────────

const PARSE_SYSTEM_PROMPT = `You are a data extraction assistant. Given web page content about Romanian football (Superliga) odds,
extract every match you can find and return ONLY a valid JSON array. No markdown, no explanation.

Each object must match this exact schema:
{
  "externalId": "unique-string-id",
  "provider": "source-website-name",
  "sport": "Football",
  "category": "Romania",
  "tournament": "Superliga",
  "homeTeam": "Team A",
  "awayTeam": "Team B",
  "matchTime": "2025-01-15T20:00:00Z",
  "bettingStatus": true,
  "isLive": false,
  "oddsSnapshot": {"1": 1.85, "X": 3.40, "2": 4.20},
  "oddsCount": 3
}

Rules:
- Generate a unique externalId like "web-{homeSlug}-{awaySlug}" (lowercase, no spaces).
- provider should be the website name the odds came from (e.g. "flashscore", "oddsportal", "betexplorer").
- matchTime: use today's date if not found, or the date mentioned. Use ISO 8601.
- oddsSnapshot: extract ALL odds you can find (1X2, over/under, etc.). Use standard keys.
- oddsCount: number of odds entries in oddsSnapshot.
- If you find no matches, return an empty array [].
- Return ONLY the JSON array, nothing else.`

// ─── App ───────────────────────────────────────────────────────────────

const app = new Hono()

app.use('*', cors())

// ─── POST /scrape ──────────────────────────────────────────────────────

app.post('/scrape', async (c) => {
  const startTime = Date.now()
  console.log('[/scrape] Starting scrape…')

  try {
    const zai = await getZAI()

    // 1. Search for Romania Superliga odds
    console.log('[/scrape] Searching for "Romania Superliga odds today"…')
    const searchResults = await zai.functions.invoke('web_search', {
      query: 'Romania Superliga odds today',
      num: 3,
    })

    if (!Array.isArray(searchResults) || searchResults.length === 0) {
      throw new Error('No search results returned')
    }

    console.log(`[/scrape] Got ${searchResults.length} results: ${searchResults.map((r: any) => r.url).join(', ')}`)

    // 2. Read top 3 pages
    const topResults = searchResults.slice(0, 3)
    const pageContents: { title: string; url: string; text: string }[] = []

    for (const result of topResults) {
      try {
        console.log(`[/scrape] Reading page: ${result.url}`)
        const pageResult = await zai.functions.invoke('page_reader', {
          url: result.url,
        })

        const pageData = (pageResult as any)?.data
        if (pageData?.html) {
          const text = htmlToText(pageData.html)
          // Truncate very long pages to avoid token limits
          pageContents.push({
            title: pageData.title || result.name || '',
            url: result.url,
            text: text.substring(0, 8000),
          })
        }
      } catch (err) {
        console.warn(`[/scrape] Failed to read ${result.url}:`, (err as Error).message)
      }
    }

    if (pageContents.length === 0) {
      throw new Error('Could not read any search result pages')
    }

    // 3. Send content to LLM for structured extraction
    const combinedText = pageContents
      .map((p, i) => `--- Source ${i + 1}: ${p.title} (${p.url}) ---\n${p.text}`)
      .join('\n\n')

    console.log(`[/scrape] Sending ${combinedText.length} chars to LLM for parsing…`)

    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: PARSE_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Extract all Romanian Superliga football matches and odds from the following web content:\n\n${combinedText}`,
        },
      ],
      thinking: { type: 'disabled' },
    })

    const raw = completion.choices[0]?.message?.content || '[]'

    // 4. Parse the LLM response — handle potential markdown wrapping
    let jsonStr = raw.trim()
    // Strip ```json ... ``` or ``` ... ```
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim()
    }

    let events: ScrapedEventRow[]
    try {
      events = JSON.parse(jsonStr)
    } catch {
      throw new Error(`LLM returned invalid JSON: ${jsonStr.substring(0, 200)}…`)
    }

    if (!Array.isArray(events)) {
      throw new Error('LLM did not return an array')
    }

    // Enrich each event with an id and fetchedAt
    const now = new Date().toISOString()
    events = events.map((ev) => ({
      id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      externalId: ev.externalId || `unknown-${Math.random().toString(36).substring(2, 6)}`,
      provider: ev.provider || 'web-scrape',
      sport: ev.sport || 'Football',
      category: ev.category || 'Romania',
      tournament: ev.tournament || 'Superliga',
      homeTeam: ev.homeTeam || 'Unknown',
      awayTeam: ev.awayTeam || 'Unknown',
      matchTime: ev.matchTime || now,
      bettingStatus: ev.bettingStatus !== false,
      isLive: ev.isLive === true,
      oddsSnapshot: typeof ev.oddsSnapshot === 'string' ? ev.oddsSnapshot : JSON.stringify(ev.oddsSnapshot || {}),
      oddsCount: ev.oddsCount || (typeof ev.oddsSnapshot === 'object' ? Object.keys(ev.oddsSnapshot).length : 0),
      fetchedAt: now,
    }))

    // Update state
    lastScrapeAt = now
    lastScrapeError = null
    lastScrapeEventsCount = events.length

    const durationMs = Date.now() - startTime
    console.log(`[/scrape] Done in ${durationMs}ms — ${events.length} events extracted`)

    return c.json({
      success: true,
      events,
      meta: {
        scrapedAt: now,
        sourcesRead: pageContents.length,
        durationMs,
        eventsCount: events.length,
      },
    })
  } catch (err) {
    const error = err as Error
    lastScrapeError = error.message
    console.error('[/scrape] Error:', error.message)

    return c.json(
      { success: false, error: error.message, events: [] },
      500,
    )
  }
})

// ─── POST /seed ────────────────────────────────────────────────────────

app.post('/seed', async (c) => {
  try {
    const body = await c.req.json<{ events: ScrapedEventRow[] }>()

    if (!Array.isArray(body.events) || body.events.length === 0) {
      return c.json({ success: false, error: 'Request body must contain { events: [...] } with at least one event' }, 400)
    }

    console.log(`[/seed] Seeding ${body.events.length} events to D1…`)

    // 1. DELETE all existing ScrapedEvents
    console.log('[/seed] Deleting all existing ScrapedEvents…')
    await d1Query('DELETE FROM ScrapedEvent')

    // 2. Batch INSERT new events
    console.log('[/seed] Inserting new events…')
    for (const ev of body.events) {
      await d1Query(
        `INSERT INTO ScrapedEvent (id, externalId, provider, sport, category, tournament, homeTeam, awayTeam, matchTime, bettingStatus, isLive, oddsSnapshot, oddsCount, fetchedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ev.id,
          ev.externalId,
          ev.provider,
          ev.sport,
          ev.category,
          ev.tournament,
          ev.homeTeam,
          ev.awayTeam,
          ev.matchTime,
          ev.bettingStatus ? 1 : 0,
          ev.isLive ? 1 : 0,
          ev.oddsSnapshot,
          ev.oddsCount,
          ev.fetchedAt,
        ],
      )
    }

    // 3. Update Bookmaker table — aggregate events per provider
    console.log('[/seed] Updating Bookmaker table…')
    const providerMap = new Map<string, number>()
    for (const ev of body.events) {
      providerMap.set(ev.provider, (providerMap.get(ev.provider) || 0) + 1)
    }

    const now = new Date().toISOString()
    for (const [provider, count] of providerMap) {
      // Try update first
      const existing = await d1Query('SELECT id FROM Bookmaker WHERE slug = ?', [provider])
      if (Array.isArray(existing) && existing.length > 0) {
        await d1Query(
          'UPDATE Bookmaker SET isActive = 1, eventsCount = ?, lastScrapeAt = ?, updatedAt = ? WHERE slug = ?',
          [count, now, now, provider],
        )
      } else {
        // Insert new bookmaker
        const bkId = `bk-${provider}-${Math.random().toString(36).substring(2, 6)}`
        await d1Query(
          'INSERT INTO Bookmaker (id, name, slug, isActive, eventsCount, lastScrapeAt, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?, ?, ?)',
          [bkId, provider, provider, count, now, now, now],
        )
      }
    }

    console.log(`[/seed] Seeded ${body.events.length} events, updated ${providerMap.size} bookmakers`)

    return c.json({
      success: true,
      eventsSeeded: body.events.length,
      bookmakersUpdated: providerMap.size,
    })
  } catch (err) {
    const error = err as Error
    console.error('[/seed] Error:', error.message)
    return c.json({ success: false, error: error.message }, 500)
  }
})

// ─── GET /status ───────────────────────────────────────────────────────

app.get('/status', (c) => {
  return c.json({
    service: 'arb-desk-scraper',
    port: PORT,
    uptime: process.uptime(),
    lastScrapeAt,
    lastScrapeError,
    lastScrapeEventsCount,
  })
})

// ─── Export for bun (auto-serves on port 3003) ───────────────────────

export default {
  port: PORT,
  fetch: app.fetch,
  idleTimeout: 255,
}

console.log(`[Scraper Service] Configured on port ${PORT}`)