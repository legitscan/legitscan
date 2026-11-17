import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeFunctionData, parseAbi } from "viem";
import type { Fetcher } from "../src/http-json.ts";
import { apiAnswer } from "../src/read-coins.ts";
import { PUBLIC_RPC } from "../src/rpc-pool.ts";
import { SCAN_COOLDOWN_MS, SCANS_PER_HOUR, scanAnswer } from "../src/scan.ts";
import { openSqlite } from "../src/sqlite-adapter.ts";

const CA = "0x" + "4e".repeat(20);
const ZERO = "0x0000000000000000000000000000000000000000";
const B32 = ("0x" + "11".repeat(32)) as `0x${string}`;
const TX = "0x" + "ab".repeat(32);
const NOW = Date.UTC(2026, 10, 17, 6);
const ABI = parseAbi(["function launchAndBuy((string,string,string,string,(string,string,string,string,string),address,uint16,bool,bytes32,bytes32),uint256,address,uint256,uint256,address,address[])"]);
const INPUT = encodeFunctionData({
  abi: ABI,
  functionName: "launchAndBuy",
  args: [["NewCoin", "NEW", "ipfs://x", "An agent that ships.", ["https://x.com/newcoin", "", "", "https://new.fun", ""], ZERO, 0, false, B32, B32], 0n, ZERO, 0n, 0n, ZERO, []],
});

// The chain (launch event + launch tx), the coin's site, and RDAP, all offline. Counts each request.
function world() {
  const asked: string[] = [];
  const fetch: Fetcher = async (url, init) => {
    asked.push(url);
    if (url === PUBLIC_RPC) {
      const calls = JSON.parse(String(init?.body)) as { id: number; method: string }[];
      return Response.json(calls.map((c) => ({ jsonrpc: "2.0", id: c.id, result: c.method === "eth_getLogs" ? [{ transactionHash: TX }] : { input: INPUT } })));
    }
    if (url === "https://new.fun/") return new Response(`<a href="https://x.com/newcoin">x</a> CA ${CA}`, { headers: { "content-type": "text/html" } });
    return new Response("not found", { status: 404 });
  };
  return { fetch, asked };
}

test("scan: a brand-new coin is read from its launch form and checked at once, then rests 10 minutes", async () => {
  const db = openSqlite(":memory:");
  await db.prepare("INSERT INTO coins (ca, found_via, found_ms, symbol, mc_usd, launch_block, launched_ms) VALUES (?, 'pons', 1, 'NEW', 3000, 100, ?)").bind(CA, NOW - 60_000).run();
  const w = world();
  const env = { db, fetch: w.fetch, now: NOW, ip: "1.2.3.4" };

  assert.equal((await scanAnswer("0x12", env)).status, 400);
  assert.equal((await scanAnswer("0x" + "99".repeat(20), env)).status, 404);
  const first = await scanAnswer(CA.toUpperCase().replace("0X", "0x"), env);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.scanned, true);

  const coin = ((await apiAnswer(db, `/api/coin/${CA}`, NOW)).body as any).coin;
  assert.deepEqual(coin.launchForm, { description: "An agent that ships.", website: "https://new.fun", x: "newcoin", telegram: null, github: null });
  assert.equal(coin.checks.website.status, "pass"); // the launch form's site shows the CA
  assert.equal(coin.checks.xmatch.status, "pass"); // launch form and website both name @newcoin
  assert.equal(coin.checks.github, null); // GitHub waits for the collector
  assert.equal(coin.legitLevel, 1); // website + the launch form's X is the one the site links
  const queued = await db.prepare("SELECT wanted_ms FROM check_queue WHERE ca = ?").bind(CA).first<{ wanted_ms: number }>();
  assert.equal(queued?.wanted_ms, NOW);

  const before = w.asked.length;
  const again = await scanAnswer(CA, { ...env, now: NOW + SCAN_COOLDOWN_MS - 1 });
  assert.deepEqual([again.status, again.body.scanned], [200, false]);
  assert.equal(w.asked.length, before, "a scan inside the cooldown makes no request");

  for (let i = 0; i < SCANS_PER_HOUR; i++) await db.prepare("INSERT INTO scans (ip_hash, at_ms) SELECT ip_hash, ? FROM scans LIMIT 1").bind(NOW).run();
  assert.equal((await scanAnswer(CA, { ...env, now: NOW + SCAN_COOLDOWN_MS + 1 })).status, 429);
  db.close();
});
