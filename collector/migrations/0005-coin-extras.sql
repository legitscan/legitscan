-- 2026-11-17: the website's registered domain and when it was registered (RDAP), shown as a risk warning when young;
-- when a non-Pons coin's launch wallet was looked for (first mint sender, chain-reads.ts findCreator); and what the
-- dev typed into the Pons launch form (chain-reads.ts parseLaunchInput).
--   npx wrangler d1 execute legitscan --remote --file=migrations/0005-coin-extras.sql
ALTER TABLE coins ADD COLUMN domain TEXT;
ALTER TABLE coins ADD COLUMN domain_created_ms INTEGER;
ALTER TABLE coins ADD COLUMN domain_at_ms INTEGER;
ALTER TABLE coins ADD COLUMN creator_at_ms INTEGER;
ALTER TABLE coins ADD COLUMN launch_tx TEXT;
ALTER TABLE coins ADD COLUMN launch_desc TEXT;
ALTER TABLE coins ADD COLUMN launch_website TEXT;
ALTER TABLE coins ADD COLUMN launch_x TEXT;
ALTER TABLE coins ADD COLUMN launch_telegram TEXT;
ALTER TABLE coins ADD COLUMN launch_github TEXT;
ALTER TABLE coins ADD COLUMN launch_info_at_ms INTEGER;
