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
