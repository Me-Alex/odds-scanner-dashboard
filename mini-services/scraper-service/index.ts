/**
 * ArbDesk Scraper Service - Simple HTTP Server
 * Port: 3003
 * Uses raw bun.serve() instead of Hono for stability.
 */

const PORT = 3003

const CF_ACCOUNT_ID = '5af2a80e53141e61fafbb9c45fe9ac2d'
const CF_DATABASE_ID = '5067943f-6a75-4f58-afbd-b311fb2aab39'
const CF_API_TOKEN = process.env.CF_API_TOKEN || ''

const D1_QUERY_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${CF_DATABASE_ID}/query`

const SEARCH_QUERIES = [
  'Romania Superliga odds today football betting',
  'Romania Liga 1 football odds this week bookmakers',
  'Champions League odds today multi bookmaker',
  'Premier League EPL odds today multiple bookmakers',
  'La Liga odds today betting comparison',
  'Serie A odds today bookmaker comparison',
  'Bundesliga odds today multiple bookmakers',
  'NBA basketball odds today bookmakers',
  'EuroLeague basketball odds today',
  'ATP tennis odds today betting',
  'NHL ice hockey odds today bookmakers',
  'UEFA Nations League odds today',
  'Conference League odds today football',
  'Europa League odds today betting sites',
  'Ligue 1 odds today betting sites',
]

interface ScrapedEventRow {
  id: string; externalId: string; provider: string; sport: string
  category: string; tournament: string; homeTeam: string; awayTeam: string
  matchTime: string; bettingStatus: boolean; isLive: boolean
  oddsSnapshot: string; oddsCount: number; fetchedAt: string
}

let lastScrapeAt: string | null = null
let lastScrapeError: string | null = null
let lastScrapeEventsCount = 0
let isScraping = false
let queryRotationIndex = 0
let zaiInstance: any = null

async function getZAI() {
  if (!zaiInstance) {
    const ZAI = (await import('z-ai-web-dev-sdk')).default
    zaiInstance = await ZAI.create()
  }
  return zaiInstance
}

async function d1Query(sql: string, params: unknown[] = []) {
  const resp = await fetch(D1_QUERY_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`D1 failed (${resp.status}): ${text.substring(0, 200)}`)
  }
  const json = await resp.json() as any
  if (!json.success || json.errors?.length) {
    throw new Error(`D1 errors: ${JSON.stringify(json.errors)}`)
  }
  return json.result?.results || []
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, ' | ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

const PARSE_PROMPT = `You are a sports odds data extractor. Extract EVERY match with odds from the web content below.
Return ONLY a JSON array. Each object:
{"externalId":"unique-id","provider":"site-name","sport":"Football","category":"Romania","tournament":"Superliga","homeTeam":"Team A","awayTeam":"Team B","matchTime":"2025-01-15T20:00:00Z","bettingStatus":true,"isLive":false,"oddsSnapshot":{"1":1.85,"X":3.40,"2":4.20},"oddsCount":3}
Rules:
- If multiple bookmakers for same match, create SEPARATE objects with different provider
- provider = website or bookmaker name
- oddsSnapshot keys: "1","X","2" for 1X2; "Over 2.5","Under 2.5" for totals; "Yes","No" for BTTS
- Return ONLY the JSON array, no markdown.`

async function performScrape(queryOverride?: string) {
  const startTime = Date.now()
  const zai = await getZAI()
  const query = queryOverride || SEARCH_QUERIES[queryRotationIndex++ % SEARCH_QUERIES.length]
  console.log(`[scrape] Query: "${query}"`)

  const searchResults = await zai.functions.invoke('web_search', { query, num: 5 })
  if (!Array.isArray(searchResults) || searchResults.length === 0) throw new Error('No search results')

  const pageContents: { title: string; url: string; text: string }[] = []
  for (const result of searchResults.slice(0, 4)) {
    try {
      const pageResult = await zai.functions.invoke('page_reader', { url: (result as any).url })
      const pageData = (pageResult as any)?.data
      if (pageData?.html) {
        pageContents.push({ title: pageData.title || '', url: (result as any).url, text: htmlToText(pageData.html).substring(0, 10000) })
      }
    } catch (err) {
      console.warn(`[scrape] Failed to read page:`, (err as Error).message)
    }
  }
  if (pageContents.length === 0) throw new Error('Could not read any pages')

  const combinedText = pageContents.map((p, i) => `--- Source ${i + 1}: ${p.title} ---\n${p.text}`).join('\n\n')
  console.log(`[scrape] ${combinedText.length} chars to LLM…`)

  const completion = await zai.chat.completions.create({
    messages: [
      { role: 'assistant', content: PARSE_PROMPT },
      { role: 'user', content: `Extract ALL sports matches and odds:\n\n${combinedText}` },
    ],
    thinking: { type: 'disabled' },
  })

  let raw = completion.choices[0]?.message?.content || '[]'
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) raw = codeBlockMatch[1].trim()

  let events: any[] = []
  try { events = JSON.parse(raw) } catch {
    const arrMatch = raw.match(/\[[\s\S]*\]/)
    if (arrMatch) try { events = JSON.parse(arrMatch[0]) } catch { events = [] }
  }
  if (!Array.isArray(events)) events = []

  const now = new Date().toISOString()
  events = events.map((ev) => ({
    id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    externalId: ev.externalId || `ev-${Math.random().toString(36).substring(2, 6)}`,
    provider: ev.provider || 'web-scrape',
    sport: ev.sport || 'Football', category: ev.category || 'International',
    tournament: ev.tournament || 'Unknown',
    homeTeam: ev.homeTeam || 'Unknown', awayTeam: ev.awayTeam || 'Unknown',
    matchTime: ev.matchTime || now, bettingStatus: ev.bettingStatus !== false,
    isLive: ev.isLive === true,
    oddsSnapshot: typeof ev.oddsSnapshot === 'string' ? ev.oddsSnapshot : JSON.stringify(ev.oddsSnapshot || {}),
    oddsCount: ev.oddsCount || (typeof ev.oddsSnapshot === 'object' ? Object.keys(ev.oddsSnapshot).length : 0),
    fetchedAt: now,
  }))

  const durationMs = Date.now() - startTime
  console.log(`[scrape] Done: ${events.length} events in ${durationMs}ms`)
  lastScrapeAt = now
  lastScrapeError = null
  lastScrapeEventsCount = events.length
  return { events, meta: { scrapedAt: now, sourcesRead: pageContents.length, durationMs, eventsCount: events.length, query } }
}

async function seedToD1(events: ScrapedEventRow[]) {
  if (events.length === 0) return { eventsSeeded: 0, bookmakersUpdated: 0 }
  console.log(`[seed] Seeding ${events.length} events…`)
  await d1Query('DELETE FROM ScrapedEvent')
  let inserted = 0
  for (const ev of events) {
    try {
      await d1Query(
        `INSERT OR REPLACE INTO ScrapedEvent (id, externalId, provider, sport, category, tournament, homeTeam, awayTeam, matchTime, bettingStatus, isLive, oddsSnapshot, oddsCount) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [ev.id, ev.externalId, ev.provider, ev.sport, ev.category, ev.tournament, ev.homeTeam, ev.awayTeam, ev.matchTime, ev.bettingStatus ? 1 : 0, ev.isLive ? 1 : 0, ev.oddsSnapshot, ev.oddsCount]
      )
      inserted++
    } catch (err) { console.warn(`[seed] Skip: ${(err as Error).message.substring(0, 80)}`) }
  }
  // Update bookmakers
  const providerMap = new Map<string, number>()
  for (const ev of events) providerMap.set(ev.provider, (providerMap.get(ev.provider) || 0) + 1)
  const now = new Date().toISOString()
  for (const [provider, count] of providerMap) {
    try {
      const existing = await d1Query('SELECT id FROM Bookmaker WHERE slug = ?', [provider])
      if (Array.isArray(existing) && existing.length > 0) {
        await d1Query('UPDATE Bookmaker SET isActive=1, eventsCount=?, lastScrapeAt=?, updatedAt=? WHERE slug=?', [count, now, now, provider])
      } else {
        await d1Query('INSERT INTO Bookmaker (id,name,slug,isActive,eventsCount,lastScrapeAt,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?)',
          [`bk-${provider}-${Math.random().toString(36).substring(2, 6)}`, provider, provider, 1, count, now, now, now])
      }
    } catch (err) { console.warn(`[seed] Bookmaker err: ${(err as Error).message.substring(0, 80)}`) }
  }
  console.log(`[seed] Done: ${inserted}/${events.length} events, ${providerMap.size} bookmakers`)
  return { eventsSeeded: inserted, bookmakersUpdated: providerMap.size }
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' },
  })
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)
    const path = url.pathname

    // CORS preflight
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization' } })

    try {
      // GET /status
      if (path === '/status' && req.method === 'GET') {
        return jsonResponse({ service: 'arb-desk-scraper', port: PORT, isScraping, lastScrapeAt, lastScrapeError, lastScrapeEventsCount, queryRotationIndex, totalQueries: SEARCH_QUERIES.length })
      }

      // POST /scrape
      if (path === '/scrape' && req.method === 'POST') {
        if (isScraping) return jsonResponse({ success: false, error: 'Scrape in progress', events: [] }, 429)
        isScraping = true
        try {
          const body = await req.json().catch(() => ({})) as { query?: string }
          const { events, meta } = await performScrape(body.query)
          return jsonResponse({ success: true, events, meta })
        } catch (err) {
          lastScrapeError = (err as Error).message
          return jsonResponse({ success: false, error: (err as Error).message, events: [] }, 500)
        } finally { isScraping = false }
      }

      // POST /scrape-and-seed
      if (path === '/scrape-and-seed' && req.method === 'POST') {
        if (isScraping) return jsonResponse({ success: false, error: 'Scrape in progress', events: [], seeded: false }, 429)
        isScraping = true
        try {
          const body = await req.json().catch(() => ({})) as { query?: string }
          const { events, meta } = await performScrape(body.query)
          let seedResult = { eventsSeeded: 0, bookmakersUpdated: 0 }
          if (events.length > 0) seedResult = await seedToD1(events)
          return jsonResponse({ success: true, events, seeded: true, seedResult, meta })
        } catch (err) {
          lastScrapeError = (err as Error).message
          return jsonResponse({ success: false, error: (err as Error).message, events: [], seeded: false }, 500)
        } finally { isScraping = false }
      }

      return jsonResponse({ error: 'Not Found' }, 404)
    } catch (err) {
      console.error('[server] Unhandled error:', (err as Error).message)
      return jsonResponse({ error: 'Internal Server Error' }, 500)
    }
  },
})

console.log(`[Scraper Service] Running on port ${PORT}`)
console.log(`[Scraper Service] D1: ${CF_DATABASE_ID}`)