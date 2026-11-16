// Reads from the Robinhood Chain RPC: Pons launches, the dev wallet's token flows, burned supply.
// The public node keeps no old state (no archive), so everything here comes from event logs plus today's state.
// Tested live 2026-11-16: getLogs allows 9,999,999 blocks and 10,000 logs per call; it answers 429 when pushed.
import type { RpcClient } from "./contract-facts.ts";
import { HttpError } from "./http-json.ts";

export const LAUNCHER = "0xe33e9e479df8802cb0866d5d05258bec4cf62948"; // Pons, same as reinkeep-data
export const LAUNCH_TOPIC = "0xdcacba5e347ae7abd91cb519eb877af8fa7774e347b85dd3ddcd24a2ba8cdf37"; // topic1 token, topic2 pool, topic3 creator
export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export const MAX_SPAN = 9_999_999;
// The node's answer when a window holds over 10,000 logs or 9,999,999 blocks: retry with a smaller window.
const tooManyLogs = (message: string) => /exceeds limit|narrow/i.test(message);
const DEAD = "0x000000000000000000000000000000000000dead";
const ZERO = "0x0000000000000000000000000000000000000000";
const BURN = new Set([DEAD, ZERO]);

const hex = (n: number) => "0x" + n.toString(16);
const word = (a: string) => "0x" + a.slice(2).padStart(64, "0");
const isObj = (v: unknown): v is Record<string, any> => typeof v === "object" && v !== null && !Array.isArray(v);
const WORD_ADDRESS = /^0x0{24}([0-9a-fA-F]{40})$/;
const topicAddr = (t: unknown) => {
  const m = typeof t === "string" ? t.match(WORD_ADDRESS) : null;
  return m ? "0x" + m[1].toLowerCase() : null;
};
const toNum = (v: unknown) => (typeof v === "string" && /^0x[0-9a-f]+$/i.test(v) ? Number.parseInt(v, 16) : null);
const toBig = (v: unknown) => (typeof v === "string" && /^0x[0-9a-f]+$/i.test(v) ? BigInt(v) : null);

async function one(rpc: RpcClient, method: string, params: unknown[]): Promise<unknown> {
  const [r] = await rpc.batch([{ method, params }]);
  if (!r.ok) throw new HttpError(200, `${method}: ${r.message.slice(0, 160)}`);
  return r.value;
}

export type ChainClock = { head: number; headMs: number; blocksPerMs: number };

// Newest block plus the chain's pace, measured over the last 9,999,999 blocks, to turn a time into a block estimate.
export async function chainClock(rpc: RpcClient): Promise<ChainClock> {
  const head = toNum(await one(rpc, "eth_blockNumber", []));
  if (head === null) throw new HttpError(200, "could not read the newest block");
  const back = Math.max(1, head - MAX_SPAN);
  const [a, b] = await rpc.batch([
    { method: "eth_getBlockByNumber", params: [hex(head), false] },
    { method: "eth_getBlockByNumber", params: [hex(back), false] },
  ]);
  const ta = a.ok && isObj(a.value) ? toNum(a.value.timestamp) : null;
  const tb = b.ok && isObj(b.value) ? toNum(b.value.timestamp) : null;
  if (!ta || !tb || ta <= tb) throw new HttpError(200, "could not read block times");
  return { head, headMs: ta * 1000, blocksPerMs: (head - back) / ((ta - tb) * 1000) };
}

export function timeAt(clock: ChainClock, block: number): number {
  return Math.round(clock.headMs - (clock.head - block) / clock.blocksPerMs);
}

export function blockAt(clock: ChainClock, ms: number): number {
  return Math.max(0, Math.min(clock.head, Math.round(clock.head - (clock.headMs - ms) * clock.blocksPerMs)));
}

export type Launch = { token: string; pool: string; creator: string; block: number };

export function parseLaunch(log: unknown): Launch | null {
  if (!isObj(log) || String(log.address).toLowerCase() !== LAUNCHER) return null;
  const t = log.topics;
  if (!Array.isArray(t) || t.length !== 4 || String(t[0]).toLowerCase() !== LAUNCH_TOPIC) return null;
  const [token, pool, creator] = [topicAddr(t[1]), topicAddr(t[2]), topicAddr(t[3])];
  const block = toNum(log.blockNumber);
  return token && pool && creator && block ? { token, pool, creator, block } : null;
}

// Pons launches after `fromBlock`, walking forward. The span grows while windows are light and halves when the node
// says a window holds over 10,000 logs. Stops at the head or after maxCalls, and returns where it got to.
export async function scanLaunches(rpc: RpcClient, fromBlock: number, head: number, maxCalls: number): Promise<{ launches: Launch[]; scannedTo: number; calls: number }> {
  let from = fromBlock;
  let span = 2_000_000;
  let calls = 0;
  const launches: Launch[] = [];
  while (from <= head && calls < maxCalls) {
    const to = Math.min(head, from + span - 1);
    const [r] = await rpc.batch([{ method: "eth_getLogs", params: [{ address: LAUNCHER, topics: [LAUNCH_TOPIC], fromBlock: hex(from), toBlock: hex(to) }] }]);
    calls++;
    if (!r.ok) {
      if (tooManyLogs(r.message) && span > 1000) {
        span = Math.floor(span / 2);
        continue;
      }
      throw new HttpError(200, `launch getLogs ${from}-${to}: ${r.message.slice(0, 160)}`);
    }
    const logs = Array.isArray(r.value) ? r.value : [];
    for (const l of logs) {
      const p = parseLaunch(l);
      if (p) launches.push(p);
    }
    from = to + 1;
    if (logs.length < 2_500) span = Math.min(MAX_SPAN, span * 2);
  }
  return { launches, scannedTo: from - 1, calls };
}

export type Flows = { got: bigint; burn: bigint; toContract: bigint; toWallet: bigint };

// Everything the dev wallet received and sent of this token in [from, to]. Outgoing amounts are split by where they
// went: burn address, a contract (pool, router: mostly sells or adding liquidity), or another wallet.
// isContract is asked once per new destination and cached by the caller.
export async function devFlows(rpc: RpcClient, token: string, dev: string, from: number, to: number, isContract: (addrs: string[]) => Promise<Map<string, boolean>>): Promise<Flows & { calls: number }> {
  const f: Flows = { got: 0n, burn: 0n, toContract: 0n, toWallet: 0n };
  const out = new Map<string, bigint>();
  let calls = 0;
  // A busy dev wallet can have over 10,000 transfers in one window (seen live 2026-11-16): halve the window and retry.
  let span = MAX_SPAN;
  for (let lo = from; lo <= to; ) {
    const hi = Math.min(to, lo + span - 1);
    const range = { address: token, fromBlock: hex(lo), toBlock: hex(hi) };
    const [sent, got] = await rpc.batch([
      { method: "eth_getLogs", params: [{ ...range, topics: [TRANSFER_TOPIC, word(dev)] }] },
      { method: "eth_getLogs", params: [{ ...range, topics: [TRANSFER_TOPIC, null, word(dev)] }] },
    ]);
    calls++;
    if (!sent.ok || !got.ok || !Array.isArray(sent.value) || !Array.isArray(got.value)) {
      const why = !sent.ok ? sent.message : !got.ok ? got.message : "not a list";
      if (tooManyLogs(why) && span > 1000) {
        span = Math.floor(span / 2);
        continue;
      }
      throw new HttpError(200, `dev getLogs ${lo}-${hi}: ${why.slice(0, 160)}`);
    }
    lo = hi + 1;
    for (const l of got.value) f.got += toBig(isObj(l) ? l.data : null) ?? 0n;
    for (const l of sent.value) {
      const toAddr = isObj(l) && Array.isArray(l.topics) ? topicAddr(l.topics[2]) : null;
      const amount = toBig(isObj(l) ? l.data : null);
      if (toAddr && amount !== null) out.set(toAddr, (out.get(toAddr) ?? 0n) + amount);
    }
  }
  const others = [...out.keys()].filter((a) => !BURN.has(a));
  const kind = others.length ? await isContract(others) : new Map<string, boolean>();
  for (const [a, amount] of out) {
    if (BURN.has(a)) f.burn += amount;
    else if (kind.get(a)) f.toContract += amount;
    else f.toWallet += amount;
  }
  return { ...f, calls };
}

// Has code = contract. Up to 10 addresses per request.
export async function codeCheck(rpc: RpcClient, addrs: string[]): Promise<Map<string, boolean>> {
  const res = new Map<string, boolean>();
  for (let i = 0; i < addrs.length; i += 10) {
    const part = addrs.slice(i, i + 10);
    const answers = await rpc.batch(part.map((a) => ({ method: "eth_getCode", params: [a, "latest"] })));
    part.forEach((a, j) => {
      const r = answers[j];
      if (r.ok && typeof r.value === "string") res.set(a, r.value.length > 2);
    });
  }
  return res;
}

const BALANCE_OF = "0x70a08231";
// balanceOf for each holder, in one request. null where the call failed.
export async function balances(rpc: RpcClient, token: string, holders: string[]): Promise<(bigint | null)[]> {
  const answers = await rpc.batch(holders.map((h) => ({ method: "eth_call", params: [{ to: token, data: BALANCE_OF + h.slice(2).padStart(64, "0") }, "latest"] })));
  return answers.map((r) => (r.ok ? toBig(r.value) : null));
}

export const BURN_HOLDERS = [DEAD, ZERO];
