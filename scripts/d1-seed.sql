-- Arb Desk D1 Seed Data
-- Password hashes generated with bcryptjs (cost 12)

-- Admin users
INSERT INTO User (id, email, passwordHash, name, role, subscriptionTier, isActive, createdAt, updatedAt)
VALUES (
  'admin_001',
  'admin@arbdesk.com',
  '$2b$12$ldQKplaJnqar5V5LEr3QFenMYg.oZ0IUo2gRaScXUwhLGKSiYdPx.',
  'Admin',
  'admin',
  'enterprise',
  1,
  datetime('now'),
  datetime('now')
);

INSERT INTO User (id, email, passwordHash, name, role, subscriptionTier, isActive, createdAt, updatedAt)
VALUES (
  'admin_002',
  'me.alex.21.3@gmail.com',
  '$2b$12$DWb4dd1W0NsGLQQFwTaLGexBh0GSjKqfD5n3kvYDxvBVX6ohtGZ2O',
  'Alex',
  'admin',
  'enterprise',
  1,
  datetime('now'),
  datetime('now')
);

-- Test user
INSERT INTO User (id, email, passwordHash, name, role, subscriptionTier, isActive, createdAt, updatedAt)
VALUES (
  'user_001',
  'test@example.com',
  '$2b$12$3ctbHsT3fxTNeZRtZzeQOuSanUZ3mX.3sVUJ7YJuTRxyBqab2dday',
  'Test User',
  'user',
  'free',
  1,
  datetime('now'),
  datetime('now')
);

-- Scraping logs
INSERT INTO ScrapingLog (id, provider, status, eventsFound, durationMs, createdAt)
VALUES ('scrape_001', 'Bet365', 'success', 142, 2340, datetime('now', '-55 minutes'));

INSERT INTO ScrapingLog (id, provider, status, eventsFound, durationMs, createdAt)
VALUES ('scrape_002', 'Pinnacle', 'success', 98, 1890, datetime('now', '-50 minutes'));

INSERT INTO ScrapingLog (id, provider, status, eventsFound, durationMs, createdAt)
VALUES ('scrape_003', 'William Hill', 'partial', 67, 3200, datetime('now', '-45 minutes'));

INSERT INTO ScrapingLog (id, provider, status, eventsFound, errorMsg, durationMs, createdAt)
VALUES ('scrape_004', 'Betfair', 'error', 0, 'Rate limit exceeded - retry in 60s', 15200, datetime('now', '-40 minutes'));

INSERT INTO ScrapingLog (id, provider, status, eventsFound, durationMs, createdAt)
VALUES ('scrape_005', 'Bet365', 'success', 155, 2100, datetime('now', '-35 minutes'));

INSERT INTO ScrapingLog (id, provider, status, eventsFound, durationMs, createdAt)
VALUES ('scrape_006', 'Pinnacle', 'success', 103, 1750, datetime('now', '-30 minutes'));