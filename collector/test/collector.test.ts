// node --test test/*.test.ts. No network: parsers get recorded shapes, the run gets fake sources and a fake RPC.
import { test } from "node:test";
import assert from "node:assert/strict";
import { devFlows, parseLaunch, LAUNCHER, LAUNCH_TOPIC, TRANSFER_TOPIC } from "../src/chain-reads.ts";
import { pct, readBoard, readCoins, runCollect } from "../src/collect-run.ts";
import type { RpcCall, RpcClient, RpcResult } from "../src/contract-facts.ts";
import { parseDexTokens, parseGtInfo, parseGtMulti, parseGtPoolTokens, xHandle, type Sources } from "../src/market-sources.ts";
import { openSqlite } from "../src/sqlite-adapter.ts";

const OFF = "0x47b537f7c2c2183967fe5ba883291b8ada490db6";
const DEV = "0x047e8c634557fc35c9ee8889d117f2134104d612";
const DEAD = "0x000000000000000000000000000000000000dead";
const POOL = "0x9525dcf8f115a4b4c4db99b3b7ceb19172363ad8";
const W = (a: string) => "0x" + a.slice(2).padStart(64, "0");
const amount = (n: bigint) => "0x" + n.toString(16).padStart(64, "0");
const E18 = 10n ** 18n;

test("DexScreener: deepest pair wins, liquidity summed, socials read", () => {
  const m = parseDexTokens([
    { dexId: "uniswap", pairAddress: "0xAA", baseToken: { address: OFF.toUpperCase().replace("0X", "0x"), symbol: "OFF", name: "OffRouter" }, marketCap: 28152, liquidity: { usd: 13580 }, volume: { h24: 10 }, pairCreatedAt: 1791290883000,
      info: { imageUrl: "https://x/i.png", websites: [{ url: "https://offrouter.org" }, { url: "javascript:alert(1)" }], socials: [{ type: "twitter", url: "https://x.com/offrouter" }, { type: "telegram", url: "https://t.me/off" }] } },
    { dexId: "pons", pairAddress: "0xBB", baseToken: { address: OFF, symbol: "OFF" }, marketCap: 1, liquidity: { usd: 20 }, pairCreatedAt: 1791290000000 },
    { dexId: "x", baseToken: { address: "not-an-address" } },
  ]).get(OFF)!;
  assert.equal(m.mcUsd, 28152);
  assert.equal(m.dex, "uniswap");
  assert.equal(m.liqUsd, 13600);
  assert.equal(m.pairCreatedMs, 1791290000000);
  assert.deepEqual(m.websites, ["https://offrouter.org"]);
  assert.equal(m.xHandle, "offrouter");
  assert.equal(m.telegram, "https://t.me/off");
});

test("GeckoTerminal info: holders, top 10, dev", () => {
  const i = parseGtInfo({ data: { attributes: { holders: { count: 266, distribution_percentage: { top_10: "63.0456" } }, developer_address: DEV.toUpperCase().replace("0X", "0x"), gt_verified: true, is_honeypot: false, twitter_handle: "@offrouter", websites: ["https://offrouter.org"] } } });
  assert.deepEqual([i.holders, i.top10Pct, i.dev, i.verified, i.honeypot, i.xHandle], [266, 63.0456, DEV, true, false, "offrouter"]);
  assert.throws(() => parseGtInfo({ errors: [] }));
});

test("GeckoTerminal pool list: the side that is not WETH/USDG", () => {
  const t = parseGtPoolTokens({ data: [{ relationships: { base_token: { data: { id: `robinhood_${OFF}` } }, quote_token: { data: { id: "robinhood_0x0bd7d308f8e1639fab988df18a8011f41eacad73" } } } }] });
  assert.deepEqual(t, [OFF]);
});

test("x handle only from real profile links", () => {
  assert.equal(xHandle("https://twitter.com/abc_1?s=1"), "abc_1");
  assert.equal(xHandle("https://x.com/abc/status/1"), null);
  assert.equal(xHandle("https://evil.com/x.com/abc"), null);
});

test("Pons launch event parsed, anything else ignored", () => {
  const log = { address: LAUNCHER, topics: [LAUNCH_TOPIC, W(OFF), W(POOL), W(DEV)], blockNumber: "0x4d2" };
  assert.deepEqual(parseLaunch({ ...log, blockNumber: "0x4d2" }), { token: OFF, pool: POOL, creator: DEV, block: 1234 });
  assert.equal(parseLaunch({ ...log, address: OFF }), null);
  assert.equal(parseLaunch({ ...log, topics: log.topics.slice(0, 3) }), null);
});

test("pct of supply", () => {
  assert.equal(pct((442n * 10n ** 25n / 100n).toString(), (10n ** 27n).toString()), 4.42);
  assert.equal(pct(null, "1"), null);
  assert.equal(pct("1", "0"), null);
});

// A fake node: Transfer logs for the dev, code for one address, balances.
function fakeRpc(o: { out: [string, bigint][]; got: bigint[]; contracts: string[] }): RpcClient & { calls: RpcCall[] } {
  const calls: RpcCall[] = [];
  return {
    calls,
    async batch(cs) {
      calls.push(...cs);
      return cs.map((c): RpcResult => {
        const p = c.params[0] as any;
        if (c.method === "eth_getLogs" && p.address === LAUNCHER) return { ok: true, value: Number(p.fromBlock) > 27_500_000 || Number(p.toBlock) < 27_500_000 ? [] : [{ address: LAUNCHER, topics: [LAUNCH_TOPIC, W(OFF), W(POOL), W(DEV)], blockNumber: "0x1a39de0" }] };
        if (c.method === "eth_getLogs" && p.topics[1] === W(DEV)) return { ok: true, value: o.out.map(([to, v]) => ({ topics: [TRANSFER_TOPIC, W(DEV), W(to)], data: amount(v) })) };
        if (c.method === "eth_getLogs") return { ok: true, value: o.got.map((v) => ({ topics: [TRANSFER_TOPIC, W(POOL), W(DEV)], data: amount(v) })) };
        if (c.method === "eth_getCode") return { ok: true, value: o.contracts.includes(c.params[0] as string) ? "0x6080" : "0x" };
        if (c.method === "eth_blockNumber") return { ok: true, value: "0x1c9c380" };
        if (c.method === "eth_getBlockByNumber") return { ok: true, value: { timestamp: c.params[0] === "0x1c9c380" ? "0x2710" : "0x64" } };
        if (c.method === "eth_getStorageAt") return { ok: true, value: "0x" + "0".repeat(64) };
        if (c.method === "eth_call" && p.data === "0x18160ddd") return { ok: true, value: amount(1000n * E18) };
        if (c.method === "eth_call" && p.data.startsWith("0x70a08231")) return { ok: true, value: amount(p.data.endsWith(DEAD.slice(2)) ? 56n * E18 : 0n) };
        return { ok: false, code: 3, message: "execution reverted" };
      });
    },
  };
}

test("dev flows split burn, contract and wallet", async () => {
  const rpc = fakeRpc({ out: [[DEAD, 40n], [POOL, 5n], ["0x1111111111111111111111111111111111111111", 2n]], got: [47n], contracts: [POOL] });
  const f = await devFlows(rpc, OFF, DEV, 0, 9_999_998, async (a) => new Map(a.map((x) => [x, x === POOL])));
  assert.deepEqual([f.got, f.burn, f.toContract, f.toWallet, f.calls], [47n, 40n, 5n, 2n, 1]);
});

test("full run on SQLite: launch found, market saved, deep check fills dev numbers", async () => {
  const db = openSqlite(":memory:");
  const rpc = fakeRpc({ out: [[DEAD, 44n * E18]], got: [44n * E18], contracts: [OFF] });
  const sources: Sources = {
    async dexTokens(cas) {
      return parseDexTokens(cas.includes(OFF) ? [{ dexId: "uniswap", pairAddress: "0xaa", baseToken: { address: OFF, symbol: "OFF" }, marketCap: 28000, liquidity: { usd: 13000 }, pairCreatedAt: 5_000_000 }] : []);
    },
    async gtInfo() {
      return parseGtInfo({ data: { attributes: { holders: { count: 266, distribution_percentage: { top_10: "63" } }, developer_address: DEV } } });
    },
    async gtPoolTokens() {
      return [];
    },
    async gtMulti() {
      return new Map();
    },
  };
  const stats = await runCollect({ db, rpc, sources, now: () => 10_000_000, gtListPages: 1 });
  assert.deepEqual(stats.errors, []);
  assert.equal(stats.launchesFound, 1);
  assert.equal(stats.deepChecked, 1);
  const [c] = await readCoins(db);
  assert.equal(c.mcUsd, 28000);
  assert.equal(c.holders, 266);
  assert.equal(c.dev, DEV);
  assert.equal(c.devLaunches, 1);
  assert.equal(c.burnedPct, 5.6);
  assert.equal(c.devGotPct, 4.4);
  assert.equal(c.devBurnedPct, 4.4);
  assert.equal(c.devHoldsPct, 0);
  // A second run only reads new blocks for the dev: nothing new, numbers unchanged.
  await runCollect({ db, rpc, sources, now: () => 10_000_000 + 2 * 3600_000, gtListPages: 1 });
  assert.equal((await readCoins(db))[0].devBurnedPct, 4.4);
  assert.deepEqual([c.mcOverLiq, c.mcNotBacked], [2, false]);
  // The fake "BTC" seen live: $64T MC on $1,880 liquidity.
  await db.prepare("UPDATE coins SET mc_usd = 64093062814115, liq_usd = 1880").run();
  assert.equal((await readCoins(db))[0].mcNotBacked, true);
  db.close();
});

test("a coin under the floor is only re-priced when it shows up among the busiest pools", async () => {
  const db = openSqlite(":memory:");
  const now = 30 * 24 * 3600_000;
  const OTHER = "0x2222222222222222222222222222222222222222";
  await db.prepare("INSERT INTO coins (ca, found_via, found_ms, mc_usd, market_at_ms) VALUES (?, 'pons', 1, 100, ?)").bind(OTHER, now - 3600_000).run();
  await db.prepare("INSERT INTO cursor (name, block) VALUES ('pons', 99999999)").run();
  const sources: Sources = {
    async dexTokens(cas) {
      return parseDexTokens(cas.includes(OTHER) ? [{ dexId: "uniswap", pairAddress: "0xbb", baseToken: { address: OTHER, symbol: "BACK" }, marketCap: 50_000, liquidity: { usd: 9_000 } }] : []);
    },
    async gtInfo() {
      return parseGtInfo({ data: { attributes: {} } });
    },
    async gtPoolTokens() {
      return [OTHER];
    },
    async gtMulti() {
      return new Map();
    },
  };
  await runCollect({ db, rpc: fakeRpc({ out: [], got: [], contracts: [] }), sources, now: () => now, gtListPages: 1, deepCoins: 0 });
  const row = await db.prepare("SELECT mc_usd FROM coins WHERE ca = ?").bind(OTHER).first<{ mc_usd: number }>();
  assert.equal(row?.mc_usd, 50_000);
  db.close();
});

test("dev flows halve the block window when the node says a window holds over 10,000 logs", async () => {
  const seen: number[] = [];
  const rpc: RpcClient = {
    async batch(cs) {
      return cs.map((c): RpcResult => {
        const p = c.params[0] as any;
        const span = Number(p.toBlock) - Number(p.fromBlock) + 1;
        if (span > 3_000_000) return { ok: false, code: -32000, message: "logs matched by query exceeds limit of 10000" };
        if (p.topics[1] === W(DEV)) seen.push(span);
        return { ok: true, value: p.topics[1] === W(DEV) ? [{ topics: [TRANSFER_TOPIC, W(DEV), W(DEAD)], data: amount(1n) }] : [] };
      });
    },
  };
  const f = await devFlows(rpc, OFF, DEV, 0, 9_999_998, async () => new Map());
  assert.ok(seen.every((s) => s <= 3_000_000));
  assert.equal(f.burn, BigInt(seen.length)); // every window counted once, none skipped
  assert.equal(seen.reduce((a, b) => a + b, 0), 9_999_999);
});

test("GeckoTerminal multi: curve percent, migrated flag and curve MC", () => {
  const m = parseGtMulti({ data: [
    { attributes: { address: OFF, symbol: "KIN", launchpad_details: { graduation_percentage: 38.96, completed: false }, fdv_usd: "12116.9" } },
    { attributes: { address: DEV, symbol: "DONE", launchpad_details: { graduation_percentage: 100, completed: true, completed_at: "2026-10-06T12:48:03.000Z" }, market_cap_usd: "28188.4" } },
  ] });
  assert.deepEqual([m.get(OFF)?.bondPct, m.get(OFF)?.bonded, m.get(OFF)?.mcUsd], [38.96, false, 12116.9]);
  assert.deepEqual([m.get(DEV)?.bonded, m.get(DEV)?.bondedMs, m.get(DEV)?.mcUsd], [true, Date.parse("2026-10-06T12:48:03.000Z"), 28188.4]);
});

test("a curve coin shows on Almost bonded with its curve MC, then on Migrated with its DEX MC", async () => {
  const db = openSqlite(":memory:");
  let curve = { pct: 72, done: false };
  let dexMc: number | null = null;
  const sources: Sources = {
    async dexTokens(cas) {
      return parseDexTokens(dexMc !== null && cas.includes(OFF) ? [{ dexId: "uniswap", pairAddress: "0xcc", baseToken: { address: OFF, symbol: "KIN" }, marketCap: dexMc, liquidity: { usd: 9000 } }] : []);
    },
    async gtInfo() {
      return parseGtInfo({ data: { attributes: { holders: { count: 50, distribution_percentage: { top_10: "40" } } } } });
    },
    async gtPoolTokens() {
      return [];
    },
    async gtMulti(cas) {
      return parseGtMulti({ data: cas.includes(OFF) ? [{ attributes: { address: OFF, symbol: "KIN", launchpad_details: { graduation_percentage: curve.pct, completed: curve.done }, fdv_usd: String(12_000) } }] : [] });
    },
  };
  const rpc = fakeRpc({ out: [], got: [], contracts: [OFF] });
  await runCollect({ db, rpc, sources, now: () => 10_000_000, gtListPages: 1 });
  const [almost] = await readBoard(db, "almost");
  assert.deepEqual([almost?.ca, almost?.bondPct, almost?.bonded, almost?.mcUsd], [OFF, 72, false, 12_000]); // DexScreener had no pair: MC kept
  assert.equal(almost?.holders, 50); // over the floor, so it got the deep check too
  assert.equal((await readBoard(db, "new"))[0]?.ca, OFF);
  assert.ok(almost?.launchedMs);

  curve = { pct: 100, done: true };
  dexMc = 30_000;
  await runCollect({ db, rpc, sources, now: () => 10_000_000 + 10 * 60_000, gtListPages: 1 });
  assert.equal((await readBoard(db, "almost")).length, 0);
  const [migrated] = await readBoard(db, "migrated");
  assert.deepEqual([migrated?.ca, migrated?.bonded, migrated?.mcUsd], [OFF, true, 30_000]);
  db.close();
});
