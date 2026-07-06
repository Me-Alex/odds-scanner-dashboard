// ─── Normalized Event (matches ScrapedEvent DB schema) ─────────────────

export interface NormalizedOdds {
  [market: string]: {
    [selection: string]: number  // e.g. { "1X2": { "1": 1.85, "X": 3.40, "2": 4.50 } }
  }
}

export interface NormalizedEvent {
  externalId: string
  provider: string       // bookmaker slug, e.g. 'fortuna', 'superbet'
  sport: string          // normalized sport: 'football', 'basketball', 'tennis', etc.
  category: string       // league/competition, e.g. 'Liga 1 Romania'
  tournament: string     // tournament name
  homeTeam: string
  awayTeam: string
  matchTime: string      // ISO 8601
  bettingStatus: boolean
  isLive: boolean
  odds: NormalizedOdds
}

// ─── Scraping Result ────────────────────────────────────────────────────

export type ScrapingStatus = 'success' | 'partial' | 'error'

export interface ScrapingResult {
  provider: string
  status: ScrapingStatus
  events: NormalizedEvent[]
  eventsFound: number
  durationMs: number
  error?: string
}

// ─── Arb Detection Output ───────────────────────────────────────────────

export interface ArbDetection {
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
}

// ─── Odds Movement ──────────────────────────────────────────────────────

export interface OddsMovementRecord {
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
}

// ─── Bookmaker Config ───────────────────────────────────────────────────

export type BookmakerType = 'rest' | 'websocket' | 'html' | 'graphql' | 'aggregator'
export type BookmakerPlatform = 'digitain' | 'nsoft' | 'egt' | 'kindred' | 'sportify' | 'kaizen' | 'independent'

export interface BookmakerConfig {
  id: string              // e.g. 'bk-fortuna'
  name: string            // e.g. 'Fortuna'
  slug: string            // e.g. 'fortuna'
  type: BookmakerType
  platform: BookmakerPlatform
  isActive: boolean
  baseUrl: string
  /** Comma-separated list of sport IDs to scrape. Empty = all */
  sports: string
  /** Request timeout in ms */
  timeout: number
  /** Minimum interval between requests in ms */
  minInterval: number
  /** Additional headers needed */
  headers?: Record<string, string>
  /** API key or token (if needed) */
  apiKey?: string
}

// ─── Adapter Interface ──────────────────────────────────────────────────

export interface BookmakerAdapter {
  readonly config: BookmakerConfig
  /** Fetch all available events with odds */
  scrape(sports?: string[]): Promise<ScrapingResult>
  /** Test if the adapter can reach the bookmaker */
  testConnection(): Promise<{ ok: boolean; latencyMs: number; error?: string }>
}

// ─── Sport Mapping ──────────────────────────────────────────────────────

export const SPORT_ALIASES: Record<string, string> = {
  // Romanian / localized → normalized
  'fotbal': 'football',
  '1': 'football',
  'basketball': 'basketball',
  'baschet': 'basketball',
  '2': 'basketball',
  'tenis': 'tennis',
  'tennis': 'tennis',
  '13': 'tennis',
  'hochei': 'ice-hockey',
  'ice hockey': 'ice-hockey',
  '4': 'ice-hockey',
  'handbal': 'handball',
  'handball': 'handball',
  '6': 'handball',
  'volei': 'volleyball',
  'volleyball': 'volleyball',
  '10': 'volleyball',
  'fotbal-american': 'american-football',
  'american football': 'american-football',
  'baschet 3x3': 'basketball',
  '3x3': 'basketball',
  'box': 'boxing',
  'boxing': 'boxing',
  'mma': 'mma',
  'ciclism': 'cycling',
  'cycling': 'cycling',
  'darts': 'darts',
  'snooker': 'snooker',
  'rugby': 'rugby',
  'futsal': 'futsal',
  'table tennis': 'table-tennis',
  'tenis de masa': 'table-tennis',
  'esports': 'esports',
  'e-sports': 'esports',
}

export function normalizeSport(raw: string): string {
  const lower = (raw || '').trim().toLowerCase()
  return SPORT_ALIASES[lower] || lower || 'other'
}

// ─── Market Mapping ─────────────────────────────────────────────────────

export const MARKET_ALIASES: Record<string, string> = {
  '1x2': '1X2',
  'match winner': '1X2',
  'full time result': '1X2',
  'match result': '1X2',
  'result': '1X2',
  'over/under 2.5': 'Over/Under 2.5',
  'ou 2.5': 'Over/Under 2.5',
  'total goals over/under 2.5': 'Over/Under 2.5',
  'over/under 0.5': 'Over/Under 0.5',
  'over/under 1.5': 'Over/Under 1.5',
  'over/under 3.5': 'Over/Under 3.5',
  'both teams to score': 'BTTS',
  'btts': 'BTTS',
  'gg/ng': 'BTTS',
  'double chance': 'Double Chance',
  'handicap': 'Handicap',
  'asian handicap': 'Asian Handicap',
  'draw no bet': 'Draw No Bet',
  'dnb': 'Draw No Bet',
}

export function normalizeMarket(raw: string): string {
  const lower = (raw || '').trim().toLowerCase()
  return MARKET_ALIASES[lower] || raw.trim() || 'Other'
}

// ─── Team Name Normalization ────────────────────────────────────────────

const TEAM_NAME_MAP: Record<string, string> = {
  // Common Romanian team name variations
  'fcsr': 'FCSB',
  'fcsb bucharest': 'FCSB',
  'steaua bucuresti': 'FCSB',
  'steaua': 'FCSB',
  'cfr cluj': 'CFR Cluj',
  'cfr-cluj': 'CFR Cluj',
  'universitatea craiova': 'U Craiova',
  'u craiova': 'U Craiova',
  'cs u craiova': 'U Craiova',
  'rapid bucuresti': 'Rapid',
  'rapid': 'Rapid',
  'rapid bucharest': 'Rapid',
  'dinamo bucuresti': 'Dinamo Bucuresti',
  'dinamo': 'Dinamo Bucuresti',
  'sepsi osk': 'Sepsi',
  'sepsi sfantu gheorghe': 'Sepsi',
  'fc hermannstadt': 'Hermannstadt',
  'hermannstadt': 'Hermannstadt',
  'sibiu': 'Hermannstadt',
  'uta arad': 'UTA Arad',
  'uta': 'UTA Arad',
  'fc botosani': 'Botosani',
  'botosani': 'Botosani',
  'chindia targoviste': 'Chindia',
  'chindia': 'Chindia',
  'mioveni': 'Mioveni',
  'fc mioveni': 'Mioveni',
  'fc voluntari': 'Voluntari',
  'voluntari': 'Voluntari',
  'academica clinceni': 'Clinceni',
  'clinceni': 'Clinceni',
  'astra giurgiu': 'Astra Giurgiu',
  'astra': 'Astra Giurgiu',
  'viitorul constanta': 'Viitorul',
  'viitorul': 'Viitorul',
  'concordia chiajna': 'Concordia',
  'chiajna': 'Concordia',
  'gaz metan medias': 'Gaz Metan',
  'medias': 'Gaz Metan',
  'poli iasi': 'Poli Iasi',
  'iasi': 'Poli Iasi',
  'bacau': 'SCM Bacau',
  'targu mures': 'Mures',
}

export function normalizeTeamName(raw: string): string {
  if (!raw) return 'Unknown'
  const key = raw.trim().toLowerCase()
  return TEAM_NAME_MAP[key] || raw.trim()
}

// ─── Utility: count odds in a snapshot ──────────────────────────────────

export function countOdds(odds: NormalizedOdds): number {
  let count = 0
  for (const market of Object.values(odds)) {
    count += Object.keys(market).length
  }
  return count
}
