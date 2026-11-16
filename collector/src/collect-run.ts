// One collector run. Three stages, each with its own limit so a run always ends in time:
//   1. find coins: Pons launch events since the cursor + GeckoTerminal pool lists (other launchers)
//   2. market: DexScreener, 30 coins per call. Coins at/above the MC floor every run, the rest every few hours.
//   3. deep check, only at/above the MC floor: GeckoTerminal info (holders, top 10, dev), contract facts,
//      dev wallet flows (incremental), burned supply.
import { readContractFacts, type RpcClient } from "./contract-facts.ts";
import { BURN_HOLDERS, MAX_SPAN, balances, blockAt, chainClock, codeCheck, devFlows, scanLaunches, timeAt, type Launch } from "./chain-reads.ts";
import type { D1Like } from "./d1-types.ts";
import type { Curve, GtInfo, Market, Sources } from "./market-sources.ts";

// First Pons launch seen on 2026-11-16 was at block 27,027,321. Reading from here skips 27M empty blocks.
export const PONS_FIRST_BLOCK = 27_000_000;

export type RunOptions = {
  db: D1Like;
  rpc: RpcClient;
  logsRpc?: RpcClient; // nodes that can read old event logs (some paid plans only read recent blocks); default rpc
  sources: Sources;
  now: () => number;
  mcFloorUsd?: number; // owner 2026-11-16: "MC min 5k"
  launchCalls?: number; // getLogs calls for Pons launches per run
  gtListPages?: number; // pages (20 pools each) of new_pools and of the busiest pools
  curveCalls?: number; // GeckoTerminal tokens/multi calls (30 coins each) for Pons bonding progress
  dexBatches?: number; // DexScreener calls (30 coins each)
  deepCoins?: number; // coins deep-checked per run (GeckoTerminal allows ~25 a minute)
  deepEveryMs?: number;
  log?: (msg: string) => void;
};

export type RunStats = {
  launchesFound: number;
  launchCursor: number;
  gtTokensSeen: number;
  curveChecked: number;
  marketChecked: number;
  marketFound: number;
  deepChecked: number;
  deepErrors: number;
  rpcLogCalls: number;
  errors: string[];
};

const q = async (db: D1Like, sql: string, ...params: unknown[]) => db.prepare(sql).bind(...params).run();
const all = async <T>(db: D1Like, sql: string, ...params: unknown[]) => (await db.prepare(sql).bind(...params).all<T>()).results;
const b = (v: boolean | null | undefined) => (v === null || v === undefined ? null : v ? 1 : 0);
const big = (v: unknown) => (typeof v === "string" && /^\d+$/.test(v) ? BigInt(v) : 0n);

const marks = (values: unknown[]) => values.map(() => "?").join(","); // "?,?,?" for an IN (...) list

// D1 binds at most 100 values per statement.
async function insertRows(db: D1Like, head: string, tail: string, rows: unknown[][]) {
  if (!rows.length) return;
  const per = Math.floor(100 / rows[0].length);
  for (let i = 0; i < rows.length; i += per) {
    const part = rows.slice(i, i + per);
    const rowMarks = part.map((r) => `(${marks(r)})`).join(",");
    await q(db, `${head} VALUES ${rowMarks} ${tail}`, ...part.flat());
  }
}

export async function runCollect(o: RunOptions): Promise<RunStats> {
  const floor = o.mcFloorUsd ?? 5_000;
  const log = o.log ?? (() => {});
  const s: RunStats = { launchesFound: 0, launchCursor: 0, gtTokensSeen: 0, curveChecked: 0, marketChecked: 0, marketFound: 0, deepChecked: 0, deepErrors: 0, rpcLogCalls: 0, errors: [] };
  const clock = await chainClock(o.rpc);
  const logsRpc = o.logsRpc ?? o.rpc;

  // 1a. Pons launches since the cursor, saved every few calls so a cut-off run keeps what it read.
  const cur = await o.db.prepare("SELECT block FROM cursor WHERE name = 'pons'").first<{ block: number }>();
  let from = cur ? cur.block + 1 : PONS_FIRST_BLOCK;
  for (let left = o.launchCalls ?? 3; left > 0 && from <= clock.head; ) {
    const scan = await scanLaunches(logsRpc, from, clock.head, Math.min(left, 5));
    left -= scan.calls;
    s.rpcLogCalls += scan.calls;
    await insertRows(
      o.db,
      "INSERT INTO coins (ca, found_via, found_ms, launch_block, launched_ms, creator, dev)",
      `ON CONFLICT (ca) DO UPDATE SET found_via = 'pons', launch_block = excluded.launch_block, launched_ms = excluded.launched_ms,
         creator = excluded.creator, dev = excluded.creator`,
      scan.launches.map((l: Launch) => [l.token, "pons", o.now(), l.block, timeAt(clock, l.block), l.creator, l.creator]),
    );
    await q(o.db, "INSERT INTO cursor (name, block) VALUES ('pons', ?) ON CONFLICT (name) DO UPDATE SET block = max(block, excluded.block)", scan.scannedTo);
    s.launchesFound += scan.launches.length;
    s.launchCursor = scan.scannedTo;
    from = scan.scannedTo + 1;
    log(`launches: +${scan.launches.length}, cursor ${scan.scannedTo} of ${clock.head}`);
  }

  // 1b. Other launchers, from GeckoTerminal's newest and busiest pools.
  const seen = new Set<string>();
  // One page of new pools (Pons launches already come from the chain), then the busiest pools, which is what catches a
  // coin growing past the floor. GeckoTerminal answered 429 from GitHub's runners at 10 list calls (2026-11-16).
  const lists: ["new_pools" | "pools", number][] = [["new_pools", 1]];
  for (let page = 1; page <= (o.gtListPages ?? 5); page++) lists.push(["pools", page]);
  for (const [path, page] of lists) {
    try {
      for (const t of await o.sources.gtPoolTokens(path, page)) seen.add(t);
    } catch (e) {
      s.errors.push(`gt ${path} p${page}: ${(e as Error).message}`);
    }
  }
  // Coins under the floor are never re-checked on a timer (owner 2026-11-16: "ngapain cek mc dibawah 5k"). A coin that
  // grows past the floor starts trading and shows up among the busiest pools: clearing its market time here makes
  // stage 2 price it this run.
  await insertRows(
    o.db,
    "INSERT INTO coins (ca, found_via, found_ms)",
    `ON CONFLICT (ca) DO UPDATE SET market_at_ms = NULL WHERE coalesce(coins.mc_usd, 0) < ${Number(floor)}`,
    [...seen].map((t) => [t, "geckoterminal", o.now()]),
  );
  s.gtTokensSeen = seen.size;

  // 1c. Pons bonding curve (owner 2026-11-16: "seperti di gmgn ada migrate, almost bound sama yang baru"). Launches of
  // the last 3 days never read yet, then coins whose curve is moving, fullest first. A coin still on the curve has no
  // DexScreener pair, so its MC comes from here and stage 2 leaves it alone; when it migrates, stage 2 prices it.
  // ponytail: an old curve coin (> 3 days, < 1% filled) that wakes up is not re-read; add a trigger if that happens.
  const curveLimit = (o.curveCalls ?? 6) * 30;
  const recentBlock = clock.head - Math.round(3 * 24 * 3600_000 * clock.blocksPerMs);
  const unread = await all<{ ca: string }>(o.db, "SELECT ca FROM coins WHERE launch_block >= ? AND bond_at_ms IS NULL ORDER BY launch_block DESC LIMIT ?", recentBlock, curveLimit);
  const moving = await all<{ ca: string }>(
    o.db,
    "SELECT ca FROM coins WHERE bonded = 0 AND bond_pct >= 1 AND bond_at_ms < ? ORDER BY bond_pct DESC LIMIT ?",
    o.now() - 4 * 60_000, curveLimit,
  );
  const curveWant = [...new Set([...unread, ...moving].map((r) => r.ca))].slice(0, curveLimit);
  for (let i = 0; i < curveWant.length; i += 30) {
    const cas = curveWant.slice(i, i + 30);
    let got: Map<string, Curve>;
    try {
      got = await o.sources.gtMulti(cas);
    } catch (e) {
      s.errors.push(`gt multi: ${(e as Error).message}`);
      break;
    }
    const at = o.now();
    await insertRows(
      o.db,
      "INSERT INTO coins (ca, found_via, found_ms, symbol, name, icon_url, bond_pct, bonded, bonded_ms, bond_at_ms, mc_usd, market_at_ms)",
      `ON CONFLICT (ca) DO UPDATE SET symbol = coalesce(coins.symbol, excluded.symbol), name = coalesce(coins.name, excluded.name),
         icon_url = coalesce(coins.icon_url, excluded.icon_url), bond_pct = excluded.bond_pct, bonded = excluded.bonded,
         bonded_ms = coalesce(coins.bonded_ms, excluded.bonded_ms), bond_at_ms = excluded.bond_at_ms,
         mc_usd = CASE WHEN excluded.bonded = 0 THEN excluded.mc_usd ELSE coins.mc_usd END,
         market_at_ms = CASE WHEN excluded.bonded = 0 THEN excluded.market_at_ms
                             WHEN excluded.bonded = 1 AND coalesce(coins.bonded, 0) = 0 THEN NULL
                             ELSE coins.market_at_ms END`,
      [...got.values()].filter((c) => cas.includes(c.ca)).map((c) => [
        c.ca, "pons", at, c.symbol, c.name, c.iconUrl, c.bondPct, c.bonded === null ? null : c.bonded ? 1 : 0,
        c.bonded ? c.bondedMs ?? at : null, at, c.mcUsd, at,
      ]),
    );
    const notListed = cas.filter((ca) => !got.has(ca)); // not on GeckoTerminal yet: wait for its turn among the moving ones
    if (notListed.length) await q(o.db, `UPDATE coins SET bond_at_ms = ? WHERE ca IN (${marks(notListed)})`, at, ...notListed);
    s.curveChecked += got.size;
  }
  log(`curve: ${s.curveChecked} read`);

  // 2. Market: never-checked coins once (new launches, coins flagged above), coins at/above the floor every run.
  // 2026-11-16: 486k Pons launches, 0.5% with a market; re-checking the dead ones would cost millions of D1 writes.
  const now = o.now();
  // Two small indexed queries instead of one OR: the OR made D1 read 703k rows per run (measured 2026-11-16).
  const limit = (o.dexBatches ?? 20) * 30;
  const fresh = await all<{ ca: string }>(o.db, "SELECT ca FROM coins WHERE market_at_ms IS NULL ORDER BY launch_block DESC LIMIT ?", limit);
  const tracked = await all<{ ca: string }>(
    o.db,
    // Curve coins (bonded = 0) are priced by stage 1c; DexScreener has no pair for them.
    "SELECT ca FROM coins WHERE mc_usd >= ? AND market_at_ms < ? AND coalesce(bonded, 1) = 1 ORDER BY mc_usd DESC LIMIT ?",
    floor, now - 4 * 60_000, limit,
  );
  const want = [...fresh, ...tracked].slice(0, limit);
  for (let i = 0; i < want.length; i += 30) {
    const cas = want.slice(i, i + 30).map((r) => r.ca);
    let found: Map<string, Market>;
    try {
      const asked = new Set(cas); // DexScreener also returns pairs where the coin is the quote side: keep only ours
      found = new Map([...(await o.sources.dexTokens(cas))].filter(([ca]) => asked.has(ca)));
    } catch (e) {
      s.errors.push(`dexscreener: ${(e as Error).message}`);
      break; // a rate limit or outage: leave the rest for the next run
    }
    const at = o.now();
    const missing = cas.filter((ca) => !found.has(ca));
    if (missing.length) {
      await q(
        o.db,
        `UPDATE coins SET market_at_ms = ?, mc_usd = CASE WHEN bonded = 0 THEN mc_usd END, liq_usd = NULL, vol_h24_usd = NULL
         WHERE ca IN (${marks(missing)})`,
        at, ...missing,
      );
    }
    // One upsert per few coins instead of one UPDATE each: D1 over REST costs one HTTPS call per statement.
    await insertRows(
      o.db,
      "INSERT INTO coins (ca, found_via, found_ms, symbol, name, icon_url, websites, x_handle, telegram, dex, pair, pair_created_ms, mc_usd, liq_usd, vol_h24_usd, market_at_ms)",
      `ON CONFLICT (ca) DO UPDATE SET symbol = excluded.symbol, name = excluded.name, icon_url = coalesce(excluded.icon_url, icon_url),
         websites = coalesce(excluded.websites, websites), x_handle = coalesce(excluded.x_handle, x_handle), telegram = coalesce(excluded.telegram, telegram),
         dex = excluded.dex, pair = excluded.pair, pair_created_ms = excluded.pair_created_ms, mc_usd = excluded.mc_usd, liq_usd = excluded.liq_usd,
         vol_h24_usd = excluded.vol_h24_usd, market_at_ms = excluded.market_at_ms`,
      [...found.values()].map((m) => [
        m.ca, "geckoterminal", at, m.symbol, m.name, m.iconUrl, m.websites.length ? JSON.stringify(m.websites) : null, m.xHandle, m.telegram,
        m.dex, m.pair, m.pairCreatedMs, m.mcUsd, m.liqUsd, m.volH24Usd, at,
      ]),
    );
    s.marketFound += found.size;
    s.marketChecked += cas.length;
    if ((i / 30) % 50 === 49) log(`market: ${s.marketChecked} asked so far`);
  }
  log(`market: ${s.marketChecked} asked, ${s.marketFound} with a pair`);

  // 3. Deep check for coins at/above the floor, stalest first.
  const deep = await all<Record<string, any>>(
    o.db,
    "SELECT * FROM coins WHERE mc_usd >= ? AND (info_at_ms IS NULL OR info_at_ms < ?) ORDER BY coalesce(info_at_ms, 0), mc_usd DESC LIMIT ?", // never-checked first, biggest first
    floor, o.now() - (o.deepEveryMs ?? 3600_000), o.deepCoins ?? 30,
  );
  const kindCache = new Map<string, boolean>();
  const isContract = async (addrs: string[]) => {
    const missing = addrs.filter((a) => !kindCache.has(a));
    if (missing.length) for (const [a, k] of await codeCheck(o.rpc, missing)) kindCache.set(a, k);
    return kindCache;
  };
  for (const c of deep) {
    try {
      const [info, facts] = await Promise.all([
        o.sources.gtInfo(c.ca).catch((e: Error): GtInfo | null => (s.errors.push(`gt info ${c.ca}: ${e.message}`), null)),
        readContractFacts(o.rpc, c.ca, o.now()),
      ]);
      const dev: string | null = c.creator ?? info?.dev ?? c.dev ?? null;
      const [burnDead, burnZero, devNow] = await balances(o.rpc, c.ca, dev ? [...BURN_HOLDERS, dev] : BURN_HOLDERS);

      // Dev flows: continue from the last counted block, or start over if the dev wallet changed.
      let flows = { in: big(c.dev_in), burn: big(c.dev_out_burn), toContract: big(c.dev_out_contract), toWallet: big(c.dev_out_wallet), to: c.flows_to_block as number | null };
      if (dev !== c.dev) flows = { in: 0n, burn: 0n, toContract: 0n, toWallet: 0n, to: null };
      if (dev) {
        const start = flows.to !== null ? flows.to + 1 : c.launch_block ?? (c.pair_created_ms ? Math.max(0, blockAt(clock, c.pair_created_ms) - MAX_SPAN) : null);
        if (start !== null && start <= clock.head) {
          const f = await devFlows(logsRpc, c.ca, dev, start, clock.head, isContract);
          s.rpcLogCalls += f.calls;
          flows = { in: flows.in + f.got, burn: flows.burn + f.burn, toContract: flows.toContract + f.toContract, toWallet: flows.toWallet + f.toWallet, to: clock.head };
        }
      }
      const burned = burnDead !== null && burnZero !== null ? (burnDead + burnZero).toString() : null;
      await q(
        o.db,
        `UPDATE coins SET holders = ?, top10_pct = ?, gt_dev = ?, gt_verified = ?, honeypot = ?,
           icon_url = coalesce(icon_url, ?), websites = coalesce(websites, ?), x_handle = coalesce(x_handle, ?), telegram = coalesce(telegram, ?),
           is_proxy = ?, has_mint = ?, has_pause = ?, has_blacklist = ?, has_upgrade = ?, owner = ?, owner_renounced = ?,
           total_supply = ?, decimals = ?, burned = ?, facts_at_ms = ?,
           dev = ?, dev_in = ?, dev_out_burn = ?, dev_out_contract = ?, dev_out_wallet = ?, dev_holds = ?, flows_to_block = ?, flows_at_ms = ?,
           info_at_ms = ?, last_error = NULL
         WHERE ca = ?`,
        info?.holders ?? c.holders, info?.top10Pct ?? c.top10_pct, info?.dev ?? c.gt_dev, b(info?.verified), b(info?.honeypot),
        info?.iconUrl ?? null, info?.websites.length ? JSON.stringify(info.websites) : null, info?.xHandle ?? null, info?.telegram ?? null,
        b(facts.isProxy), b(facts.hasMint), b(facts.hasPause), b(facts.hasBlacklist), b(facts.hasUpgrade), facts.owner, b(facts.ownerRenounced),
        facts.totalSupply, facts.decimals, burned, o.now(),
        dev, dev ? flows.in.toString() : null, dev ? flows.burn.toString() : null, dev ? flows.toContract.toString() : null,
        dev ? flows.toWallet.toString() : null, dev && devNow !== null && devNow !== undefined ? devNow.toString() : null, dev ? flows.to : null, o.now(),
        o.now(), c.ca,
      );
      s.deepChecked++;
    } catch (e) {
      s.deepErrors++;
      s.errors.push(`deep ${c.ca}: ${(e as Error).message}`);
      await q(o.db, "UPDATE coins SET info_at_ms = ?, last_error = ? WHERE ca = ?", o.now(), (e as Error).message.slice(0, 300), c.ca);
    }
  }
  log(`deep: ${s.deepChecked} checked, ${s.deepErrors} failed`);
  return s;
}

// Percent of total supply, from base-unit strings. null when either side is unknown.
export function pct(part: string | null, supply: string | null): number | null {
  if (part === null || supply === null || !/^\d+$/.test(part) || !/^[1-9]\d*$/.test(supply)) return null;
  return Number((BigInt(part) * 10_000n) / BigInt(supply)) / 100;
}

export type Board = "new" | "almost" | "migrated";
export const ALMOST_BONDED_PCT = 50;

// The three Pons boards, GMGN style. "new": newest launches; "almost": still on the curve, fullest first;
// "migrated": left the curve, most recent first. Each row is the same shape as readCoins.
export async function readBoard(db: D1Like, board: Board, limit = 50) {
  const where = {
    new: "launch_block IS NOT NULL ORDER BY launch_block DESC",
    almost: `bonded = 0 AND bond_pct >= ${ALMOST_BONDED_PCT} ORDER BY bond_pct DESC`,
    migrated: "bonded = 1 ORDER BY bonded_ms DESC",
  }[board];
  const cas = await all<{ ca: string }>(db, `SELECT ca FROM coins WHERE ${where} LIMIT ?`, limit);
  return readCoins(db, 0, limit, cas.map((r) => r.ca));
}

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
  return rows.map((c) => ({
    ca: c.ca,
    symbol: c.symbol,
    name: c.name,
    icon: c.icon_url,
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
  }));
}
