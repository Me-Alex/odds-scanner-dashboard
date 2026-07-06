-- Arb Desk D1 Seed Data
-- Users (PBKDF2-SHA256 hashed passwords)
-- admin@arbdesk.com / Admin123!
-- me.alex.21.3@gmail.com / Admin123!
-- test@example.com / Test123!
INSERT OR IGNORE INTO User (id, email, passwordHash, name, role, subscriptionTier, isActive, createdAt, updatedAt) VALUES
('seed-admin-001', 'admin@arbdesk.com', '255s:61wOoIYRnpKqv8NgWdQjyw==:YOsHlHqjZA/kUtNlaeiXsCTr/Ab9imi+Cf8U1kuHBdI=', 'Arb Desk Admin', 'admin', 'enterprise', 1, datetime('now'), datetime('now')),
('seed-admin-002', 'me.alex.21.3@gmail.com', '255s:0NxIEe3oP0shRs49gBMJNQ==:M1CRBJDs5un4mteT18bKY7BrjM/KIPnP/RKH0Yl9GeI=', 'Alex', 'admin', 'enterprise', 1, datetime('now'), datetime('now')),
('seed-user-003', 'test@example.com', '255s:W+NThpI+W8fE8aXtNvalSQ==:qiUuwEtXVgQ2FoU6viQT1lZdPTQxyMQP54I3cpRx6RA=', 'Test User', 'user', 'free', 1, datetime('now'), datetime('now'));

-- Scraping Logs
INSERT OR IGNORE INTO ScrapingLog (id, provider, status, eventsFound, durationMs, createdAt) VALUES
('scrape-001', 'winner', 'success', 142, 2340, datetime('now', '-2 hours')),
('scrape-002', 'superbet', 'success', 128, 1890, datetime('now', '-2 hours')),
('scrape-003', 'fortuna', 'success', 98, 3100, datetime('now', '-2 hours')),
('scrape-004', 'digitain', 'success', 145, 2100, datetime('now', '-4 hours')),
('scrape-005', 'nsoft', 'error', 0, 5200, datetime('now', '-4 hours')),
('scrape-006', 'egt', 'partial', 67, 4100, datetime('now', '-6 hours'));