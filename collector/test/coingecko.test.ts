import { test } from "node:test";
import assert from "node:assert/strict";
import { coingeckoResult, COINGECKO_EVERY_MS, parseCoingeckoList, refreshCoingecko } from "../src/coingecko.ts";
import type { Fetcher } from "../src/http-json.ts";
import { apiAnswer } from "../src/read-coins.ts";
import { openSqlite } from "../src/sqlite-adapter.ts";

const VIRTUAL = "0xc6911796042b15d7fa4f6cde69e245ddcd3d9c31";
const VRAX = "0x" + "a".repeat(40);
const VRAX2 = "0x" + "b".repeat(40);
const NEW = "0x" + "c".repeat(40);
const LIST = [
  { id: "virtual-protocol", symbol: "virtual", name: "Virtuals Protocol", platforms: { base: "0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b", robinhood: VIRTUAL.toUpperCase().replace("0X", "0x") } },
  { id: "commander-vrax", symbol: "vrax", name: "Commander Vrax", platforms: { robinhood: VRAX } },
  { id: "commander-vrax-2", symbol: "vrax", name: "Commander Vrax", platforms: { robinhood: VRAX2 } },
  { id: "bitcoin", symbol: "btc", name: "Bitcoin", platforms: {} },
  { id: "bad", symbol: "x", platforms: { robinhood: "not-an-address" } },
];

test("CoinGecko: Robinhood contracts only, listed / shared ticker / not listed yet", () => {
  const list = parseCoingeckoList(LIST);
  assert.equal(list.size, 3);
  const v = coingeckoResult(VIRTUAL, list);
  assert.deepEqual([v.status, v.sourceUrl], ["pass", "https://www.coingecko.com/en/coins/virtual-protocol"]);
  assert.equal(v.reason, "Listed on CoinGecko as Virtuals Protocol (virtual-protocol).");
  assert.match(coingeckoResult(VRAX2, list).reason, /also lists 1 other Robinhood Chain contract with the ticker VRAX/);
  assert.equal(coingeckoResult(NEW, list).status, "none"); // never "fail": new coins wait for a listing
  assert.throws(() => parseCoingeckoList({ error: "rate limited" }));
});

test("CoinGecko refresh: once an hour, key sent as a header, unchanged answers not rewritten", async () => {
  const db = openSqlite(":memory:");
  for (const [ca, mc] of [[VIRTUAL, 289e6], [NEW, 9000], [VRAX, 100]] as const) {
    await db.prepare("INSERT INTO coins (ca, found_via, found_ms, mc_usd) VALUES (?, 'pons', 1, ?)").bind(ca, mc).run();
  }
  const keys: (string | null)[] = [];
  const fetch: Fetcher = async (_url, init) => {
    keys.push(new Headers(init?.headers).get("x-cg-demo-api-key"));
    return new Response(JSON.stringify(LIST), { headers: { "content-type": "application/json" } });
  };
  const now = Date.UTC(2026, 10, 17, 5);
  assert.deepEqual(await refreshCoingecko(db, fetch, "demo-key", 5_000, now), { listed: 3, compared: 2 }); // VRAX is under the floor
  assert.equal(await refreshCoingecko(db, fetch, "demo-key", 5_000, now + 60_000), null); // not due yet
  assert.deepEqual(keys, ["demo-key"]);
  await refreshCoingecko(db, fetch, "demo-key", 5_000, now + COINGECKO_EVERY_MS);
  const row = await db.prepare("SELECT checked_ms FROM checks WHERE ca = ? AND kind = 'coingecko'").bind(VIRTUAL).first<{ checked_ms: number }>();
  assert.equal(row?.checked_ms, now); // same answer an hour later: not written again
  const coin = ((await apiAnswer(db, `/api/coin/${VIRTUAL}`)).body as any).coin;
  assert.deepEqual([coin.checks.coingecko.status, coin.legit], ["pass", false]); // shown, not counted toward legit
  assert.equal(coin.checks.coingecko.checkedMs, now + COINGECKO_EVERY_MS); // last list read, not the stored row time
  db.close();
});
