import { NextResponse } from "next/server";

// Types
interface BookmakerOdds {
  name: string;
  lastUpdate: string;
  markets: Record<string, Record<string, number>>;
}

interface Event {
  id: string;
  sport: string;
  competition: string;
  startsAt: string;
  homeTeam: string;
  awayTeam: string;
  bookmakers: BookmakerOdds[];
}

interface ArbOpportunity {
  id: string;
  eventId: string;
  sport: string;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  marketType: string;
  edge: number;
  confidence: string;
  bookmaker1: string;
  bookmaker2: string;
  selection1: string;
  selection2: string;
  odds1: number;
  odds2: number;
  impliedProb1: number;
  impliedProb2: number;
  startsAt: string;
}

interface ValueBet {
  id: string;
  eventId: string;
  sport: string;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  marketType: string;
  selection: string;
  bookmaker: string;
  odds: number;
  consensusOdds: number;
  edge: number;
  startsAt: string;
}

interface OddsResponse {
  mode: "demo";
  fetchedAt: string;
  previousFetchedAt: string;
  events: Event[];
  opportunities: ArbOpportunity[];
  valueBets: ValueBet[];
}

function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function GET(): Promise<NextResponse<OddsResponse>> {
  const now = new Date();
  const fetchedAt = now.toISOString();
  const previousFetchedAt = new Date(
    now.getTime() - 5 * 60 * 1000
  ).toISOString();

  // ─── Helper: create a bookmaker entry ───
  function bk(
    name: string,
    minutesAgoVal: number,
    markets: Record<string, Record<string, number>>
  ): BookmakerOdds {
    return { name, lastUpdate: minutesAgo(minutesAgoVal), markets };
  }

  // ═══════════════════════════════════════════
  // 12 EVENTS
  // ═══════════════════════════════════════════

  const events: Event[] = [
    // ── 1. FCSB vs CFR Cluj (Romania Liga 1) ──
    {
      id: "evt-001",
      sport: "Football",
      competition: "Romania Liga 1",
      startsAt: hoursFromNow(1),
      homeTeam: "FCSB",
      awayTeam: "CFR Cluj",
      bookmakers: [
        bk("Superbet", 2, {
          "1X2": { Home: 2.55, Draw: 3.20, Away: 3.40 },
          "Over/Under 2.5": { Over: 1.85, Under: 1.95 },
          "Double Chance": { "1X": 1.35, X2: 1.65 },
        }),
        bk("Betano", 3, {
          "1X2": { Home: 2.50, Draw: 3.35, Away: 3.30 },
          "Over/Under 2.5": { Over: 1.80, Under: 2.00 },
          "Double Chance": { "1X": 1.33, X2: 1.68 },
        }),
        bk("Fortuna", 1, {
          "1X2": { Home: 2.45, Draw: 3.30, Away: 3.45 },
          "Over/Under 2.5": { Over: 1.90, Under: 1.90 },
          "Double Chance": { "1X": 1.37, X2: 1.62 },
        }),
        bk("Getsbet", 5, {
          "1X2": { Home: 2.50, Draw: 3.25, Away: 3.35 },
          "Over/Under 2.5": { Over: 1.82, Under: 1.98 },
          "Double Chance": { "1X": 1.34, X2: 1.67 },
        }),
      ],
    },

    // ── 2. U Craiova vs Rapid București (Romania Liga 1) ──
    {
      id: "evt-002",
      sport: "Football",
      competition: "Romania Liga 1",
      startsAt: hoursFromNow(5),
      homeTeam: "U Craiova",
      awayTeam: "Rapid București",
      bookmakers: [
        bk("Superbet", 4, {
          "1X2": { Home: 2.30, Draw: 3.25, Away: 3.10 },
          "Over/Under 2.5": { Over: 2.05, Under: 1.75 },
          "Double Chance": { "1X": 1.30, X2: 1.60 },
        }),
        bk("Betano", 2, {
          "1X2": { Home: 2.20, Draw: 3.30, Away: 3.20 },
          "Over/Under 2.5": { Over: 2.00, Under: 1.80 },
          "Double Chance": { "1X": 1.28, X2: 1.62 },
        }),
        bk("Fortuna", 6, {
          "1X2": { Home: 2.25, Draw: 3.40, Away: 3.15 },
          "Over/Under 2.5": { Over: 2.10, Under: 1.72 },
          "Double Chance": { "1X": 1.32, X2: 1.58 },
        }),
        bk("Winbet", 3, {
          "1X2": { Home: 2.35, Draw: 3.20, Away: 3.05 },
          "Over/Under 2.5": { Over: 2.02, Under: 1.78 },
          "Double Chance": { "1X": 1.31, X2: 1.59 },
        }),
      ],
    },

    // ── 3. Sepsi vs Universitatea (Cupa României) ──
    {
      id: "evt-003",
      sport: "Football",
      competition: "Romania Cupa României",
      startsAt: hoursFromNow(8),
      homeTeam: "Sepsi",
      awayTeam: "Universitatea",
      bookmakers: [
        bk("Betano", 7, {
          "1X2": { Home: 2.45, Draw: 3.10, Away: 3.00 },
          "Over/Under 2.5": { Over: 2.15, Under: 1.70 },
          "Double Chance": { "1X": 1.28, X2: 1.55 },
        }),
        bk("Fortuna", 4, {
          "1X2": { Home: 2.40, Draw: 3.15, Away: 3.10 },
          "Over/Under 2.5": { Over: 2.10, Under: 1.72 },
          "Double Chance": { "1X": 1.30, X2: 1.57 },
        }),
        bk("Getsbet", 10, {
          "1X2": { Home: 2.50, Draw: 3.05, Away: 2.95 },
          "Over/Under 2.5": { Over: 2.20, Under: 1.68 },
          "Double Chance": { "1X": 1.27, X2: 1.54 },
        }),
        bk("Netbet", 5, {
          "1X2": { Home: 2.45, Draw: 3.30, Away: 3.50 },
          "Over/Under 2.5": { Over: 1.90, Under: 1.90 },
          "Double Chance": { "1X": 1.35, X2: 1.65 },
        }),
      ],
    },

    // ── 4. Real Madrid vs Man City (Champions League) ──
    {
      id: "evt-004",
      sport: "Football",
      competition: "Champions League",
      startsAt: hoursFromNow(24),
      homeTeam: "Real Madrid",
      awayTeam: "Man City",
      bookmakers: [
        bk("Superbet", 1, {
          "1X2": { Home: 2.40, Draw: 3.40, Away: 2.90 },
          "Over/Under 2.5": { Over: 1.70, Under: 2.10 },
          "Double Chance": { "1X": 1.40, X2: 1.55 },
          "Asian Handicap": { "Home -0.5": 2.80, "Away +0.5": 1.45 },
        }),
        bk("Betano", 2, {
          "1X2": { Home: 2.35, Draw: 3.45, Away: 2.95 },
          "Over/Under 2.5": { Over: 1.72, Under: 2.08 },
          "Double Chance": { "1X": 1.38, X2: 1.57 },
          "Asian Handicap": { "Home -0.5": 2.85, "Away +0.5": 1.42 },
        }),
        bk("Fortuna", 3, {
          "1X2": { Home: 2.45, Draw: 3.35, Away: 2.85 },
          "Over/Under 2.5": { Over: 1.68, Under: 2.15 },
          "Double Chance": { "1X": 1.42, X2: 1.53 },
          "Asian Handicap": { "Home -0.5": 2.75, "Away +0.5": 1.48 },
        }),
        bk("Getsbet", 4, {
          "1X2": { Home: 2.38, Draw: 3.42, Away: 2.92 },
          "Over/Under 2.5": { Over: 1.71, Under: 2.12 },
          "Double Chance": { "1X": 1.39, X2: 1.56 },
          "Asian Handicap": { "Home -0.5": 2.82, "Away +0.5": 1.44 },
        }),
        bk("Winbet", 6, {
          "1X2": { Home: 2.42, Draw: 3.38, Away: 2.88 },
          "Over/Under 2.5": { Over: 1.82, Under: 2.00 },
          "Double Chance": { "1X": 1.41, X2: 1.54 },
          "Asian Handicap": { "Home -0.5": 2.78, "Away +0.5": 1.46 },
        }),
      ],
    },

    // ── 5. Bayern Munich vs PSG (Champions League) ──
    {
      id: "evt-005",
      sport: "Football",
      competition: "Champions League",
      startsAt: hoursFromNow(26),
      homeTeam: "Bayern Munich",
      awayTeam: "PSG",
      bookmakers: [
        bk("Superbet", 5, {
          "1X2": { Home: 1.65, Draw: 4.00, Away: 5.00 },
          "Over/Under 2.5": { Over: 1.55, Under: 2.40 },
          "Double Chance": { "1X": 1.12, X2: 2.35 },
          "Asian Handicap": { "Home -1": 2.10, "Away +1": 1.75 },
        }),
        bk("Betano", 3, {
          "1X2": { Home: 1.62, Draw: 4.10, Away: 5.20 },
          "Over/Under 2.5": { Over: 1.58, Under: 2.35 },
          "Double Chance": { "1X": 1.11, X2: 2.40 },
          "Asian Handicap": { "Home -1": 2.15, "Away +1": 1.72 },
        }),
        bk("Fortuna", 7, {
          "1X2": { Home: 1.68, Draw: 3.90, Away: 4.80 },
          "Over/Under 2.5": { Over: 1.52, Under: 2.50 },
          "Double Chance": { "1X": 1.13, X2: 2.30 },
          "Asian Handicap": { "Home -1": 2.05, "Away +1": 1.78 },
        }),
        bk("Netbet", 8, {
          "1X2": { Home: 1.70, Draw: 3.95, Away: 4.90 },
          "Over/Under 2.5": { Over: 1.50, Under: 2.55 },
          "Double Chance": { "1X": 1.15, X2: 2.28 },
          "Asian Handicap": { "Home -1": 2.00, "Away +1": 1.80 },
        }),
      ],
    },

    // ── 6. Arsenal vs Sporting CP (Europa League) ──
    {
      id: "evt-006",
      sport: "Football",
      competition: "Europa League",
      startsAt: hoursFromNow(20),
      homeTeam: "Arsenal",
      awayTeam: "Sporting CP",
      bookmakers: [
        bk("Superbet", 2, {
          "1X2": { Home: 1.45, Draw: 4.50, Away: 6.50 },
          "Over/Under 2.5": { Over: 1.60, Under: 2.30 },
          "Double Chance": { "1X": 1.10, X2: 2.80 },
        }),
        bk("Betano", 4, {
          "1X2": { Home: 1.42, Draw: 4.60, Away: 6.80 },
          "Over/Under 2.5": { Over: 1.62, Under: 2.25 },
          "Double Chance": { "1X": 1.09, X2: 2.85 },
        }),
        bk("Getsbet", 6, {
          "1X2": { Home: 1.48, Draw: 4.40, Away: 6.30 },
          "Over/Under 2.5": { Over: 1.58, Under: 2.35 },
          "Double Chance": { "1X": 1.11, X2: 2.75 },
        }),
        bk("Winbet", 3, {
          "1X2": { Home: 1.44, Draw: 4.55, Away: 6.60 },
          "Over/Under 2.5": { Over: 1.61, Under: 2.28 },
          "Double Chance": { "1X": 1.10, X2: 2.82 },
        }),
      ],
    },

    // ── 7. Liverpool vs Brighton (Premier League) ──
    {
      id: "evt-007",
      sport: "Football",
      competition: "Premier League",
      startsAt: hoursFromNow(48),
      homeTeam: "Liverpool",
      awayTeam: "Brighton",
      bookmakers: [
        bk("Superbet", 8, {
          "1X2": { Home: 1.40, Draw: 4.80, Away: 7.50 },
          "Over/Under 2.5": { Over: 1.50, Under: 2.50 },
          "Double Chance": { "1X": 1.08, X2: 3.00 },
          "Asian Handicap": { "Home -1.5": 2.20, "Away +1.5": 1.68 },
        }),
        bk("Betano", 5, {
          "1X2": { Home: 1.38, Draw: 4.90, Away: 7.80 },
          "Over/Under 2.5": { Over: 1.52, Under: 2.45 },
          "Double Chance": { "1X": 1.07, X2: 3.10 },
          "Asian Handicap": { "Home -1.5": 2.25, "Away +1.5": 1.65 },
        }),
        bk("Fortuna", 10, {
          "1X2": { Home: 1.42, Draw: 4.70, Away: 7.20 },
          "Over/Under 2.5": { Over: 1.48, Under: 2.55 },
          "Double Chance": { "1X": 1.09, X2: 2.90 },
          "Asian Handicap": { "Home -1.5": 2.15, "Away +1.5": 1.72 },
        }),
        bk("Getsbet", 7, {
          "1X2": { Home: 1.39, Draw: 4.85, Away: 7.60 },
          "Over/Under 2.5": { Over: 1.51, Under: 2.48 },
          "Double Chance": { "1X": 1.08, X2: 3.05 },
          "Asian Handicap": { "Home -1.5": 2.22, "Away +1.5": 1.66 },
        }),
      ],
    },

    // ── 8. Barcelona vs Atletico Madrid (La Liga) ──
    {
      id: "evt-008",
      sport: "Football",
      competition: "La Liga",
      startsAt: hoursFromNow(22),
      homeTeam: "Barcelona",
      awayTeam: "Atletico Madrid",
      bookmakers: [
        bk("Superbet", 3, {
          "1X2": { Home: 1.80, Draw: 3.60, Away: 4.50 },
          "Over/Under 2.5": { Over: 1.65, Under: 2.20 },
          "Double Chance": { "1X": 1.18, X2: 2.10 },
          "Asian Handicap": { "Home -0.5": 2.15, "Away +0.5": 1.72 },
        }),
        bk("Betano", 5, {
          "1X2": { Home: 1.78, Draw: 3.55, Away: 4.60 },
          "Over/Under 2.5": { Over: 1.68, Under: 2.18 },
          "Double Chance": { "1X": 1.17, X2: 2.12 },
          "Asian Handicap": { "Home -0.5": 2.20, "Away +0.5": 1.70 },
        }),
        bk("Fortuna", 2, {
          "1X2": { Home: 1.82, Draw: 3.50, Away: 4.40 },
          "Over/Under 2.5": { Over: 1.62, Under: 2.25 },
          "Double Chance": { "1X": 1.20, X2: 2.05 },
          "Asian Handicap": { "Home -0.5": 2.10, "Away +0.5": 1.75 },
        }),
        bk("Getsbet", 9, {
          "1X2": { Home: 1.79, Draw: 3.58, Away: 4.55 },
          "Over/Under 2.5": { Over: 1.66, Under: 2.22 },
          "Double Chance": { "1X": 1.19, X2: 2.08 },
          "Asian Handicap": { "Home -0.5": 2.18, "Away +0.5": 1.71 },
        }),
        bk("Netbet", 11, {
          "1X2": { Home: 1.80, Draw: 3.65, Away: 4.70 },
          "Over/Under 2.5": { Over: 1.60, Under: 2.30 },
          "Double Chance": { "1X": 1.22, X2: 2.15 },
          "Asian Handicap": { "Home -0.5": 2.25, "Away +0.5": 1.68 },
        }),
      ],
    },

    // ── 9. Inter Milan vs Napoli (Serie A) ──
    {
      id: "evt-009",
      sport: "Football",
      competition: "Serie A",
      startsAt: hoursFromNow(28),
      homeTeam: "Inter Milan",
      awayTeam: "Napoli",
      bookmakers: [
        bk("Superbet", 6, {
          "1X2": { Home: 2.00, Draw: 3.40, Away: 3.80 },
          "Over/Under 2.5": { Over: 1.75, Under: 2.05 },
          "Double Chance": { "1X": 1.25, X2: 1.90 },
          "Asian Handicap": { "Home -0.5": 2.40, "Away +0.5": 1.58 },
        }),
        bk("Betano", 4, {
          "1X2": { Home: 1.95, Draw: 3.45, Away: 3.90 },
          "Over/Under 2.5": { Over: 1.78, Under: 2.02 },
          "Double Chance": { "1X": 1.23, X2: 1.95 },
          "Asian Handicap": { "Home -0.5": 2.45, "Away +0.5": 1.55 },
        }),
        bk("Fortuna", 8, {
          "1X2": { Home: 2.05, Draw: 3.35, Away: 3.70 },
          "Over/Under 2.5": { Over: 1.72, Under: 2.10 },
          "Double Chance": { "1X": 1.27, X2: 1.85 },
          "Asian Handicap": { "Home -0.5": 2.35, "Away +0.5": 1.60 },
        }),
        bk("Netbet", 12, {
          "1X2": { Home: 2.02, Draw: 3.42, Away: 3.75 },
          "Over/Under 2.5": { Over: 1.74, Under: 2.08 },
          "Double Chance": { "1X": 1.26, X2: 1.88 },
          "Asian Handicap": { "Home -0.5": 2.38, "Away +0.5": 1.57 },
        }),
      ],
    },

    // ── 10. Lakers vs Celtics (NBA) ──
    {
      id: "evt-010",
      sport: "Basketball",
      competition: "NBA",
      startsAt: hoursFromNow(10),
      homeTeam: "Los Angeles Lakers",
      awayTeam: "Boston Celtics",
      bookmakers: [
        bk("Superbet", 3, {
          Moneyline: { Lakers: 2.05, Celtics: 1.75 },
          "Over/Under 224.5": { Over: 1.85, Under: 1.95 },
        }),
        bk("Betano", 5, {
          Moneyline: { Lakers: 1.95, Celtics: 1.85 },
          "Over/Under 224.5": { Over: 1.88, Under: 1.92 },
        }),
        bk("Fortuna", 2, {
          Moneyline: { Lakers: 2.00, Celtics: 1.80 },
          "Over/Under 224.5": { Over: 1.82, Under: 1.98 },
        }),
        bk("Getsbet", 7, {
          Moneyline: { Lakers: 1.98, Celtics: 1.82 },
          "Over/Under 224.5": { Over: 1.86, Under: 1.94 },
        }),
      ],
    },

    // ── 11. Real Madrid Baloncesto vs Fenerbahçe (EuroLeague) ──
    {
      id: "evt-011",
      sport: "Basketball",
      competition: "EuroLeague",
      startsAt: hoursFromNow(18),
      homeTeam: "Real Madrid Baloncesto",
      awayTeam: "Fenerbahçe",
      bookmakers: [
        bk("Superbet", 4, {
          Moneyline: { "Real Madrid": 1.55, Fenerbahçe: 2.40 },
          "Over/Under 162.5": { Over: 1.80, Under: 2.00 },
        }),
        bk("Betano", 6, {
          Moneyline: { "Real Madrid": 1.52, Fenerbahçe: 2.50 },
          "Over/Under 162.5": { Over: 1.82, Under: 1.98 },
        }),
        bk("Fortuna", 3, {
          Moneyline: { "Real Madrid": 1.58, Fenerbahçe: 2.35 },
          "Over/Under 162.5": { Over: 1.78, Under: 2.02 },
        }),
        bk("Winbet", 8, {
          Moneyline: { "Real Madrid": 1.50, Fenerbahçe: 2.55 },
          "Over/Under 162.5": { Over: 1.85, Under: 1.95 },
        }),
      ],
    },

    // ── 12. Djokovic vs Alcaraz (ATP Finals) ──
    {
      id: "evt-012",
      sport: "Tennis",
      competition: "ATP Finals",
      startsAt: hoursFromNow(14),
      homeTeam: "Novak Djokovic",
      awayTeam: "Carlos Alcaraz",
      bookmakers: [
        bk("Superbet", 2, {
          Moneyline: { Djokovic: 1.90, Alcaraz: 1.90 },
          "Over/Under 3.5 Sets": { Over: 1.72, Under: 2.08 },
        }),
        bk("Betano", 4, {
          Moneyline: { Djokovic: 2.05, Alcaraz: 1.80 },
          "Over/Under 3.5 Sets": { Over: 1.75, Under: 2.05 },
        }),
        bk("Fortuna", 1, {
          Moneyline: { Djokovic: 1.85, Alcaraz: 1.95 },
          "Over/Under 3.5 Sets": { Over: 1.70, Under: 2.10 },
        }),
        bk("Getsbet", 6, {
          Moneyline: { Djokovic: 1.88, Alcaraz: 2.00 },
          "Over/Under 3.5 Sets": { Over: 1.74, Under: 2.06 },
        }),
        bk("Netbet", 9, {
          Moneyline: { Djokovic: 1.92, Alcaraz: 1.88 },
          "Over/Under 3.5 Sets": { Over: 1.76, Under: 2.04 },
        }),
      ],
    },
  ];

  // ═══════════════════════════════════════════
  // ARBITRAGE OPPORTUNITIES (3-5 real arbs)
  // ═══════════════════════════════════════════
  // Each arb has combined implied probability < 1.0

  const opportunities: ArbOpportunity[] = [
    // ── Arb 1: FCSB vs CFR Cluj — 1X2 ──
    // Superbet Home 2.55 (0.3922) + Betano Draw 3.35 (0.2985) + Fortuna Away 3.45 (0.2899)
    // Total = 0.9806 → edge = 1.98%
    {
      id: "arb-001",
      eventId: "evt-001",
      sport: "Football",
      competition: "Romania Liga 1",
      homeTeam: "FCSB",
      awayTeam: "CFR Cluj",
      marketType: "1X2",
      edge: round2((1 / (1 / 2.55 + 1 / 3.35 + 1 / 3.45) - 1) * 100),
      confidence: "high",
      bookmaker1: "Superbet",
      bookmaker2: "Betano",
      selection1: "Home",
      selection2: "Draw",
      odds1: 2.55,
      odds2: 3.35,
      impliedProb1: round2(1 / 2.55),
      impliedProb2: round2(1 / 3.35),
      startsAt: events[0].startsAt,
    },

    // ── Arb 2: Djokovic vs Alcaraz — Moneyline (2-way) ──
    // Betano Djokovic 2.05 + Getsbet Alcaraz 2.00 → combined implied = 0.9878
    {
      id: "arb-002",
      eventId: "evt-012",
      sport: "Tennis",
      competition: "ATP Finals",
      homeTeam: "Novak Djokovic",
      awayTeam: "Carlos Alcaraz",
      marketType: "Moneyline",
      edge: round2((1 / (1 / 2.05 + 1 / 2.0) - 1) * 100),
      confidence: "medium",
      bookmaker1: "Betano",
      bookmaker2: "Getsbet",
      selection1: "Djokovic",
      selection2: "Alcaraz",
      odds1: 2.05,
      odds2: 2.0,
      impliedProb1: round2(1 / 2.05),
      impliedProb2: round2(1 / 2.0),
      startsAt: events[11].startsAt,
    },

    // Remaining arbs created via post-hoc odds adjustments below
  ];

  // ── Arb 3: Lakers vs Celtics (NBA) — Moneyline ──
  // Superbet Lakers 2.15 + Betano Celtics 2.00 → combined implied = 0.9651 → edge 3.61%
  events[9].bookmakers[0].markets.Moneyline.Lakers = 2.15;
  events[9].bookmakers[1].markets.Moneyline.Celtics = 2.00;

  opportunities.push({
    id: "arb-003",
    eventId: "evt-010",
    sport: "Basketball",
    competition: "NBA",
    homeTeam: "Los Angeles Lakers",
    awayTeam: "Boston Celtics",
    marketType: "Moneyline",
    edge: round2((1 / (1 / 2.15 + 1 / 2.0) - 1) * 100),
    confidence: "high",
    bookmaker1: "Superbet",
    bookmaker2: "Betano",
    selection1: "Lakers",
    selection2: "Celtics",
    odds1: 2.15,
    odds2: 2.0,
    impliedProb1: round2(1 / 2.15),
    impliedProb2: round2(1 / 2.0),
    startsAt: events[9].startsAt,
  });

  // ── Arb 4: Real Madrid Baloncesto vs Fenerbahçe (EuroLeague) — Moneyline ──
  // Superbet Real Madrid 1.80 + Winbet Fenerbahçe 2.30 → combined implied = 0.9904 → edge 0.97%
  events[10].bookmakers[0].markets.Moneyline["Real Madrid"] = 1.80;
  events[10].bookmakers[3].markets.Moneyline.Fenerbahçe = 2.30;

  opportunities.push({
    id: "arb-004",
    eventId: "evt-011",
    sport: "Basketball",
    competition: "EuroLeague",
    homeTeam: "Real Madrid Baloncesto",
    awayTeam: "Fenerbahçe",
    marketType: "Moneyline",
    edge: round2((1 / (1 / 1.80 + 1 / 2.30) - 1) * 100),
    confidence: "low",
    bookmaker1: "Superbet",
    bookmaker2: "Winbet",
    selection1: "Real Madrid",
    selection2: "Fenerbahçe",
    odds1: 1.80,
    odds2: 2.30,
    impliedProb1: round2(1 / 1.80),
    impliedProb2: round2(1 / 2.30),
    startsAt: events[10].startsAt,
  });

  // ── Arb 5: U Craiova vs Rapid (Romania Liga 1) — 1X2 ──
  // Superbet Home 2.50 + Fortuna Draw 3.50 + Betano Away 3.25 → combined implied = 0.9934 → edge 0.66%
  events[1].bookmakers[0].markets["1X2"].Home = 2.50;
  events[1].bookmakers[2].markets["1X2"].Draw = 3.50;
  events[1].bookmakers[1].markets["1X2"].Away = 3.25;

  opportunities.push({
    id: "arb-005",
    eventId: "evt-002",
    sport: "Football",
    competition: "Romania Liga 1",
    homeTeam: "U Craiova",
    awayTeam: "Rapid București",
    marketType: "1X2",
    edge: round2((1 / (1 / 2.50 + 1 / 3.50 + 1 / 3.25) - 1) * 100),
    confidence: "low",
    bookmaker1: "Superbet",
    bookmaker2: "Fortuna",
    selection1: "Home",
    selection2: "Draw",
    odds1: 2.50,
    odds2: 3.50,
    impliedProb1: round2(1 / 2.50),
    impliedProb2: round2(1 / 3.50),
    startsAt: events[1].startsAt,
  });

  // ═══════════════════════════════════════════
  // VALUE BETS (5-8)
  // ═══════════════════════════════════════════

  // Helper: compute market average for a specific selection
  function marketAvg(
    eventIdx: number,
    market: string,
    selection: string
  ): number {
    const ev = events[eventIdx];
    const odds = ev.bookmakers
      .map((b) => b.markets[market]?.[selection])
      .filter((o): o is number => typeof o === "number" && o > 0);
    if (odds.length === 0) return 0;
    return round2(odds.reduce((a, b) => a + b, 0) / odds.length);
  }

  // Adjust odds to create clear value bets (deviation from consensus)
  events[4].bookmakers[2].markets["Over/Under 2.5"].Over = 1.65;

  // Adjust evt-009 Superbet Away odds higher for value bet
  events[8].bookmakers[0].markets["1X2"].Away = 4.05;

  // Adjust evt-007 Fortuna Away odds higher for value bet
  events[6].bookmakers[2].markets["1X2"].Away = 8.20;

  const valueBets: ValueBet[] = [
    // VB1: Netbet offers highest Away odds for Sepsi vs Universitatea
    {
      id: "vb-001",
      eventId: "evt-003",
      sport: "Football",
      competition: "Romania Cupa României",
      homeTeam: "Sepsi",
      awayTeam: "Universitatea",
      marketType: "1X2",
      selection: "Away",
      bookmaker: "Netbet",
      odds: events[2].bookmakers[3].markets["1X2"].Away,
      consensusOdds: marketAvg(2, "1X2", "Away"),
      edge: round2(
        (events[2].bookmakers[3].markets["1X2"].Away /
          marketAvg(2, "1X2", "Away") -
          1) *
          100
      ),
      startsAt: events[2].startsAt,
    },

    // VB2: evt-004 Winbet Over 2.5 = 1.82
    {
      id: "vb-002",
      eventId: "evt-004",
      sport: "Football",
      competition: "Champions League",
      homeTeam: "Real Madrid",
      awayTeam: "Man City",
      marketType: "Over/Under 2.5",
      selection: "Over",
      bookmaker: "Winbet",
      odds: events[3].bookmakers[4].markets["Over/Under 2.5"].Over,
      consensusOdds: marketAvg(3, "Over/Under 2.5", "Over"),
      edge: round2(
        (events[3].bookmakers[4].markets["Over/Under 2.5"].Over /
          marketAvg(3, "Over/Under 2.5", "Over") -
          1) *
          100
      ),
      startsAt: events[3].startsAt,
    },

    // VB3: evt-005 Fortuna Over 2.5 = 1.65
    {
      id: "vb-003",
      eventId: "evt-005",
      sport: "Football",
      competition: "Champions League",
      homeTeam: "Bayern Munich",
      awayTeam: "PSG",
      marketType: "Over/Under 2.5",
      selection: "Over",
      bookmaker: "Fortuna",
      odds: events[4].bookmakers[2].markets["Over/Under 2.5"].Over,
      consensusOdds: marketAvg(4, "Over/Under 2.5", "Over"),
      edge: round2(
        (events[4].bookmakers[2].markets["Over/Under 2.5"].Over /
          marketAvg(4, "Over/Under 2.5", "Over") -
          1) *
          100
      ),
      startsAt: events[4].startsAt,
    },

    // VB4: evt-007 Fortuna Away Brighton 8.20
    {
      id: "vb-004",
      eventId: "evt-007",
      sport: "Football",
      competition: "Premier League",
      homeTeam: "Liverpool",
      awayTeam: "Brighton",
      marketType: "1X2",
      selection: "Away",
      bookmaker: "Fortuna",
      odds: events[6].bookmakers[2].markets["1X2"].Away,
      consensusOdds: marketAvg(6, "1X2", "Away"),
      edge: round2(
        (events[6].bookmakers[2].markets["1X2"].Away /
          marketAvg(6, "1X2", "Away") -
          1) *
          100
      ),
      startsAt: events[6].startsAt,
    },

    // VB5: evt-008 Netbet Draw 3.65
    {
      id: "vb-005",
      eventId: "evt-008",
      sport: "Football",
      competition: "La Liga",
      homeTeam: "Barcelona",
      awayTeam: "Atletico Madrid",
      marketType: "1X2",
      selection: "Draw",
      bookmaker: "Netbet",
      odds: events[7].bookmakers[4].markets["1X2"].Draw,
      consensusOdds: marketAvg(7, "1X2", "Draw"),
      edge: round2(
        (events[7].bookmakers[4].markets["1X2"].Draw /
          marketAvg(7, "1X2", "Draw") -
          1) *
          100
      ),
      startsAt: events[7].startsAt,
    },

    // VB6: evt-009 Superbet Away Napoli 4.05
    {
      id: "vb-006",
      eventId: "evt-009",
      sport: "Football",
      competition: "Serie A",
      homeTeam: "Inter Milan",
      awayTeam: "Napoli",
      marketType: "1X2",
      selection: "Away",
      bookmaker: "Superbet",
      odds: events[8].bookmakers[0].markets["1X2"].Away,
      consensusOdds: marketAvg(8, "1X2", "Away"),
      edge: round2(
        (events[8].bookmakers[0].markets["1X2"].Away /
          marketAvg(8, "1X2", "Away") -
          1) *
          100
      ),
      startsAt: events[8].startsAt,
    },

    // VB7: evt-012 Getsbet Alcaraz 2.00
    {
      id: "vb-007",
      eventId: "evt-012",
      sport: "Tennis",
      competition: "ATP Finals",
      homeTeam: "Novak Djokovic",
      awayTeam: "Carlos Alcaraz",
      marketType: "Moneyline",
      selection: "Alcaraz",
      bookmaker: "Getsbet",
      odds: events[11].bookmakers[3].markets.Moneyline.Alcaraz,
      consensusOdds: marketAvg(11, "Moneyline", "Alcaraz"),
      edge: round2(
        (events[11].bookmakers[3].markets.Moneyline.Alcaraz /
          marketAvg(11, "Moneyline", "Alcaraz") -
          1) *
          100
      ),
      startsAt: events[11].startsAt,
    },

    // VB8: evt-010 Betano Celtics 2.00 vs avg ~1.84
    {
      id: "vb-008",
      eventId: "evt-010",
      sport: "Basketball",
      competition: "NBA",
      homeTeam: "Los Angeles Lakers",
      awayTeam: "Boston Celtics",
      marketType: "Moneyline",
      selection: "Celtics",
      bookmaker: "Betano",
      odds: events[9].bookmakers[1].markets.Moneyline.Celtics,
      consensusOdds: marketAvg(9, "Moneyline", "Celtics"),
      edge: round2(
        (events[9].bookmakers[1].markets.Moneyline.Celtics /
          marketAvg(9, "Moneyline", "Celtics") -
          1) *
          100
      ),
      startsAt: events[9].startsAt,
    },
  ];

  // Sort value bets by edge descending
  valueBets.sort((a, b) => b.edge - a.edge);

  // Sort opportunities by edge descending
  opportunities.sort((a, b) => b.edge - a.edge);

  return NextResponse.json({
    mode: "demo",
    fetchedAt,
    previousFetchedAt,
    events,
    opportunities,
    valueBets,
  });
}