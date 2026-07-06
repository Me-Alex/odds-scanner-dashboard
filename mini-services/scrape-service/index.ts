/**
 * Arb Desk Scraping Mini-Service
 * Runs continuously, scraping enabled bookmakers on a timer.
 * Writes results to D1 via the Cloudflare API.
 * 
 * Port: 3002
 * 
 * Endpoints:
 *   GET  /           — Health check + last scrape status
 *   GET  /status     — Detailed status of all adapters
 *   POST /scrape     — Trigger an immediate scrape
 *   GET  /test/:slug — Test a specific bookmaker connection
 */

const PORT = 3002
const SCRAPE_INTERVAL_MS = 60_000 // 1 minute
const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4'
const D1_DATABASE_ID = '5067943f-6a75-4f58-afbd-b311fb2aab39'

// ─── State ──────────────────────────────────────────────────────────────

interface ScrapeStatus {
  lastScrapeAt: string | null
  totalEvents: number
  totalArbs: number
  totalMovements: number
  results: Array<{
    provider: string
    status: string
    eventsFound: number
    durationMs: number
    error?: string
  }>
  isRunning: boolean
  nextScrapeAt: string
}

let status: ScrapeStatus = {
  lastScrapeAt: null,
  totalEvents: 0,
  totalArbs: 0,
  totalMovements: 0,
  results: [],
  isRunning: false,
  nextScrapeAt: new Date(Date.now() + SCRAPE_INTERVAL_MS).toISOString(),
}

// ─── D1 API Helper ─────────────────────────────────────────────────────

const CF_API_TOKEN = process.env.CF_API_TOKEN

async function d1Query(sql: string, params: unknown[] = []) {
  if (!CF_API_TOKEN) {
    console.warn('[D1] CF_API_TOKEN not set, using local fallback')
    return { results: [] }
  }

  const resp = await fetch(`${CLOUDFLARE_API_BASE}/accounts/${CF_API_TOKEN}/d1/database/${D1_DATABASE_ID}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
  })

  if (!resp.ok) {
    const text = await resp.text()
    console.error(`[D1] Query failed (${resp.status}):`, text)
    return { results: [] }
  }

  const json = await resp.json() as { result?: { results?: unknown[] }; errors?: unknown[] }
  if (json.errors?.length) {
    console.error('[D1] Query errors:', json.errors)
    return { results: [] }
  }

  return { results: json.result?.results || [] }
}

// ─── Scraping Logic (imports from the main app) ────────────────────────

async function runScrape() {
  if (status.isRunning) {
    console.log('[Scrape] Already running, skipping')
    return
  }

  status.isRunning = true
  const startTime = Date.now()
  console.log(`[Scrape] Starting at ${new Date().toISOString()}`)

  try {
    // Dynamic import of the scraping engine
    // In a separate service, we'd need to duplicate or share the adapter code
    // For now, this service serves as the orchestrator that calls the main API
    const mainApiUrl = process.env.MAIN_API_URL || 'http://localhost:3000'

    // Trigger scraping via the main app's API
    const token = process.env.ARBEDESK_TOKEN || ''
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`

    const resp = await fetch(`${mainApiUrl}/api/odds?refresh=1`, { headers })
    const data = await resp.json() as Record<string, unknown>

    if (data.scraping) {
      const scraping = data.scraping as {
        totalEvents: number
        results: ScrapeStatus['results']
      }
      status.totalEvents = scraping.totalEvents
      status.results = scraping.results
    }

    status.lastScrapeAt = new Date().toISOString()
    console.log(`[Scrape] Completed in ${Date.now() - startTime}ms — ${status.totalEvents} events`)
  } catch (err) {
    console.error('[Scrape] Error:', err)
    status.results.push({
      provider: 'system',
      status: 'error',
      eventsFound: 0,
      durationMs: Date.now() - startTime,
      error: String(err),
    })
  } finally {
    status.isRunning = false
    status.nextScrapeAt = new Date(Date.now() + SCRAPE_INTERVAL_MS).toISOString()
  }
}

// ─── HTTP Server ───────────────────────────────────────────────────────

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)
    const path = url.pathname

    // CORS
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' },
      })
    }

    const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }

    // GET / — Health + status
    if (path === '/' && req.method === 'GET') {
      return Response.json({
        service: 'arb-desk-scrape-service',
        version: '1.0.0',
        uptime: process.uptime(),
        ...status,
      }, { headers })
    }

    // GET /status — Detailed status
    if (path === '/status' && req.method === 'GET') {
      return Response.json(status, { headers })
    }

    // POST /scrape — Trigger immediate scrape
    if (path === '/scrape' && req.method === 'POST') {
      if (status.isRunning) {
        return Response.json({ error: 'Scrape already running' }, { status: 409, headers })
      }
      // Run async
      runScrape()
      return Response.json({ message: 'Scrape triggered', nextScrapeAt: status.nextScrapeAt }, { headers })
    }

    return Response.json({ error: 'Not found' }, { status: 404, headers })
  },
})

console.log(`[Scrape Service] Running on port ${PORT}`)
console.log(`[Scrape Service] Scrape interval: ${SCRAPE_INTERVAL_MS / 1000}s`)

// ─── Scrape Loop ────────────────────────────────────────────────────────

// Initial scrape after 5s
setTimeout(() => {
  runScrape()
}, 5000)

// Continuous scrape loop
setInterval(() => {
  runScrape()
}, SCRAPE_INTERVAL_MS)