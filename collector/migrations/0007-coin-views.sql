-- Coin pages opened by visitors, for the "checked by visitors" count on /stats. One row per day, visitor and coin, so
-- a reload or a bot hammering one page counts once. ip_hash = SHA-256 of "view|IP|day", no raw IP.
CREATE TABLE IF NOT EXISTS coin_views (
  day      TEXT NOT NULL,
  ip_hash  TEXT NOT NULL,
  ca       TEXT NOT NULL,
  PRIMARY KEY (day, ip_hash, ca)
) WITHOUT ROWID;
