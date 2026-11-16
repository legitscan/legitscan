-- 2026-11-16: Pons bonding curve columns for databases created before them (schema.sql has them for new ones).
--   npx wrangler d1 execute legitscan --remote --file=migrations/0002-curve.sql
ALTER TABLE coins ADD COLUMN launched_ms INTEGER;
ALTER TABLE coins ADD COLUMN bond_pct REAL;
ALTER TABLE coins ADD COLUMN bonded INTEGER;
ALTER TABLE coins ADD COLUMN bonded_ms INTEGER;
ALTER TABLE coins ADD COLUMN bond_at_ms INTEGER;
CREATE INDEX IF NOT EXISTS idx_coins_launch ON coins (launch_block);
CREATE INDEX IF NOT EXISTS idx_coins_curve ON coins (bond_pct) WHERE bonded = 0;
CREATE INDEX IF NOT EXISTS idx_coins_bonded ON coins (bonded_ms) WHERE bonded = 1;
