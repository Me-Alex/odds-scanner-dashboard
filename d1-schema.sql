-- Arb Desk D1 Schema v2 — Full Production
-- Matches updated Prisma schema

-- Drop old tables that conflict
-- (Only run these if migrating from v1)
-- DROP TABLE IF EXISTS ArbAlert;
-- DROP TABLE IF EXISTS BetJournal;
-- DROP TABLE IF EXISTS ScrapingLog;

CREATE TABLE IF NOT EXISTS User (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  passwordHash TEXT,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  subscriptionTier TEXT NOT NULL DEFAULT 'free',
  subscriptionExpiresAt TEXT,
  isActive INTEGER NOT NULL DEFAULT 1,
  lastLoginAt TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS Session (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expiresAt TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ActivityLog (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  details TEXT,
  ipAddress TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Scraped Data ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ScrapedEvent (
  id TEXT PRIMARY KEY,
  externalId TEXT NOT NULL,
  provider TEXT NOT NULL,
  sport TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  tournament TEXT NOT NULL DEFAULT '',
  homeTeam TEXT NOT NULL,
  awayTeam TEXT NOT NULL,
  matchTime TEXT NOT NULL,
  bettingStatus INTEGER NOT NULL DEFAULT 1,
  isLive INTEGER NOT NULL DEFAULT 0,
  oddsSnapshot TEXT NOT NULL DEFAULT '{}',
  oddsCount INTEGER NOT NULL DEFAULT 0,
  fetchedAt TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(externalId, provider)
);

CREATE TABLE IF NOT EXISTS ArbOpportunity (
  id TEXT PRIMARY KEY,
  eventId TEXT,
  sport TEXT NOT NULL,
  competition TEXT NOT NULL DEFAULT '',
  homeTeam TEXT NOT NULL,
  awayTeam TEXT NOT NULL,
  marketType TEXT NOT NULL DEFAULT '1X2',
  selection1 TEXT NOT NULL,
  selection2 TEXT NOT NULL,
  bookmaker1 TEXT NOT NULL,
  bookmaker2 TEXT NOT NULL,
  odds1 REAL NOT NULL,
  odds2 REAL NOT NULL,
  edge REAL NOT NULL,
  impliedProb1 REAL NOT NULL,
  impliedProb2 REAL NOT NULL,
  seen INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS OddsMovement (
  id TEXT PRIMARY KEY,
  eventId TEXT NOT NULL,
  provider TEXT NOT NULL,
  sport TEXT NOT NULL,
  homeTeam TEXT NOT NULL,
  awayTeam TEXT NOT NULL,
  marketType TEXT NOT NULL,
  selection TEXT NOT NULL,
  oldOdds REAL NOT NULL,
  newOdds REAL NOT NULL,
  change REAL NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── User Bets ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS Bet (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
  externalEventId TEXT,
  provider TEXT,
  sport TEXT,
  competition TEXT,
  homeTeam TEXT NOT NULL,
  awayTeam TEXT NOT NULL,
  market TEXT NOT NULL,
  selection TEXT NOT NULL,
  odds REAL NOT NULL,
  stake REAL NOT NULL,
  result TEXT NOT NULL DEFAULT 'pending',
  payout REAL,
  settledAt TEXT,
  notes TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── AI Picks ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS AiPickLog (
  id TEXT PRIMARY KEY,
  userId TEXT REFERENCES User(id) ON DELETE CASCADE,
  sport TEXT NOT NULL,
  competition TEXT,
  homeTeam TEXT NOT NULL,
  awayTeam TEXT NOT NULL,
  market TEXT NOT NULL,
  selection TEXT NOT NULL,
  odds REAL NOT NULL,
  confidence REAL,
  reasoning TEXT,
  sourceEventId TEXT,
  result TEXT,
  settledAt TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── System / Legacy ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ArbAlert (
  id TEXT PRIMARY KEY,
  eventId TEXT NOT NULL,
  homeTeam TEXT NOT NULL,
  awayTeam TEXT NOT NULL,
  competition TEXT NOT NULL,
  sport TEXT NOT NULL,
  edge REAL NOT NULL,
  bookmaker1 TEXT NOT NULL,
  bookmaker2 TEXT NOT NULL,
  marketType TEXT NOT NULL,
  seen INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ScrapingLog (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  eventsFound INTEGER NOT NULL DEFAULT 0,
  errorMsg TEXT,
  durationMs INTEGER,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS Bookmaker (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  isActive INTEGER NOT NULL DEFAULT 1,
  lastScrapeAt TEXT,
  lastError TEXT,
  eventsCount INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Indexes ───────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_session_token ON Session(token);
CREATE INDEX IF NOT EXISTS idx_session_userId ON Session(userId);
CREATE INDEX IF NOT EXISTS idx_activity_userId ON ActivityLog(userId);
CREATE INDEX IF NOT EXISTS idx_activity_createdAt ON ActivityLog(createdAt);
CREATE INDEX IF NOT EXISTS idx_scrapedEvent_provider_sport ON ScrapedEvent(provider, sport);
CREATE INDEX IF NOT EXISTS idx_scrapedEvent_matchTime ON ScrapedEvent(matchTime);
CREATE INDEX IF NOT EXISTS idx_arbOpportunity_sport_edge ON ArbOpportunity(sport, edge);
CREATE INDEX IF NOT EXISTS idx_arbOpportunity_createdAt ON ArbOpportunity(createdAt);
CREATE INDEX IF NOT EXISTS idx_oddsMovement_provider_eventId ON OddsMovement(provider, eventId);
CREATE INDEX IF NOT EXISTS idx_oddsMovement_createdAt ON OddsMovement(createdAt);
CREATE INDEX IF NOT EXISTS idx_bet_userId_result ON Bet(userId, result);
CREATE INDEX IF NOT EXISTS idx_bet_userId_createdAt ON Bet(userId, createdAt);
CREATE INDEX IF NOT EXISTS idx_bet_sport ON Bet(sport);
CREATE INDEX IF NOT EXISTS idx_aiPickLog_userId_result ON AiPickLog(userId, result);
CREATE INDEX IF NOT EXISTS idx_aiPickLog_sport ON AiPickLog(sport);
CREATE INDEX IF NOT EXISTS idx_aiPickLog_createdAt ON AiPickLog(createdAt);
CREATE INDEX IF NOT EXISTS idx_scrapingLog_createdAt ON ScrapingLog(createdAt);
CREATE INDEX IF NOT EXISTS idx_user_email ON User(email);
CREATE INDEX IF NOT EXISTS idx_arbAlert_createdAt ON ArbAlert(createdAt);

-- ─── Seed Bookmakers ──────────────────────────────────────────────────

INSERT OR IGNORE INTO Bookmaker (id, name, slug, isActive) VALUES
('bk-winner', 'Winner', 'winner', 1),
('bk-mrplay', 'MrPlay', 'mrplay', 1),
('bk-888', '888', '888', 1),
('bk-fortuna', 'Fortuna', 'fortuna', 0),
('bk-casapariurilor', 'Casa Pariurilor', 'casapariurilor', 0),
('bk-superbet', 'Superbet', 'superbet', 0),
('bk-betone', 'BetOne', 'betone', 0),
('bk-betmen', 'Betmen', 'betmen', 0),
('bk-getsbet', 'GetsBet', 'getsbet', 0),
('bk-bet7', 'Bet7', 'bet7', 0),
('bk-eliteslots', 'EliteSlots', 'eliteslots', 0),
('bk-stanleybet', 'Stanleybet', 'stanleybet', 0),
('bk-gameworld', 'GameWorld', 'gameworld', 0),
('bk-admiralbet', 'AdmiralBet', 'admiralbet', 0),
('bk-seven', 'Seven', 'seven', 0),
('bk-lasvegas', 'LasVegas', 'lasvegas', 0),
('bk-maxbet', 'MaxBet', 'maxbet', 0),
('bk-netbet', 'NetBet', 'netbet', 0),
('bk-winbet', 'Winbet', 'winbet', 0),
('bk-vivabet', 'VivaBet', 'vivabet', 0),
('bk-unibet', 'Unibet', 'unibet', 0),
('bk-betano', 'Betano', 'betano', 0);