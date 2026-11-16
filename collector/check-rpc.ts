// Tests every RPC node (project .env, then ~/.config/tech-coin/secrets.env) without printing its URL (URLs carry API keys): node check-rpc.ts
// For each node: does it answer, how fast, and can it read OLD logs (needed for LOGS_RPC_URLS).
import { createRpcClient } from "./src/contract-facts.ts";
import { LAUNCHER, LAUNCH_TOPIC } from "./src/chain-reads.ts";
import { loadKeys, rpcNodes } from "./src/rpc-pool.ts";

loadKeys(new URL(".env", import.meta.url));
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const nodes = rpcNodes();
const urls = [...new Set([...nodes.all, ...nodes.logs])];

for (const [i, url] of urls.entries()) {
  const name = `node ${i + 1} (${new URL(url).host})`;
  const rpc = createRpcClient({ url, fetch: (input, init) => fetch(input, init), sleep });
  try {
    const t0 = Date.now();
    const [head] = await rpc.batch([{ method: "eth_blockNumber", params: [] }]);
    if (!head.ok) throw new Error(head.message);
    const n = Number.parseInt(String(head.value), 16);
    const ms = Date.now() - t0;
    // 1M blocks around the busiest Pons period: the public node returns logs here.
    const [logs] = await rpc.batch([{ method: "eth_getLogs", params: [{ address: LAUNCHER, topics: [LAUNCH_TOPIC], fromBlock: "0x" + (40_000_000).toString(16), toBlock: "0x" + (40_100_000).toString(16) }] }]);
    const old = logs.ok && Array.isArray(logs.value) ? `yes (${logs.value.length} logs)` : `no (${logs.ok ? "not a list" : logs.message.slice(0, 80)})`;
    console.log(`${name}: block ${n}, ${ms} ms, old logs: ${old}`);
  } catch (e) {
    console.log(`${name}: FAILED ${(e as Error).message.slice(0, 120)}`);
  }
}
