// Several RPC nodes behind one client: each request goes to the next node in turn, and if a node fails (429 after its
// retries, an outage, a refused batch) the same request moves on to the next node. More nodes = more requests per
// minute before anyone says "slow down".
// URLs often carry an API key, so they are never logged: errors name a node by its position ("node 2").
import { createRpcClient, type RpcClient } from "./contract-facts.ts";
import { BudgetExhausted, type Fetcher, type Sleep } from "./http-json.ts";

// newFetch is called once per node, so each node gets its own pacing.
export function createRpcPool(urls: string[], newFetch: () => Fetcher, sleep: Sleep): RpcClient {
  if (!urls.length) throw new Error("no RPC URL given");
  const nodes = urls.map((url) => createRpcClient({ url, fetch: newFetch(), sleep }));
  let next = 0;
  return {
    async batch(calls) {
      const start = next++ % nodes.length;
      const problems: string[] = [];
      for (let i = 0; i < nodes.length; i++) {
        const n = (start + i) % nodes.length;
        try {
          return await nodes[n].batch(calls);
        } catch (e) {
          if (e instanceof BudgetExhausted) throw e;
          problems.push(`node ${n + 1}: ${(e as Error).message.slice(0, 120)}`);
        }
      }
      throw new Error(`every RPC node failed: ${problems.join("; ")}`);
    },
  };
}

export const PUBLIC_RPC = "https://rpc.mainnet.chain.robinhood.com";

// "a,b , c" -> ["a","b","c"]; the public node when nothing is set.
export function rpcUrls(value: string | undefined): string[] {
  const list = (value ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.length ? list : [PUBLIC_RPC];
}

// Keys for local runs: this project's .env first, then the owner's global file shared by every project
// (~/.config/tech-coin/secrets.env). A value already set wins. Neither file is ever printed.
export function loadKeys(projectEnv: URL): void {
  for (const file of [projectEnv.pathname, `${process.env.HOME}/.config/tech-coin/secrets.env`]) {
    try {
      process.loadEnvFile(file);
    } catch {
      // file not there
    }
  }
}

// Which nodes to use. RPC_URLS / LOGS_RPC_URLS win when set (GitHub secrets). Otherwise the global keys:
// Chainstack + Alchemy + public for normal reads; old logs from the public node only (Chainstack's free plan reads
// ~10 recent blocks; add Alchemy to LOGS_RPC_URLS once check-rpc.ts shows it can).
export function rpcNodes(env = process.env): { all: string[]; logs: string[] } {
  const named = [env.ROBINHOOD_RPC_CHAINSTACK, env.ROBINHOOD_RPC_ALCHEMY].map((s) => s?.trim()).filter((s): s is string => !!s);
  return {
    all: env.RPC_URLS ? rpcUrls(env.RPC_URLS) : [...named, PUBLIC_RPC],
    logs: rpcUrls(env.LOGS_RPC_URLS),
  };
}
