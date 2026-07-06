-- Arb Desk D1 Schema (SQLite-compatible)
-- Matches prisma/schema.prisma models

CREATE TABLE IF NOT EXISTS User (
  id                   TEXT PRIMARY KEY,
  email                TEXT NOT NULL UNIQUE,
  passwordHash         TEXT,
  name                 TEXT,
  role                 TEXT NOT NULL DEFAULT 'user',
  subscriptionTier     TEXT NOT NULL DEFAULT 'free',
  subscriptionExpiresAt TEXT,
  isActive             INTEGER NOT NULL DEFAULT 1,
  lastLoginAt          TEXT,
  createdAt            TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS Session (
  id        TEXT PRIMARY KEY,
  userId    TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
  token     TEXT NOT NULL UNIQUE,
  expiresAt TEXT NOT NULL,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ActivityLog (
  id        TEXT PRIMARY KEY,
  userId    TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE,
  action    TEXT NOT NULL,
  details   TEXT,
  ipAddress TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ArbAlert (
  id          TEXT PRIMARY KEY,
  eventId     TEXT NOT NULL,
  homeTeam    TEXT NOT NULL,
  awayTeam    TEXT NOT NULL,
  competition TEXT NOT NULL,
  sport       TEXT NOT NULL,
  edge        REAL NOT NULL,
  bookmaker1  TEXT NOT NULL,
  bookmaker2  TEXT NOT NULL,
  marketType  TEXT NOT NULL,
  seen        INTEGER NOT NULL DEFAULT 0,
  createdAt   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS BetJournal (
  id          TEXT PRIMARY KEY,
  userId      TEXT,
  eventId     TEXT,
  homeTeam    TEXT NOT NULL,
  awayTeam    TEXT NOT NULL,
  competition TEXT,
  sport       TEXT,
  bookmaker   TEXT NOT NULL,
  market      TEXT NOT NULL,
  selection   TEXT NOT NULL,
  odds        REAL NOT NULL,
  stake       REAL NOT NULL,
  result      TEXT,
  payout      REAL,
  createdAt   TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ScrapingLog (
  id          TEXT PRIMARY KEY,
  provider    TEXT NOT NULL,
  status      TEXT NOT NULL,
  eventsFound INTEGER NOT NULL DEFAULT 0,
  errorMsg    TEXT,
  durationMs  INTEGER,
  createdAt   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_session_token ON Session(token);
CREATE INDEX IF NOT EXISTS idx_session_userId ON Session(userId);
CREATE INDEX IF NOT EXISTS idx_activity_userId ON ActivityLog(userId);
CREATE INDEX IF NOT EXISTS idx_activity_createdAt ON ActivityLog(createdAt);
CREATE INDEX IF NOT EXISTS idx_scrapinglog_createdAt ON ScrapingLog(createdAt);
CREATE INDEX IF NOT EXISTS idx_user_email ON User(email);
CREATE INDEX IF NOT EXISTS idx_user_createdAt ON User(createdAt);