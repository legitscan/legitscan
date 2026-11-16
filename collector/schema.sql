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
  creator         TEXT,                    -- Pons launch event creator (topic3)

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
  dev             TEXT,                    -- creator for Pons, else gt_dev
  dev_in          TEXT,                    -- everything the dev received (mint, buys)
  dev_out_burn    TEXT,                    -- sent to 0x...dEaD or 0x0
  dev_out_contract TEXT,                   -- sent to a contract: pools, routers (mostly sells or adding liquidity)
  dev_out_wallet  TEXT,                    -- sent to another wallet
  dev_holds       TEXT,                    -- balanceOf(dev) now
  flows_to_block  INTEGER,
  flows_at_ms     INTEGER,

  -- Pons bonding curve (GeckoTerminal tokens/multi), for the New / Almost bonded / Migrated boards.
  -- bonded: 0 still on the curve, 1 migrated to its DEX pool, NULL not a curve coin or not read yet.
  launched_ms     INTEGER,                 -- time of the launch block
  bond_pct        REAL,
  bonded          INTEGER,
  bonded_ms       INTEGER,
  bond_at_ms      INTEGER,

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
