// One collector run on this Mac against the real network, saved to data/legitscan.sqlite (git-ignored).
//   node run-local.ts            one run with the normal limits
//   node run-local.ts --backfill one long run: every Pons launch, 18,000 markets, 40 deep checks
//   node run-local.ts --sweep    price every known coin once (~1 hour for 486k), then 60 deep checks
//   node run-local.ts --report   print the coins at/above $5k MC without collecting
import { mkdirSync } from "node:fs";
import { runCollect } from "./src/collect-run.ts";
import { readCoins } from "./src/read-coins.ts";
import { createRpcPool, loadKeys, rpcNodes } from "./src/rpc-pool.ts";
import { createSources, paced } from "./src/market-sources.ts";
import { openSqlite } from "./src/sqlite-adapter.ts";

loadKeys(new URL(".env", import.meta.url)); // owner-filled, never printed
const nodes = rpcNodes();
const dir = new URL("./data/", import.meta.url);
mkdirSync(dir, { recursive: true });
const db = openSqlite(new URL("legitscan.sqlite", dir).pathname);
const arg = process.argv[2];
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const net = (input: string, init?: RequestInit) => fetch(input, init);

if (arg !== "--report") {
  const backfill = arg === "--backfill" || arg === "--sweep";
  const t0 = Date.now();
  const stats = await runCollect({
    db,
    rpc: createRpcPool(nodes.all, () => paced(net, 400, sleep, Date.now), sleep),
    logsRpc: createRpcPool(nodes.logs, () => paced(net, 1000, sleep, Date.now), sleep),
    sources: createSources({ dexFetch: paced(net, 250, sleep, Date.now), gtFetch: paced(net, 2300, sleep, Date.now), sleep }),
    now: Date.now,
    launchCalls: backfill ? 200 : 3,
    dexBatches: arg === "--sweep" ? 17_000 : backfill ? 600 : 20,
    deepCoins: arg === "--sweep" ? 60 : backfill ? 40 : 15,
    checkFetch: net,
    checkCoins: 100, // 17 Nov: 223 coins waited at 25 a run; a run is ~5 min of a 20-min limit
    githubToken: process.env.GITHUB_TOKEN,
    xBearer: process.env.X_BEARER_TOKEN, // paid X API, empty until the owner buys credit and sets the secret
    coingeckoKey: process.env.COINGECKO_API_KEY, // free Demo key, set by the owner
    log: (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}`),
  });
  console.log(JSON.stringify({ seconds: Math.round((Date.now() - t0) / 1000), ...stats, errors: stats.errors.slice(0, 10) }, null, 2));
}

const n = (await db.prepare("SELECT count(*) AS total, sum(mc_usd >= 5000) AS mc5k, sum(info_at_ms IS NOT NULL AND mc_usd >= 5000) AS deep FROM coins").first()) as any;
console.log(`coins known: ${n.total}, MC >= $5k: ${n.mc5k}, deep-checked: ${n.deep}`);
const f = (v: number | null, suffix = "") => (v === null || v === undefined ? "-" : `${Math.round(v * 100) / 100}${suffix}`);
for (const c of await readCoins(db, 5000, 25)) {
  console.log(
    [
      (c.symbol ?? "?").padEnd(10),
      `$${Math.round(c.mcUsd ?? 0).toLocaleString("en-US")}`.padStart(12),
      `icon ${c.icon ? "y" : "n"}`,
      `holders ${f(c.holders)}`,
      `top10 ${f(c.top10Pct, "%")}`,
      `burned ${f(c.burnedPct, "%")}`,
      `dev launches ${f(c.devLaunches)}`,
      `dev got ${f(c.devGotPct, "%")}`,
      `burn ${f(c.devBurnedPct, "%")}`,
      `->contract ${f(c.devToContractPct, "%")}`,
      `->wallet ${f(c.devToWalletPct, "%")}`,
      `holds ${f(c.devHoldsPct, "%")}`,
      `powers ${c.powers ? c.powers.join("+") || "none" : "-"}`,
      c.error ? `ERR ${c.error.slice(0, 60)}` : "",
    ].join("  "),
  );
}
db.close();
