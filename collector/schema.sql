-- LegitScan collector storage. Same SQL on Cloudflare D1 and on local SQLite (run-local.ts, tests).
-- Create on D1 (only after the owner says yes):  npx wrangler d1 execute legitscan --remote --file=schema.sql
--
-- Times are epoch ms (UTC), addresses lowercase 0x hex, token amounts are base units as decimal TEXT (too big for
-- INTEGER). Booleans are 1 / 0 and NULL means "could not tell", never "no".

-- One row per token we know about. Found on the Pons launcher's event (every Pons token) or in GeckoTerminal's pool
-- lists (other launchers). The MC >= $5k floor is applied when reading, so a coin that grows later is already here.
CREATE TABLE IF NOT EXISTS coins (
  ca              TEXT PRIMARY KEY CHECK (length(ca) = 42 AND substr(ca, 1, 2) = '0x' AND substr(ca, 3) NOT GLOB '*[^0-9a-f]*'),
  chain           TEXT NOT NULL DEFAULT 'robinhood',
  found_via       TEXT NOT NULL CHECK (found_via IN ('pons', 'geckoterminal')),
  found_ms        INTEGER NOT NULL,
  launch_block    INTEGER,                 -- Pons launch event block; NULL for other launchers
  creator         TEXT,                    -- launch wallet: Pons launch event topic3, else the sender of the first mint
  creator_at_ms   INTEGER,                 -- when the first mint was last looked for (non-Pons coins)
  -- What the dev typed into the Pons launch form (self-declared, like a listing: it says where to look).
  launch_tx       TEXT,
  launch_desc     TEXT,
  launch_website  TEXT,
  launch_x        TEXT,
  launch_telegram TEXT,
  launch_github   TEXT,
  launch_info_at_ms INTEGER,
  -- The website and X account on the coin's CoinGecko page (coingecko.ts), read about monthly for listed coins.
  cg_website      TEXT,
  cg_x            TEXT,
  cg_links_at_ms  INTEGER,

  -- Market, from DexScreener /tokens/v1 (30 tokens per call). market_at_ms set even when DexScreener had no pair.
  symbol          TEXT,
  name            TEXT,
  icon_url        TEXT,
  websites        TEXT,                    -- JSON array of URLs
  x_handle        TEXT,
  telegram        TEXT,
  dex             TEXT,                    -- dexId of the deepest pair, e.g. 'uniswap', 'pons'
  pair            TEXT,                    -- deepest pair address or v4 pool id
  pair_created_ms INTEGER,
  mc_usd          REAL,
  liq_usd         REAL,                    -- summed over all the token's pairs (value per token, PLAN 3.3)
  vol_h24_usd     REAL,
  market_at_ms    INTEGER,

  -- GeckoTerminal /tokens/{ca}/info (about 25 calls a minute, so only for coins at or above the MC floor).
  holders         INTEGER,
  top10_pct       REAL,
  gt_dev          TEXT,                    -- developer_address as GeckoTerminal reports it
  gt_verified     INTEGER,
  honeypot        INTEGER,
  info_at_ms      INTEGER,

  -- Contract, from the RPC (contract-facts.ts, copied from Reinkeep).
  is_proxy        INTEGER,
  has_mint        INTEGER,
  has_pause       INTEGER,
  has_blacklist   INTEGER,
  has_upgrade     INTEGER,
  owner           TEXT,
  owner_renounced INTEGER,
  total_supply    TEXT,
  decimals        INTEGER,
  burned          TEXT,                    -- balanceOf(0x...dEaD) + balanceOf(0x0)
  facts_at_ms     INTEGER,

  -- Dev wallet and what it did with the token, from Transfer logs. Read in steps: flows_to_block is the last block
  -- already counted, so a refresh only reads the new blocks.
  dev             TEXT,                    -- creator, else gt_dev
  dev_in          TEXT,                    -- everything the dev received (mint, buys)
  dev_out_burn    TEXT,                    -- sent to 0x...dEaD or 0x0
  dev_out_contract TEXT,                   -- sent to a contract: pools, routers (mostly sells or adding liquidity)
  dev_out_wallet  TEXT,                    -- sent to another wallet
  dev_holds       TEXT,                    -- balanceOf(dev) now
  flows_to_block  INTEGER,
  flows_at_ms     INTEGER,

  -- Pons bonding curve, read from the curve pool on chain (chain-reads.ts curveFromPool), for the New / Almost bonded /
  -- Migrated boards. bonded: 0 still on the curve, 1 migrated to its DEX pool, NULL not a curve coin or not read yet.
  pool            TEXT,                    -- Pons curve pool (launch event topic2)
  launched_ms     INTEGER,                 -- time of the launch block
  bond_pct        REAL,
  bonded          INTEGER,
  bonded_ms       INTEGER,
  bond_at_ms      INTEGER,

  -- The listed website's registered domain and its registration time (RDAP), read by the legit checks.
  -- domain_at_ms: when we last asked; NULL created = the registry does not say.
  domain          TEXT,
  domain_created_ms INTEGER,
  domain_at_ms    INTEGER,

  last_error      TEXT
);
CREATE INDEX IF NOT EXISTS idx_coins_launch ON coins (launch_block);
CREATE INDEX IF NOT EXISTS idx_coins_curve ON coins (bond_pct) WHERE bonded = 0;
CREATE INDEX IF NOT EXISTS idx_coins_bonded ON coins (bonded_ms) WHERE bonded = 1;
CREATE INDEX IF NOT EXISTS idx_coins_mc ON coins (mc_usd);
-- Only never-priced coins are in this index (new launches, coins flagged by the busiest-pools list), newest first.
-- Partial, so pricing a coin removes one entry instead of rewriting an index of 486k rows.
CREATE INDEX IF NOT EXISTS idx_coins_unpriced ON coins (launch_block) WHERE market_at_ms IS NULL;
CREATE INDEX IF NOT EXISTS idx_coins_dev ON coins (dev);
CREATE INDEX IF NOT EXISTS idx_coins_symbol ON coins (symbol);

-- How far the chain has been read, per reader. Only moves forward.
CREATE TABLE IF NOT EXISTS cursor (
  name  TEXT PRIMARY KEY,
  block INTEGER NOT NULL CHECK (block >= 0)
);

CREATE TABLE IF NOT EXISTS runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  started_ms  INTEGER NOT NULL,
  finished_ms INTEGER,
  stats       TEXT
);

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
-- Token checks for /stats: a visitor pasted a CA and pressed Check (home page, coins page search) or pressed Scan now
-- on a coin page. Opening a coin page from a list or a link is not a check. Repeats count; one row per day and visitor
-- holds that visitor's count, capped so one visitor cannot burn the D1 write budget.
-- ip_hash = SHA-256 of "check|IP|day", no raw IP.
CREATE TABLE IF NOT EXISTS token_checks (
  day      TEXT NOT NULL,
  ip_hash  TEXT NOT NULL,
  n        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, ip_hash)
) WITHOUT ROWID;
