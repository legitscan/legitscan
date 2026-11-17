import { freeHost } from "./legit-checks.ts";
// What the site and the API read from the collector's table. Kept apart from collect-run.ts so the Cloudflare Pages
// function bundles only this file and what it needs (no RPC code; from viem only the signature check in dev-sign.ts).
import type { D1Like } from "./d1-types.ts";
import { signMessageAnswer } from "./dev-sign.ts";
import { cleanName, nameTricks } from "./name-tricks.ts";

const all = async <T>(db: D1Like, sql: string, ...params: unknown[]) => (await db.prepare(sql).bind(...params).all<T>()).results;
const marks = (values: unknown[]) => values.map(() => "?").join(",");

// Curve coins launched within this window are re-read every run and shown on Almost bonded.
export const CURVE_WINDOW_MS = 3 * 24 * 3600_000;

// Percent of total supply, from base-unit strings. null when either side is unknown.
export function pct(part: string | null, supply: string | null): number | null {
  if (part === null || supply === null || !/^\d+$/.test(part) || !/^[1-9]\d*$/.test(supply)) return null;
  return Number((BigInt(part) * 10_000n) / BigInt(supply)) / 100;
}

export type Board = "new" | "almost" | "migrated";
export const ALMOST_BONDED_PCT = 50;

// The three Pons boards, GMGN style. "new": newest launches; "almost": still on the curve, fullest first;
// "migrated": left the curve, most recent first. Each row is the same shape as readCoins.
// Almost bonded only lists coins inside CURVE_WINDOW_MS: older ones are not re-read, so their percent could be stale.
export async function readBoard(db: D1Like, board: Board, limit = 50, now = Date.now()) {
  const cas =
    board === "new"
      ? await all<{ ca: string }>(db, "SELECT ca FROM coins WHERE launch_block IS NOT NULL ORDER BY launch_block DESC LIMIT ?", limit)
      : board === "almost"
        ? await all<{ ca: string }>(
            db,
            "SELECT ca FROM coins WHERE bonded = 0 AND bond_pct >= ? AND launched_ms >= ? ORDER BY bond_pct DESC LIMIT ?",
            ALMOST_BONDED_PCT, now - CURVE_WINDOW_MS, limit,
          )
        : await all<{ ca: string }>(db, "SELECT ca FROM coins WHERE bonded = 1 ORDER BY coalesce(pair_created_ms, bonded_ms) DESC LIMIT ?", limit);
  return readCoins(db, 0, limit, cas.map((r) => r.ca));
}

// Tickers launched more than once on Pons in the last CURVE_WINDOW_MS, most contracts first. Reads at most the newest
// 5000 launches through the launch_block index, so the cost stays flat as the table grows. Says nothing about which
// contract is the real one: that needs the website check.
export async function readCopies(db: D1Like, now = Date.now(), limit = 5) {
  const rows = await all<{ ticker: string; contracts: number }>(
    db,
    `SELECT upper(symbol) AS ticker, count(*) AS contracts FROM
       (SELECT symbol, launched_ms FROM coins WHERE launch_block IS NOT NULL ORDER BY launch_block DESC LIMIT 5000)
     WHERE launched_ms >= ? AND symbol IS NOT NULL AND symbol <> ''
     GROUP BY ticker HAVING contracts > 1 ORDER BY contracts DESC, ticker LIMIT ?`,
    now - CURVE_WINDOW_MS, limit,
  );
  return rows.map((r) => ({ ...r, ticker: cleanName(r.ticker) ?? "" }));
}

export const DOMAIN_YOUNG_DAYS = 7;
export const MC_OVER_LIQ_WARN = 100; // real coins seen 2026-11-16 sit at 2x-25x (OffRouter 2x, GF 16x, CHARLIE 21x)

// What the site and the API read: one coin's facts, with percentages worked out. Dev launch count comes from our own
// table (every Pons launch is in it; other launchers count once we have seen them).
export async function readCoins(db: D1Like, floor = 5_000, limit = 50, only?: string[]) {
  const select = `SELECT c.*, (SELECT count(*) FROM coins d WHERE d.dev = c.dev) AS dev_launches,
            (SELECT count(*) FROM coins t WHERE t.symbol = c.symbol AND t.ca <> c.ca) AS same_ticker FROM coins c`;
  const rows = only
    ? only.length
      ? await all<Record<string, any>>(db, `${select} WHERE c.ca IN (${marks(only)})`, ...only)
      : []
    : await all<Record<string, any>>(db, `${select} WHERE c.mc_usd >= ? ORDER BY c.mc_usd DESC LIMIT ?`, floor, limit);
  if (only) rows.sort((a, b) => only.indexOf(a.ca) - only.indexOf(b.ca)); // keep the board's order
  const checks = await readChecks(db, rows.map((r) => r.ca));
  return rows.map((c) => {
    const level = legitLevel(checks.get(c.ca), c.launch_x ?? c.cg_x ?? null);
    return {
      ca: c.ca,
      symbol: cleanName(c.symbol),
      name: cleanName(c.name),
      nameTricks: nameTricks(c.symbol, c.name), // "hidden" / "mixed": see name-tricks.ts
      icon: c.icon_url || null,
      websites: c.websites ? (JSON.parse(c.websites) as string[]) : [],
      x: c.x_handle,
      dex: c.dex,
      mcUsd: c.mc_usd,
      liqUsd: c.liq_usd,
      // MC is price x supply; with a thin pool a tiny trade sets the price. 2026-11-16: a fake "BTC" showed $64T MC on
      // $1,880 liquidity. Over 100x reads as "MC not backed by liquidity" on the risk panel.
      mcOverLiq: c.mc_usd && c.liq_usd ? Math.round(c.mc_usd / c.liq_usd) : null,
      mcNotBacked: c.mc_usd && c.liq_usd !== null ? c.liq_usd === 0 || c.mc_usd / c.liq_usd > MC_OVER_LIQ_WARN : null,
      pairCreatedMs: c.pair_created_ms,
      launchedMs: c.launched_ms,
      bondPct: c.bond_pct,
      bonded: c.bonded === null ? null : c.bonded === 1,
      bondedMs: c.bonded_ms,
      holders: c.holders,
      top10Pct: c.top10_pct,
      powers: c.facts_at_ms ? ["mint", "pause", "blacklist", "upgrade"].filter((p) => c[`has_${p}`] === 1) : null,
      ownerRenounced: c.owner_renounced === null ? null : c.owner_renounced === 1,
      burnedPct: pct(c.burned, c.total_supply),
      dev: c.dev,
      devLaunches: c.dev ? c.dev_launches : null,
      devGotPct: pct(c.dev_in, c.total_supply),
      devBurnedPct: pct(c.dev_out_burn, c.total_supply),
      devToContractPct: pct(c.dev_out_contract, c.total_supply),
      devToWalletPct: pct(c.dev_out_wallet, c.total_supply),
      devHoldsPct: pct(c.dev_holds, c.total_supply),
      sameTicker: c.symbol ? c.same_ticker : null,
      checkedMs: c.info_at_ms,
      error: c.last_error,
      // What the dev typed into the Pons launch form: self-declared, shown as such.
      launchForm: c.launch_info_at_ms
        ? { description: c.launch_desc ?? null, website: c.launch_website ?? null, x: c.launch_x ?? null, telegram: c.launch_telegram ?? null, github: c.launch_github ?? null }
        : null,
      domain: c.domain ?? null,
      freeHost: c.domain ? freeHost(c.domain) : null, // "vercel.app" when the site has no domain of its own
      domainCreatedMs: c.domain_created_ms ?? null,
      // Owner 17 Nov: a young domain is not a fail, but say so. Young = registered under DOMAIN_YOUNG_DAYS ago.
      domainYoung: c.domain_created_ms ? Date.now() - c.domain_created_ms < DOMAIN_YOUNG_DAYS * 86_400_000 : null,
      checks: checks.get(c.ca) ?? NO_CHECKS,
      legitLevel: level,
      legit: level > 0,
    };
  });
}

export type CheckRow = { status: "pass" | "fail" | "none" | "error"; reason: string; sourceUrl: string | null; atMs: number | null; checkedMs: number; passedMs: number | null };
type Checks = { website: CheckRow | null; x: CheckRow | null; xmatch: CheckRow | null; github: CheckRow | null; githubca: CheckRow | null; dev: CheckRow | null; coingecko: CheckRow | null };
const NO_CHECKS: Checks = { website: null, x: null, xmatch: null, github: null, githubca: null, dev: null, coingecko: null };

// Legit report (owner, 17 Nov: "dua rapor"; the Dev report is separate and never moves these levels):
//   2 Legit+ = the website shows the CA, and a channel the project controls carries it too: a tweet from the X account
//              the site links, the README of the GitHub the site links, or a signature from the launch wallet.
//   1 Legit  = the website shows the CA, and the X account the team typed into the Pons launch form or onto the CoinGecko
//              page (owner, 17 Nov: "setara formulir") is the one the website links (xmatch passes with it as a source).
//   0        = not proven.
export function legitLevel(c: Checks | undefined, launchX: string | null): 0 | 1 | 2 {
  if (c?.website?.status !== "pass") return 0;
  if (c.x?.status === "pass" || c.githubca?.status === "pass" || c.dev?.status === "pass") return 2;
  return launchX && c.xmatch?.status === "pass" ? 1 : 0;
}

async function readChecks(db: D1Like, cas: string[]) {
  const out = new Map<string, Checks>();
  for (let i = 0; i < cas.length; i += 90) {
    const part = cas.slice(i, i + 90);
    // checks.checked_ms only moves when an answer changes. The last look: check_queue for the site checks, the hourly list
    // read for CoinGecko, the signing time for a dev sign.
    const rows = await all<Record<string, any>>(
      db,
      `SELECT k.*, CASE k.kind
                     WHEN 'coingecko' THEN coalesce(s.at_ms, k.checked_ms)
                     WHEN 'dev' THEN k.checked_ms
                     ELSE coalesce(q.checked_ms, k.checked_ms) END AS looked_ms
       FROM checks k LEFT JOIN check_queue q ON q.ca = k.ca LEFT JOIN source_times s ON s.name = 'coingecko'
       WHERE k.ca IN (${marks(part)})`,
      ...part,
    );
    for (const r of rows) {
      const c = out.get(r.ca) ?? { ...NO_CHECKS };
      c[r.kind as keyof Checks] = { status: r.status, reason: r.reason, sourceUrl: r.source_url, atMs: r.at_ms, checkedMs: r.looked_ms, passedMs: r.passed_ms };
      out.set(r.ca, c);
    }
  }
  return out;
}

// Numbers for /stats and the landing page, straight from the tables, plus the latest real pass of each check.
export async function readStats(db: D1Like, floor = 5_000, now = Date.now()) {
  const n = await db
    .prepare(
      `SELECT (SELECT count(*) FROM coins) AS coins,
              (SELECT count(*) FROM coins WHERE mc_usd >= ?) AS over_floor,
              (SELECT count(*) FROM check_queue WHERE checked_ms IS NOT NULL) AS checked,
              (SELECT count(*) FROM checks WHERE kind = 'website' AND status = 'pass') AS website_pass,
              (SELECT count(*) FROM checks WHERE kind = 'website' AND status = 'fail') AS website_fail,
              (SELECT count(*) FROM checks WHERE kind = 'x' AND status = 'pass') AS x_pass,
              (SELECT count(*) FROM checks WHERE kind = 'github' AND status = 'pass') AS github_pass,
              (SELECT count(*) FROM checks WHERE kind = 'dev' AND status = 'pass') AS dev_pass,
              (SELECT count(*) FROM checks WHERE kind = 'coingecko' AND status = 'pass') AS coingecko_pass,
              (SELECT count(*) FROM checks w WHERE w.kind = 'website' AND w.status = 'pass'
                 AND EXISTS (SELECT 1 FROM checks k WHERE k.ca = w.ca AND k.kind IN ('x', 'githubca', 'dev') AND k.status = 'pass')) AS legit_plus,
              (SELECT count(*) FROM checks w JOIN coins c ON c.ca = w.ca WHERE w.kind = 'website' AND w.status = 'pass'
                 AND (EXISTS (SELECT 1 FROM checks k WHERE k.ca = w.ca AND k.kind IN ('x', 'githubca', 'dev') AND k.status = 'pass')
                   OR ((c.launch_x IS NOT NULL OR c.cg_x IS NOT NULL) AND EXISTS (SELECT 1 FROM checks k WHERE k.ca = w.ca AND k.kind = 'xmatch' AND k.status = 'pass')))) AS legit,
              (SELECT count(*) FROM claims) AS claims,
              (SELECT count(*) FROM coin_views) AS views,
              (SELECT count(*) FROM coin_views WHERE day = ?) AS views_today,
              (SELECT min(day) FROM coin_views) AS views_since`,
    )
    .bind(floor, new Date(now).toISOString().slice(0, 10))
    .first<Record<string, number | string | null>>();
  const num = (k: string) => Number(n?.[k] ?? 0);
  const latest = async (kind: string) => {
    const r = await db
      .prepare(
        `SELECT k.ca, k.reason, k.source_url, coalesce(q.checked_ms, k.checked_ms) AS checked_ms, k.passed_ms, c.symbol, c.name
         FROM checks k JOIN coins c ON c.ca = k.ca LEFT JOIN check_queue q ON q.ca = k.ca
         WHERE k.kind = ? AND k.status = 'pass' ORDER BY k.passed_ms DESC LIMIT 1`,
      )
      .bind(kind)
      .first<Record<string, any>>();
    return r ? { ca: r.ca, symbol: cleanName(r.symbol), name: cleanName(r.name), reason: r.reason, sourceUrl: r.source_url, checkedMs: r.checked_ms, passedMs: r.passed_ms } : null;
  };
  return {
    coins: num("coins"),
    overFloor: num("over_floor"),
    checked: num("checked"),
    websitePass: num("website_pass"),
    websiteFail: num("website_fail"),
    xPass: num("x_pass"),
    githubPass: num("github_pass"),
    devPass: num("dev_pass"),
    coingeckoPass: num("coingecko_pass"),
    legit: num("legit"), // Legit and Legit+
    legitPlus: num("legit_plus"),
    claims: num("claims"),
    // Coin pages opened by visitors (coin-views.ts), once per visitor, coin and day; counted since viewsSince.
    views: num("views"),
    viewsToday: num("views_today"),
    viewsSince: typeof n?.views_since === "string" ? n.views_since : null,
    latest: { website: await latest("website"), x: await latest("x"), github: await latest("github"), dev: await latest("dev") },
  };
}

// The public JSON API, shared by the Cloudflare Pages function (site/functions/api) and the local dev server:
//   /api/board/new | almost | migrated   GMGN-style Pons boards
//   /api/coins                           coins at/above the $5k MC floor, biggest first
//   /api/coin/{ca}                       one coin, any MC, with its check history
//   /api/copies                          tickers launched more than once in the last 3 days
//   /api/stats                           counts and the latest pass of each legit check
//   /api/sign-message/{ca}/{wallet}      the message the launch wallet signs for a dev sign (dev-sign.ts)
// Every answer carries updatedMs, the end of the last collector run.
const BOARDS = new Set<Board>(["new", "almost", "migrated"]);
const CA = /^0x[0-9a-f]{40}$/;

export async function apiAnswer(db: D1Like, path: string, now = Date.now()): Promise<{ status: number; body: unknown }> {
  const last = await db.prepare("SELECT finished_ms FROM runs WHERE finished_ms IS NOT NULL ORDER BY id DESC LIMIT 1").first<{ finished_ms: number }>();
  const updatedMs = last?.finished_ms ?? null;
  const [, api, kind, arg, extra, more] = path.replace(/\/+$/, "").split("/");
  if (api === "api" && kind === "sign-message" && arg && extra && more === undefined) return signMessageAnswer(db, arg, extra, now);
  if (api !== "api" || extra !== undefined) return { status: 404, body: { error: "not found" } };
  if (kind === "board" && BOARDS.has(arg as Board)) return { status: 200, body: { updatedMs, board: arg, coins: await readBoard(db, arg as Board, 50, now) } };
  if (kind === "stats" && arg === undefined) return { status: 200, body: { updatedMs, stats: await readStats(db, 5_000, now) } };
  if (kind === "copies" && arg === undefined) return { status: 200, body: { updatedMs, copies: await readCopies(db, now) } };
  // All of them (562 on 17 Nov; at 100 the list stopped at $230k MC and hid ZOLVA). The page splits them into pages.
  // 600 coins: ~30k D1 rows read, ~140 KB gzipped.
  if (kind === "coins" && arg === undefined) return { status: 200, body: { updatedMs, coins: await readCoins(db, 5_000, 1000) } };
  if (kind === "coin" && arg && CA.test(arg.toLowerCase())) {
    const [coin] = await readCoins(db, 0, 1, [arg.toLowerCase()]);
    if (!coin) return { status: 404, body: { updatedMs, error: "not in our list yet" } };
    const history = await all<Record<string, any>>(db, "SELECT kind, status, reason, at_ms FROM check_events WHERE ca = ? ORDER BY at_ms DESC, id DESC LIMIT 30", coin.ca);
    const sig = await db.prepare("SELECT wallet, message, signature, signed_ms FROM dev_signatures WHERE ca = ?").bind(coin.ca).first<Record<string, any>>();
    return {
      status: 200,
      body: {
        updatedMs,
        coin,
        history: history.map((h) => ({ kind: h.kind, status: h.status, reason: h.reason, atMs: h.at_ms })),
        // Published in full so anyone can check the dev signature again with their own wallet tool.
        devSignature: sig ? { wallet: sig.wallet, message: sig.message, signature: sig.signature, signedMs: sig.signed_ms } : null,
      },
    };
  }
  return { status: 404, body: { error: "not found" } };
}

export type ApiCoin = Awaited<ReturnType<typeof readCoins>>[number];
