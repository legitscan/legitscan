// Runs the legit checks for one coin and stores them: the latest answer per check, a history row when an answer
// changes, and the time in check_queue. Shared by the collector (GitHub Actions) and the /api/claim Pages function.
import type { D1Like } from "./d1-types.ts";
import type { Fetcher } from "./http-json.ts";
import { checkCoin, freeHost, readDomainCreated, registrableDomain, type CheckResult } from "./legit-checks.ts";

// Owner 17 Nov: a CA on a project's site rarely goes away, so coins whose website check passed are looked at once a day
// (enough to catch a relaunch that moves the site to a new CA). Coins not passing yet are looked at every hour, so a CA
// or site that appears shows up fast. Claims are checked at once either way.
export const RECHECK_MS = 3600_000;
export const PASSED_RECHECK_MS = 24 * 3600_000;
// New coins (GMGN-style) get one look in their first 3 days whatever their MC, from the launch form's website.
export const NEW_COIN_MS = 3 * 24 * 3600_000;

// Writes only what changed: an unchanged answer costs no row write (D1 free plan: 100k rows written a day). The time
// of the last look lives in check_queue, one row per coin, and the API reads it from there.
// touchQueue false: an answer that is not a full look at the coin (a dev signature) leaves the check schedule alone.
export async function saveChecks(db: D1Like, ca: string, results: CheckResult[], now: number, touchQueue = true) {
  for (const r of results) {
    const old = await db
      .prepare("SELECT status, reason, source_url, at_ms, passed_ms FROM checks WHERE ca = ? AND kind = ?")
      .bind(ca, r.kind)
      .first<{ status: string; reason: string; source_url: string | null; at_ms: number | null; passed_ms: number | null }>();
    if (old && old.status === r.status && old.reason === r.reason && old.source_url === r.sourceUrl && old.at_ms === r.atMs) continue;
    const passedMs = r.status === "pass" ? (old?.status === "pass" ? old.passed_ms : now) : null;
    await db
      .prepare(
        `INSERT INTO checks (ca, kind, status, reason, source_url, at_ms, checked_ms, passed_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (ca, kind) DO UPDATE SET status = excluded.status, reason = excluded.reason, source_url = excluded.source_url,
           at_ms = excluded.at_ms, checked_ms = excluded.checked_ms, passed_ms = excluded.passed_ms`,
      )
      .bind(ca, r.kind, r.status, r.reason, r.sourceUrl, r.atMs, now, passedMs)
      .run();
    // "error" (could not read) is not news: the last real answer stays in the history.
    if (!old || (old.status !== r.status && r.status !== "error")) {
      await db.prepare("INSERT INTO check_events (ca, kind, status, reason, at_ms) VALUES (?, ?, ?, ?, ?)").bind(ca, r.kind, r.status, r.reason, now).run();
    }
  }
  if (!touchQueue) return;
  await db
    .prepare("INSERT INTO check_queue (ca, checked_ms, wanted_ms) VALUES (?, ?, NULL) ON CONFLICT (ca) DO UPDATE SET checked_ms = excluded.checked_ms, wanted_ms = NULL")
    .bind(ca, now)
    .run();
}

// Which coins the collector checks this run: coins someone claimed first, then never-checked, then the stalest past
// their recheck time. Only coins with a website (listing, launch form or CoinGecko page; nothing to read otherwise), and either claimed,
// at/above the floor, or launched in the last 3 days and never looked at.
export async function dueForChecks(db: D1Like, floor: number, now: number, limit: number) {
  return (
    await db
      .prepare(
        `SELECT c.ca FROM coins c LEFT JOIN check_queue q ON q.ca = c.ca
           LEFT JOIN checks w ON w.ca = c.ca AND w.kind = 'website'
         WHERE ((c.websites IS NOT NULL AND c.websites <> '[]') OR c.launch_website IS NOT NULL OR c.cg_website IS NOT NULL)
           AND (q.wanted_ms IS NOT NULL
             OR (c.mc_usd >= ? AND (q.checked_ms IS NULL OR q.checked_ms < CASE WHEN w.status = 'pass' THEN ? ELSE ? END))
             OR (q.checked_ms IS NULL AND c.launched_ms >= ?))
         ORDER BY q.wanted_ms IS NULL, coalesce(q.checked_ms, 0), c.mc_usd DESC LIMIT ?`,
      )
      .bind(floor, now - PASSED_RECHECK_MS, now - RECHECK_MS, now - NEW_COIN_MS, limit)
      .all<{ ca: string }>()
  ).results;
}

export type CheckEnv = { fetch: Fetcher; now: number; githubToken?: string; xBearer?: string; skipGithub?: boolean; maxPages?: number };

// One coin: its listed websites and X handle from the coins table, tweets sent in through /claim, then all checks.
export async function checkAndSave(db: D1Like, ca: string, env: CheckEnv) {
  const coin = await db
    .prepare("SELECT websites, x_handle, launch_website, launch_x, cg_website, cg_x, domain, domain_created_ms, domain_at_ms FROM coins WHERE ca = ?")
    .bind(ca)
    .first<{ websites: string | null; x_handle: string | null; launch_website: string | null; launch_x: string | null; cg_website: string | null; cg_x: string | null; domain: string | null; domain_created_ms: number | null; domain_at_ms: number | null }>();
  if (!coin) return null;
  let websites: string[] = [];
  try {
    const parsed = JSON.parse(coin.websites ?? "[]");
    if (Array.isArray(parsed)) websites = parsed.filter((w): w is string => typeof w === "string");
  } catch {
    websites = [];
  }
  // The Pons launch form's website too (for a new coin often the only one known, the listing comes later), then the
  // CoinGecko page's (coins with neither, like MOWCAT).
  const bare = (u: string) => u.replace(/\/+$/, "");
  for (const extra of [coin.launch_website, coin.cg_website]) if (extra && !websites.some((w) => bare(w) === bare(extra))) websites.push(extra);
  const claimed = (await db.prepare("SELECT tweet_url FROM claims WHERE ca = ? ORDER BY created_ms DESC LIMIT 4").bind(ca).all<{ tweet_url: string }>()).results.map((r) => r.tweet_url);
  const { results } = await checkCoin({ fetch: env.fetch, ca, websites, listedHandle: coin.x_handle, launchHandle: coin.launch_x, cgHandle: coin.cg_x, claimedTweets: claimed, now: env.now, githubToken: env.githubToken, xBearer: env.xBearer, skipGithub: env.skipGithub, maxPages: env.maxPages });
  await saveChecks(db, ca, results, env.now);
  await saveDomainAge(db, ca, websites[0] ?? null, coin, env);
  return results;
}

// A registration date never changes, so RDAP is asked once per domain; a registry that gave no date is asked again weekly.
async function saveDomainAge(db: D1Like, ca: string, website: string | null, coin: { domain: string | null; domain_created_ms: number | null; domain_at_ms: number | null }, env: CheckEnv) {
  const domain = website ? registrableDomain(website) : null;
  if (!domain) return;
  const fresh = coin.domain === domain && coin.domain_at_ms !== null && (coin.domain_created_ms !== null || !!freeHost(domain) || env.now - coin.domain_at_ms < 7 * 24 * 3600_000);
  if (fresh) return;
  // Free hosting has no registration of its own: store the host, no date, no RDAP call.
  const created = freeHost(domain) ? null : await readDomainCreated(env.fetch, domain).catch(() => undefined);
  if (created === undefined) return; // RDAP did not answer: try again next time
  await db.prepare("UPDATE coins SET domain = ?, domain_created_ms = ?, domain_at_ms = ? WHERE ca = ?").bind(domain, created, env.now, ca).run();
}
