// The scheduled run on GitHub Actions (every 5 minutes), writing to Cloudflare D1 over its REST API.
// GitHub, not Cloudflare, because DexScreener and GeckoTerminal answer 429 to Cloudflare's shared addresses (PLAN 3.1).
// Env (GitHub secrets): CLOUDFLARE_ACCOUNT_ID, D1_DATABASE_ID, CLOUDFLARE_API_TOKEN. Optional: RPC_URLS, LOGS_RPC_URLS (comma lists), BACKFILL=1.
import { runCollect } from "./src/collect-run.ts";
import { createRpcPool, rpcNodes } from "./src/rpc-pool.ts";
import { createD1Rest } from "./src/d1-rest.ts";
import { createSources, paced } from "./src/market-sources.ts";

const need = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
};
const db = createD1Rest({ accountId: need("CLOUDFLARE_ACCOUNT_ID"), databaseId: need("D1_DATABASE_ID"), apiToken: need("CLOUDFLARE_API_TOKEN") });
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const net = (input: string, init?: RequestInit) => fetch(input, init);
const nodes = rpcNodes();
const backfill = process.env.BACKFILL === "1";
const t0 = Date.now();

const run = await db.prepare("INSERT INTO runs (started_ms) VALUES (?) RETURNING id").bind(t0).first<{ id: number }>();
const stats = await runCollect({
  db,
  rpc: createRpcPool(nodes.all, () => paced(net, 400, sleep, Date.now), sleep),
  logsRpc: createRpcPool(nodes.logs, () => paced(net, 1000, sleep, Date.now), sleep),
  sources: createSources({ dexFetch: paced(net, 250, sleep, Date.now), gtFetch: paced(net, 2300, sleep, Date.now), sleep }),
  now: Date.now,
  launchCalls: backfill ? 200 : 3,
  dexBatches: backfill ? 600 : 20,
  deepCoins: backfill ? 60 : 15, // ~140 coins at/above the floor, each re-checked hourly = ~12 per run
  log: (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}`),
});
await db.prepare("UPDATE runs SET finished_ms = ?, stats = ? WHERE id = ?").bind(Date.now(), JSON.stringify(stats).slice(0, 4000), run?.id ?? 0).run();
console.log(JSON.stringify({ seconds: Math.round((Date.now() - t0) / 1000), ...stats }, null, 2));
