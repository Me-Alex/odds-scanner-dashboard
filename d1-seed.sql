-- Arb Desk D1 Seed Data
-- Users
INSERT OR IGNORE INTO User (id, email, passwordHash, name, role, subscriptionTier, isActive, createdAt, updatedAt) VALUES
('seed-admin-001', 'admin@arbdesk.com', '$2b$12$PK.XxVbO.wyBh6u/Dbd2reI8O9kqGzMTXz5BdtG8nGHy/fr5OMTde', 'Arb Desk Admin', 'admin', 'enterprise', 1, datetime('now'), datetime('now')),
('seed-admin-002', 'me.alex.21.3@gmail.com', '$2b$12$WCwcP0gXflEDGQ3fWpu5MujxorBs4qPysPCTZMRmDtXfEp.Dww/EO', 'Alex', 'admin', 'enterprise', 1, datetime('now'), datetime('now')),
('seed-user-003', 'test@example.com', '$2b$12$UE.ZJZp9m3GEK6BVPTjU..ddUIyHVbzFH9TvfkgMcc/P22p2n2ATS', 'Test User', 'user', 'free', 1, datetime('now'), datetime('now'));

-- Scraping Logs
INSERT OR IGNORE INTO ScrapingLog (id, provider, status, eventsFound, durationMs, createdAt) VALUES
('scrape-001', 'Bet365', 'success', 142, 2340, datetime('now', '-2 hours')),
('scrape-002', 'Pinnacle', 'success', 128, 1890, datetime('now', '-2 hours')),
('scrape-003', 'William Hill', 'success', 98, 3100, datetime('now', '-2 hours')),
('scrape-004', 'Bet365', 'success', 145, 2100, datetime('now', '-4 hours')),
('scrape-005', 'Pinnacle', 'error', 0, 5200, datetime('now', '-4 hours')),
('scrape-006', '1xBet', 'partial', 67, 4100, datetime('now', '-6 hours'));