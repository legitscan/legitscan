-- 2026-11-16: Pons curve pool address, so the curve is read on chain instead of from GeckoTerminal (schema.sql has it).
--   npx wrangler d1 execute legitscan --remote --file=migrations/0003-pool.sql
ALTER TABLE coins ADD COLUMN pool TEXT;
