// One collector run. Three stages, each with its own limit so a run always ends in time:
//   1. find coins: Pons launch events since the cursor + GeckoTerminal pool lists (other launchers), and each Pons
//      coin's launch form (website, X) from its launch transaction
//   2. market: DexScreener, 30 coins per call. Coins at/above the MC floor every run, the rest every few hours.
//   3. deep check, only at/above the MC floor: GeckoTerminal info (holders, top 10, dev), contract facts,
//      dev wallet flows (incremental), burned supply.
//   4. legit checks (website, X, GitHub) for coins with a listed website: claimed coins first, then the stalest.
//   5. CoinGecko listing for coins at/above the floor, from one hourly read of CoinGecko's whole list.
//      Plus a few listed coins' CoinGecko pages a run, for the website and X account they link (read monthly).
import { readContractFacts, type RpcClient } from "./contract-facts.ts";
import { BURN_HOLDERS, MAX_SPAN, balances, blockAt, chainClock, codeCheck, devFlows, findCreator, launchTx, readCurves, readLaunchInfos, scanLaunches, timeAt, type Launch } from "./chain-reads.ts";
import { checkAndSave, dueForChecks } from "./check-store.ts";
import { refreshCoingecko, refreshCoingeckoLinks } from "./coingecko.ts";
import type { D1Like } from "./d1-types.ts";
import type { Fetcher } from "./http-json.ts";
import { CURVE_WINDOW_MS } from "./read-coins.ts";
import type { GtInfo, Market, Sources } from "./market-sources.ts";

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
  curveCoins?: number; // Pons curve coins read on chain per run (30 per RPC request)
  dexBatches?: number; // DexScreener calls (30 coins each)
  deepCoins?: number; // coins deep-checked per run (GeckoTerminal allows ~25 a minute)
  deepBudgetMs?: number; // the deep stage stops starting new coins after this long (default 6 minutes)
  deepEveryMs?: number;
  launchForms?: number; // Pons launch forms read per run (10 per RPC request)
  launchTxLookups?: number; // launch transactions looked up per run for coins found before 17 Nov (default 50: ZOLVA
  // waited behind 101 coins at 10 a run, 17 Nov; one getLogs a coin, paced ~1 s)
  checkFetch?: Fetcher; // plain fetch for project websites, oEmbed and GitHub; no legit checks without it
  checkCoins?: number; // coins legit-checked per run
  githubToken?: string; // Actions' own GITHUB_TOKEN: 1,000 GitHub API calls an hour instead of 60
  xBearer?: string; // paid X API, only when the owner sets X_BEARER_TOKEN
  coingeckoKey?: string; // CoinGecko Demo key (COINGECKO_API_KEY); no CoinGecko check without it
  coingeckoLinks?: number; // CoinGecko coin pages read per run for their website and X account (default 5)
  log?: (msg: string) => void;
};

export type RunStats = {
  launchesFound: number;
  launchCursor: number;
  launchForms: number;
  gtTokensSeen: number;
  curveChecked: number;
  marketChecked: number;
  marketFound: number;
  deepChecked: number;
  deepErrors: number;
  legitChecked: number;
  legitErrors: number;
  coingeckoListed: number | null; // Robinhood Chain coins on CoinGecko's list, when it was read this run
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
  const s: RunStats = { launchesFound: 0, launchCursor: 0, launchForms: 0, gtTokensSeen: 0, curveChecked: 0, marketChecked: 0, marketFound: 0, deepChecked: 0, deepErrors: 0, legitChecked: 0, legitErrors: 0, coingeckoListed: null, rpcLogCalls: 0, errors: [] };
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
      "INSERT INTO coins (ca, found_via, found_ms, launch_block, launched_ms, pool, creator, dev, launch_tx)",
      `ON CONFLICT (ca) DO UPDATE SET found_via = 'pons', launch_block = excluded.launch_block, launched_ms = excluded.launched_ms,
         pool = excluded.pool, creator = excluded.creator, dev = excluded.creator, launch_tx = coalesce(excluded.launch_tx, launch_tx)`,
      scan.launches.map((l: Launch) => [l.token, "pons", o.now(), l.block, timeAt(clock, l.block), l.pool, l.creator, l.creator, l.tx]),
    );
    await q(o.db, "INSERT INTO cursor (name, block) VALUES ('pons', ?) ON CONFLICT (name) DO UPDATE SET block = max(block, excluded.block)", scan.scannedTo);
    s.launchesFound += scan.launches.length;
    s.launchCursor = scan.scannedTo;
    from = scan.scannedTo + 1;
    log(`launches: +${scan.launches.length}, cursor ${scan.scannedTo} of ${clock.head}`);
  }

  // 1a2. The Pons launch form (website, X, Telegram, GitHub the dev typed in), read from the launch transaction: new
  // launches first, 10 per RPC request. Coins found before launch_tx was kept get their launch tx from the launch event
  // (one getLogs each), coins at/above the floor first.
  try {
    const missing = await all<{ ca: string; launch_block: number }>(
      o.db,
      `SELECT ca, launch_block FROM coins WHERE launch_tx IS NULL AND launch_block IS NOT NULL AND launch_info_at_ms IS NULL
         AND (mc_usd >= ? OR launched_ms >= ?) ORDER BY mc_usd DESC LIMIT ?`,
      floor, o.now() - CURVE_WINDOW_MS, o.launchTxLookups ?? 50,
    );
    for (const c of missing) {
      const tx = await launchTx(logsRpc, c.ca, c.launch_block);
      s.rpcLogCalls++;
      if (tx) await q(o.db, "UPDATE coins SET launch_tx = ? WHERE ca = ?", tx, c.ca);
      else await q(o.db, "UPDATE coins SET launch_info_at_ms = ? WHERE ca = ?", o.now(), c.ca); // no event found: stop asking
    }
    const todo = await all<{ ca: string; launch_tx: string }>(
      o.db,
      "SELECT ca, launch_tx FROM coins WHERE launch_tx IS NOT NULL AND launch_info_at_ms IS NULL ORDER BY launch_block DESC LIMIT ?",
      o.launchForms ?? 100,
    );
    const forms = await readLaunchInfos(o.rpc, todo.map((c) => c.launch_tx));
    for (const c of todo) {
      const f = forms.get(c.launch_tx);
      await q(
        o.db,
        `UPDATE coins SET launch_desc = ?, launch_website = ?, launch_x = ?, launch_telegram = ?, launch_github = ?, launch_info_at_ms = ? WHERE ca = ?`,
        f?.description ?? null, f?.website ?? null, f?.x ?? null, f?.telegram ?? null, f?.github ?? null, o.now(), c.ca,
      );
    }
    s.launchForms = todo.length;
    log(`launch forms: ${todo.length} read, ${todo.filter((c) => forms.get(c.launch_tx)?.website).length} with a website`);
  } catch (e) {
    s.errors.push(`launch forms: ${(e as Error).message}`);
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

  // 1c. Pons bonding curve (owner 2026-11-16: "seperti di gmgn ada migrate, almost bound sama yang baru"), read on chain
  // from each curve pool: GeckoTerminal answered 429 from GitHub's runners (2026-11-16), the chain does not. Every coin
  // launched in the last CURVE_WINDOW_MS and not migrated is re-read each run; only rows that changed are written.
  // A coin still on the curve has no DexScreener pair, so its MC comes from here and stage 2 leaves it alone; when it
  // migrates, stage 2 prices it.
  // ponytail: an unchanged curve coin's MC is not re-priced when ETH moves; write it too if that drift matters.
  const recentBlock = blockAt(clock, o.now() - CURVE_WINDOW_MS);
  const onCurve = await all<{ ca: string; pool: string; total_supply: string | null; bond_pct: number | null; bonded: number | null }>(
    o.db,
    "SELECT ca, pool, total_supply, bond_pct, bonded FROM coins WHERE launch_block >= ? AND pool IS NOT NULL AND coalesce(bonded, 0) = 0 ORDER BY launch_block DESC LIMIT ?",
    recentBlock, o.curveCoins ?? 3000,
  );
  let curves: Awaited<ReturnType<typeof readCurves>> = new Map();
  let ethUsd: number | null = null;
  if (onCurve.length) {
    ethUsd = await o.sources.ethUsd().catch((e: Error) => (s.errors.push(`eth price: ${e.message}`), null));
    try {
      curves = await readCurves(o.rpc, onCurve.map((c) => ({ ca: c.ca, pool: c.pool, supply: c.total_supply && /^\d+$/.test(c.total_supply) ? BigInt(c.total_supply) : null })));
    } catch (e) {
      s.errors.push(`curve: ${(e as Error).message}`);
      log(`curve: stopped, ${(e as Error).message.slice(0, 160)}`); // shown even if a later stage crashes the run
    }
  }
  const at = o.now();
  const changed = onCurve.flatMap((c) => {
    const r = curves.get(c.ca);
    return r && (r.bondPct !== c.bond_pct || (r.bonded ? 1 : 0) !== c.bonded || !c.total_supply) ? [{ ca: c.ca, ...r }] : [];
  });
  await insertRows(
    o.db,
    "INSERT INTO coins (ca, found_via, found_ms, total_supply, symbol, name, bond_pct, bonded, bonded_ms, bond_at_ms, mc_usd, market_at_ms)",
    `ON CONFLICT (ca) DO UPDATE SET total_supply = coalesce(coins.total_supply, excluded.total_supply),
       symbol = coalesce(coins.symbol, excluded.symbol), name = coalesce(coins.name, excluded.name), bond_pct = excluded.bond_pct, bonded = excluded.bonded, bonded_ms = coalesce(coins.bonded_ms, excluded.bonded_ms),
       bond_at_ms = excluded.bond_at_ms,
       mc_usd = CASE WHEN excluded.bonded = 0 THEN coalesce(excluded.mc_usd, coins.mc_usd) ELSE coins.mc_usd END,
       market_at_ms = CASE WHEN excluded.bonded = 0 THEN excluded.market_at_ms
                           WHEN coalesce(coins.bonded, 0) = 0 THEN NULL
                           ELSE coins.market_at_ms END`,
    changed.map((r) => [
      r.ca, "pons", at, r.supply.toString(), r.symbol, r.name, r.bondPct, r.bonded ? 1 : 0, r.bonded ? at : null, at,
      r.mcEth !== null && ethUsd ? Math.round(r.mcEth * ethUsd * 100) / 100 : null, at,
    ]),
  );
  s.curveChecked = curves.size;
  log(`curve: ${curves.size} read, ${changed.length} changed, ETH $${ethUsd ?? "?"}`);

  // Icons for the fullest curve coins, one GeckoTerminal call a run (best effort: it often answers 429 from GitHub).
  // '' marks "GeckoTerminal has no icon for it", so the same coins are not asked again every run.
  const noIcon = await all<{ ca: string }>(
    o.db,
    "SELECT ca FROM coins WHERE launch_block >= ? AND bonded = 0 AND bond_pct >= 10 AND icon_url IS NULL ORDER BY bond_pct DESC LIMIT 30",
    recentBlock,
  );
  if (noIcon.length) {
    try {
      const got = await o.sources.gtMulti(noIcon.map((r) => r.ca));
      await insertRows(
        o.db,
        "INSERT INTO coins (ca, found_via, found_ms, icon_url)",
        "ON CONFLICT (ca) DO UPDATE SET icon_url = coalesce(coins.icon_url, excluded.icon_url)",
        noIcon.map((r) => [r.ca, "pons", at, got.get(r.ca)?.iconUrl ?? ""]),
      );
    } catch (e) {
      s.errors.push(`gt icons: ${(e as Error).message}`);
    }
  }

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
  // GeckoTerminal answers 429 in bursts and each try waits: 15 coins took 15.5 of the run's 20 minutes on 17 Nov, and
  // the legit checks come after this stage. Coins left over are the stalest next run.
  const deepUntil = o.now() + (o.deepBudgetMs ?? 6 * 60_000);
  for (const c of deep) {
    if (o.now() > deepUntil) {
      log(`deep: out of time, ${deep.length - s.deepChecked - s.deepErrors} left for the next run`);
      break;
    }
    try {
      const [info, facts] = await Promise.all([
        o.sources.gtInfo(c.ca).catch((e: Error): GtInfo | null => (s.errors.push(`gt info ${c.ca}: ${e.message}`), null)),
        readContractFacts(o.rpc, c.ca, o.now()),
      ]);
      // Not a Pons coin: find who launched it from its first mint, once (again after a day when nothing was found).
      let creator: string | null = c.creator ?? null;
      let creatorAt: number | null = c.creator_at_ms ?? null;
      if (!creator && (creatorAt === null || o.now() - creatorAt > 86_400_000)) {
        const near = c.pair_created_ms ? blockAt(clock, c.pair_created_ms) : 0;
        const found = await findCreator(logsRpc, o.rpc, c.ca, near > 0 ? Math.max(0, near - 2 * MAX_SPAN) : 0, clock.head).catch((e: Error) => {
          s.errors.push(`creator ${c.ca}: ${e.message}`);
          return null;
        });
        s.rpcLogCalls += found?.calls ?? 0;
        creator = found?.creator ?? null;
        creatorAt = o.now();
      }
      const dev: string | null = creator ?? info?.dev ?? c.dev ?? null;
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
           icon_url = coalesce(nullif(icon_url, ''), ?), websites = coalesce(websites, ?), x_handle = coalesce(x_handle, ?), telegram = coalesce(telegram, ?),
           is_proxy = ?, has_mint = ?, has_pause = ?, has_blacklist = ?, has_upgrade = ?, owner = ?, owner_renounced = ?,
           total_supply = ?, decimals = ?, burned = ?, facts_at_ms = ?,
           creator = ?, creator_at_ms = ?, dev = ?, dev_in = ?, dev_out_burn = ?, dev_out_contract = ?, dev_out_wallet = ?, dev_holds = ?, flows_to_block = ?, flows_at_ms = ?,
           info_at_ms = ?, last_error = NULL
         WHERE ca = ?`,
        info?.holders ?? c.holders, info?.top10Pct ?? c.top10_pct, info?.dev ?? c.gt_dev, b(info?.verified), b(info?.honeypot),
        info?.iconUrl ?? null, info?.websites.length ? JSON.stringify(info.websites) : null, info?.xHandle ?? null, info?.telegram ?? null,
        b(facts.isProxy), b(facts.hasMint), b(facts.hasPause), b(facts.hasBlacklist), b(facts.hasUpgrade), facts.owner, b(facts.ownerRenounced),
        facts.totalSupply, facts.decimals, burned, o.now(),
        creator, creatorAt, dev, dev ? flows.in.toString() : null, dev ? flows.burn.toString() : null, dev ? flows.toContract.toString() : null,
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

  // 4. Legit checks. Coins someone claimed first, then never-checked, then the stalest past RECHECK_MS.
  if (o.checkFetch) {
    const due = await dueForChecks(o.db, floor, o.now(), o.checkCoins ?? 25);
    const env = { fetch: o.checkFetch, now: o.now(), githubToken: o.githubToken, xBearer: o.xBearer };
    // Eight at a time: each coin is a handful of requests to different hosts (GitHub: ~4 calls a coin, 1,000 an hour).
    for (let i = 0; i < due.length; i += 8) {
      await Promise.all(
        due.slice(i, i + 8).map(async ({ ca }) => {
          try {
            await checkAndSave(o.db, ca, env);
            s.legitChecked++;
          } catch (e) {
            s.legitErrors++;
            s.errors.push(`legit ${ca}: ${(e as Error).message}`);
          }
        }),
      );
    }
    log(`legit: ${s.legitChecked} checked, ${s.legitErrors} failed`);
  }

  // 5. CoinGecko listing, once an hour, for every coin at/above the floor. Unchanged answers are not written.
  // Then a few listed coins' pages for their website and X account; a change queues the coin for step 4 next run.
  if (o.coingeckoKey && o.checkFetch) {
    try {
      const r = await refreshCoingecko(o.db, o.checkFetch, o.coingeckoKey, floor, o.now());
      if (r) {
        s.coingeckoListed = r.listed;
        log(`coingecko: ${r.listed} Robinhood Chain coins listed, ${r.compared} of ours compared`);
      }
    } catch (e) {
      s.errors.push(`coingecko: ${(e as Error).message}`);
    }
    try {
      const n = await refreshCoingeckoLinks(o.db, o.checkFetch, o.coingeckoKey, o.now(), o.coingeckoLinks ?? 5);
      log(`coingecko links: ${n} coin pages read`);
    } catch (e) {
      s.errors.push(`coingecko links: ${(e as Error).message}`);
    }
  }
  return s;
}
