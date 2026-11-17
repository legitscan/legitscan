-- 2026-11-17: the website and X account on a coin's CoinGecko page (coingecko.ts refreshCoingeckoLinks). Like the Pons
-- launch form it says where to look, for coins with no launch form and no paid DexScreener info (MOWCAT).
--   npx wrangler d1 execute legitscan --remote --file=migrations/0006-coingecko-links.sql
ALTER TABLE coins ADD COLUMN cg_website TEXT;
ALTER TABLE coins ADD COLUMN cg_x TEXT;
ALTER TABLE coins ADD COLUMN cg_links_at_ms INTEGER;
