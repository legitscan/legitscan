import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAndSave, dueForChecks, newTeamLinks, saveChecks } from "../src/check-store.ts";
import { CG_LINKS_EVERY_MS, coingeckoResult, COINGECKO_EVERY_MS, parseCoingeckoLinks, parseCoingeckoList, refreshCoingecko, refreshCoingeckoLinks } from "../src/coingecko.ts";
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
  // Same answers an hour later: one read of the stored rows, no per-coin reads or writes.
  const asked: string[] = [];
  const counting = { prepare: (sql: string) => (asked.push(sql), db.prepare(sql)) } as typeof db;
  await refreshCoingecko(counting, fetch, "demo-key", 5_000, now + COINGECKO_EVERY_MS);
  assert.equal(asked.filter((s) => /FROM checks WHERE ca = \?|INSERT INTO checks/.test(s)).length, 0, asked.join("\n"));
  const row = await db.prepare("SELECT checked_ms FROM checks WHERE ca = ? AND kind = 'coingecko'").bind(VIRTUAL).first<{ checked_ms: number }>();
  assert.equal(row?.checked_ms, now); // same answer an hour later: not written again
  const coin = ((await apiAnswer(db, `/api/coin/${VIRTUAL}`)).body as any).coin;
  assert.deepEqual([coin.checks.coingecko.status, coin.legit], ["pass", false]); // shown, not counted toward legit
  assert.equal(coin.checks.coingecko.checkedMs, now + COINGECKO_EVERY_MS); // last list read, not the stored row time
  db.close();
});

test("CoinGecko page links: website and X account, junk ignored", () => {
  assert.deepEqual(parseCoingeckoLinks({ links: { homepage: ["https://mowcat.xyz", "", ""], twitter_screen_name: "mowcatmeme" } }), { website: "https://mowcat.xyz", x: "mowcatmeme" });
  assert.deepEqual(parseCoingeckoLinks({ links: { homepage: ["", "javascript:alert(1)"], twitter_screen_name: "" } }), { website: null, x: null });
  assert.throws(() => parseCoingeckoLinks({ status: { error_code: 429 } }));
});

// MOWCAT, 17 Nov: not a Pons coin, no paid DexScreener info, so no website or X known until its CoinGecko page is read.
test("MOWCAT: CoinGecko page links count like the launch form, so website + same X = Legit", async () => {
  const MOW = "0x0b7c6c138dc75622f4200d157b13fb93e6bd94fa";
  const db = openSqlite(":memory:");
  await db.prepare("INSERT INTO coins (ca, found_via, found_ms, symbol, mc_usd) VALUES (?, 'geckoterminal', 1, 'MOWCAT', 156e6)").bind(MOW).run();
  const now = Date.UTC(2026, 10, 17, 8);
  const asked: string[] = [];
  const fetch: Fetcher = async (url) => {
    asked.push(url);
    if (url.includes("/coins/list")) return Response.json([{ id: "mowcat", symbol: "mowcat", name: "MOWCAT", platforms: { robinhood: MOW } }]);
    if (url.startsWith("https://api.coingecko.com/api/v3/coins/mowcat?")) return Response.json({ links: { homepage: ["https://mowcat.xyz"], twitter_screen_name: "mowcatmeme" } });
    if (url === "https://mowcat.xyz/") return new Response(`<a href="https://x.com/mowcatmeme">X</a> CA ${MOW}`, { headers: { "content-type": "text/html" } });
    return new Response("not found", { status: 404 });
  };
  await refreshCoingecko(db, fetch, "demo-key", 5_000, now);
  assert.equal((await dueForChecks(db, 5_000, now, 10)).length, 0); // no website known yet: nothing to read
  assert.equal(await refreshCoingeckoLinks(db, fetch, "demo-key", now, 5), 1);
  assert.equal(await refreshCoingeckoLinks(db, fetch, "demo-key", now + 60_000, 5), 0); // read about once a month
  assert.equal(await refreshCoingeckoLinks(db, fetch, "demo-key", now + CG_LINKS_EVERY_MS + 1, 5), 1);
  assert.equal(asked.filter((u) => u.includes("/coins/mowcat?")).length, 2);
  assert.deepEqual((await dueForChecks(db, 5_000, now, 10)).map((r) => r.ca), [MOW]); // queued: its links are new
  await checkAndSave(db, MOW, { fetch, now, skipGithub: true });
  const coin = ((await apiAnswer(db, `/api/coin/${MOW}`, now)).body as any).coin;
  assert.equal(coin.checks.website.status, "pass");
  assert.equal(coin.checks.xmatch.reason, "The CoinGecko page and the website both name @mowcatmeme.");
  assert.equal(coin.legitLevel, 1);
  db.close();
});

// ZEAL, 17 Nov: the X match passed before its launch form was read, and the form names another account.
test("new team links void the old X account match and queue the coin", async () => {
  const db = openSqlite(":memory:");
  const CA = "0x" + "d".repeat(40);
  await db.prepare("INSERT INTO coins (ca, found_via, found_ms, mc_usd, launch_x) VALUES (?, 'pons', 1, 4e5, 'zealthemascot')").bind(CA).run();
  const pass = { kind: "xmatch" as const, status: "pass" as const, reason: "The market listing and the website both name @ZEALZdotfun.", sourceUrl: null, atMs: null };
  await saveChecks(db, CA, [{ kind: "website", status: "pass", reason: "ok", sourceUrl: null, atMs: null }, pass], 1000);
  assert.equal((((await apiAnswer(db, `/api/coin/${CA}`, 2000)).body as any).coin).legitLevel, 1); // the stale match counts
  await newTeamLinks(db, CA, 2000, { website: null, x: "zealthemascot" });
  const coin = ((await apiAnswer(db, `/api/coin/${CA}`, 2000)).body as any).coin;
  assert.deepEqual([coin.checks.xmatch.status, coin.legitLevel], ["none", 0]);
  assert.deepEqual((await dueForChecks(db, 5_000, 2000, 10)).map((r) => r.ca), []); // no website listed: nothing to read
  const q = await db.prepare("SELECT wanted_ms FROM check_queue WHERE ca = ?").bind(CA).first<{ wanted_ms: number }>();
  assert.equal(q?.wanted_ms, 2000);
  db.close();
});

// 17 Nov: KUDO's CoinGecko page names @kudo_archi and kudo.archi, as its launch form and listing already did. Reading it
// voided the match and KUDO lost Legit for an hour. Links that repeat what was compared only queue the coin.
test("team links that repeat known ones keep the X account match; a new one voids it", async () => {
  const db = openSqlite(":memory:");
  const CA = "0x" + "f".repeat(40);
  await db
    .prepare("INSERT INTO coins (ca, found_via, found_ms, mc_usd, websites, x_handle, launch_x, cg_x, cg_website) VALUES (?, 'pons', 1, 2e5, '[\"https://www.kudo.archi/\"]', 'kudo_archi', 'kudo_archi', 'Kudo_Archi', 'https://kudo.archi')")
    .bind(CA)
    .run();
  const pass = { kind: "xmatch" as const, status: "pass" as const, reason: "The launch form, the market listing and the website all name @kudo_archi.", sourceUrl: null, atMs: null };
  await saveChecks(db, CA, [{ kind: "website", status: "pass", reason: "ok", sourceUrl: null, atMs: null }, pass], 1000);
  const level = async () => (((await apiAnswer(db, `/api/coin/${CA}`, 3000)).body as any).coin).legitLevel;
  await newTeamLinks(db, CA, 2000, { website: "https://kudo.archi", x: "Kudo_Archi" });
  assert.equal(await level(), 1); // same X and site in other spellings: kept
  const q = await db.prepare("SELECT wanted_ms FROM check_queue WHERE ca = ?").bind(CA).first<{ wanted_ms: number }>();
  assert.equal(q?.wanted_ms, 2000); // still compared again at the next check
  await db.prepare("UPDATE coins SET cg_website = 'https://kudo-new.xyz' WHERE ca = ?").bind(CA).run();
  await newTeamLinks(db, CA, 2500, { website: "https://kudo-new.xyz", x: "Kudo_Archi" });
  assert.equal(await level(), 0); // a website we never read: voided until it is read
  db.close();
});

// 17 Nov: 117 listed coins waited for their page to be read, 56 of them with the CA already on their website. Only
// those can still turn Legit through the page's X account, so they go first.
test("CoinGecko pages: coins whose website shows the CA are read first", async () => {
  const db = openSqlite(":memory:");
  const BIG = "0x" + "1".repeat(40);
  const SITE = "0x" + "2".repeat(40);
  for (const [ca, mc] of [[BIG, 9e6], [SITE, 1e5]] as const) {
    await db.prepare("INSERT INTO coins (ca, found_via, found_ms, mc_usd) VALUES (?, 'pons', 1, ?)").bind(ca, mc).run();
    await saveChecks(db, ca, [{ kind: "coingecko", status: "pass", reason: "Listed", sourceUrl: `https://www.coingecko.com/en/coins/c${ca.slice(2, 4)}`, atMs: null }], 1);
  }
  await saveChecks(db, SITE, [{ kind: "website", status: "pass", reason: "ok", sourceUrl: null, atMs: null }], 1);
  const asked: string[] = [];
  const fetch: Fetcher = async (url) => {
    asked.push(url);
    return Response.json({ links: { homepage: [], twitter_screen_name: "" } });
  };
  assert.equal(await refreshCoingeckoLinks(db, fetch, "demo-key", Date.UTC(2026, 10, 17), 1), 1);
  assert.match(asked[0], /\/coins\/c22\?/); // the small coin with its CA on its site, before the big one
  db.close();
});
