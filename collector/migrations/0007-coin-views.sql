-- Coin pages opened by visitors, for the "token checks" count on /stats. Every open counts, repeats included; one row
-- per day and visitor holds that visitor's count, capped so one visitor cannot burn the D1 write budget.
-- ip_hash = SHA-256 of "view|IP|day", no raw IP.
CREATE TABLE IF NOT EXISTS coin_views (
  day      TEXT NOT NULL,
  ip_hash  TEXT NOT NULL,
  n        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, ip_hash)
) WITHOUT ROWID;
