-- 2026-11-17: legit checks (website, X, GitHub, dev sign), their history, the check queue, /claim tweets and dev
-- signatures (schema.sql has it).
--   npx wrangler d1 execute legitscan --remote --file=migrations/0004-checks.sql

-- Legit checks (legit-checks.ts, dev-sign.ts): one row per coin and check, the latest answer. status: pass / fail / none (nothing to
-- check yet) / error (could not read). passed_ms: when the current passing streak began (NULL when not passing).
CREATE TABLE IF NOT EXISTS checks (
  ca          TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('website', 'x', 'xmatch', 'github', 'githubca', 'dev', 'coingecko')),
  status      TEXT NOT NULL CHECK (status IN ('pass', 'fail', 'none', 'error')),
  reason      TEXT NOT NULL,
  source_url  TEXT,                       -- the page, tweet or repo that proves it
  at_ms       INTEGER,                    -- github: last push
  checked_ms  INTEGER NOT NULL,
  passed_ms   INTEGER,
  PRIMARY KEY (ca, kind)
);
CREATE INDEX IF NOT EXISTS idx_checks_pass ON checks (kind, passed_ms) WHERE status = 'pass';

-- A coin's check history: one row each time a check's status changes (first answer included).
CREATE TABLE IF NOT EXISTS check_events (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  ca      TEXT NOT NULL,
  kind    TEXT NOT NULL,
  status  TEXT NOT NULL,
  reason  TEXT NOT NULL,
  at_ms   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_check_events_ca ON check_events (ca, at_ms);

-- When the checks last ran for a coin, and when a claim asks for a fresh look sooner.
CREATE TABLE IF NOT EXISTS check_queue (
  ca          TEXT PRIMARY KEY,
  checked_ms  INTEGER,
  wanted_ms   INTEGER                     -- set by /claim; the collector checks these first
);

-- Tweets sent in on /claim. The tweet is read through oEmbed when it arrives; the checks decide, not the sender.
-- ip_hash: SHA-256 of the sender's IP and a daily salt, only to limit claims per sender. No raw IP is kept.
CREATE TABLE IF NOT EXISTS claims (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ca          TEXT NOT NULL,
  tweet_url   TEXT NOT NULL,
  author      TEXT NOT NULL,
  ip_hash     TEXT NOT NULL,
  created_ms  INTEGER NOT NULL,
  UNIQUE (ca, tweet_url)
);
CREATE INDEX IF NOT EXISTS idx_claims_ip ON claims (ip_hash, created_ms);

-- Dev sign (dev-sign.ts): the launch wallet's signature, kept so anyone can check it again with any wallet tool.
CREATE TABLE IF NOT EXISTS dev_signatures (
  ca         TEXT PRIMARY KEY,
  wallet     TEXT NOT NULL,
  message    TEXT NOT NULL,
  signature  TEXT NOT NULL,
  signed_ms  INTEGER NOT NULL
);

-- When a whole-list source was last read (coingecko: the hourly CoinGecko list).
CREATE TABLE IF NOT EXISTS source_times (
  name   TEXT PRIMARY KEY,
  at_ms  INTEGER NOT NULL
);

-- Instant scans from the coin page (scan.ts): only to limit scans per sender. ip_hash = SHA-256 of IP + day, no raw IP.
CREATE TABLE IF NOT EXISTS scans (
  ip_hash  TEXT NOT NULL,
  at_ms    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scans_ip ON scans (ip_hash, at_ms);
