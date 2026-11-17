// Reads from the Robinhood Chain RPC: Pons launches, the dev wallet's token flows, burned supply.
// The public node keeps no old state (no archive), so everything here comes from event logs plus today's state.
// Tested live 2026-11-16: getLogs allows 9,999,999 blocks and 10,000 logs per call; it answers 429 when pushed.
import { decodeFunctionData, parseAbi } from "viem";
import { decodeText, type RpcClient } from "./contract-facts.ts";
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

export type Launch = { token: string; pool: string; creator: string; block: number; tx: string | null };

export function parseLaunch(log: unknown): Launch | null {
  if (!isObj(log) || String(log.address).toLowerCase() !== LAUNCHER) return null;
  const t = log.topics;
  if (!Array.isArray(t) || t.length !== 4 || String(t[0]).toLowerCase() !== LAUNCH_TOPIC) return null;
  const [token, pool, creator] = [topicAddr(t[1]), topicAddr(t[2]), topicAddr(t[3])];
  const block = toNum(log.blockNumber);
  const tx = typeof log.transactionHash === "string" && /^0x[0-9a-fA-F]{64}$/.test(log.transactionHash) ? log.transactionHash : null;
  return token && pool && creator && block ? { token, pool, creator, block, tx } : null;
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

// Pons bonding curve. Measured 2026-11-16 on 30 live pools against GeckoTerminal: a pool starts holding the whole supply
// against PONS_VIRTUAL_ETH of virtual ETH (constant product) and migrates once 2.5x that is raised. With h = share of the
// supply still in the pool: filled % = (1/h - 1) / 2.5 and MC = virtual ETH / h^2. A migrated coin's pool is empty.
export const PONS_VIRTUAL_ETH = 1.635; // median over 30 coins of GeckoTerminal MC / ETH price x h^2
const PONS_RAISE_X = 2.5;

export type CurveRead = { bondPct: number; bonded: boolean; mcEth: number | null };

export function curveFromPool(poolHolds: bigint, supply: bigint): CurveRead | null {
  if (supply <= 0n || poolHolds > supply) return null;
  if (poolHolds === 0n) return { bondPct: 100, bonded: true, mcEth: null };
  const h = Number((poolHolds * 1_000_000_000n) / supply) / 1_000_000_000;
  const filled = Math.min(100, ((1 / h - 1) / PONS_RAISE_X) * 100);
  return { bondPct: Math.round(filled * 100) / 100, bonded: false, mcEth: PONS_VIRTUAL_ETH / (h * h) };
}

const SYMBOL = "0x95d89b41";
const NAME = "0x06fdde03";
const TOTAL_SUPPLY = "0x18160ddd";

// Curve state of Pons coins: tokens left in each pool, one eth_call per coin per run. Total supply, symbol() and name()
// are read only the first time (supply: null); the caller stores them. Nodes take at most 10 calls per batch.
export async function readCurves(rpc: RpcClient, coins: { ca: string; pool: string; supply: bigint | null }[]) {
  const call = (to: string, data: string) => ({ method: "eth_call", params: [{ to, data }, "latest"] });
  const calls = coins.flatMap((c) => [
    call(c.ca, BALANCE_OF + c.pool.slice(2).padStart(64, "0")),
    ...(c.supply === null ? [call(c.ca, TOTAL_SUPPLY), call(c.ca, SYMBOL), call(c.ca, NAME)] : []),
  ]);
  const answers = [];
  for (let i = 0; i < calls.length; i += 10) answers.push(...(await rpc.batch(calls.slice(i, i + 10))));
  const out = new Map<string, CurveRead & { supply: bigint; symbol: string | null; name: string | null }>();
  let k = 0;
  for (const c of coins) {
    const held = answers[k++];
    const [total, sym, name] = c.supply === null ? [answers[k++], answers[k++], answers[k++]] : [null, null, null];
    const supply = c.supply ?? (total?.ok ? toBig(total.value) : null);
    const holds = held.ok ? toBig(held.value) : null;
    const curve = holds !== null && supply !== null ? curveFromPool(holds, supply) : null;
    if (curve && supply !== null) out.set(c.ca, { ...curve, supply, symbol: sym?.ok ? decodeText(sym.value) : null, name: name?.ok ? decodeText(name.value) : null });
  }
  return out;
}

// Who launched a token that did not come through Pons: the sender of the transaction that first minted it (the first
// Transfer from 0x0). A direct deploy mints in the constructor, so that is the deployer; a launchpad factory mints in
// the user's call, so that is the user.
// Walks FORWARD from `from`, one window at a time: the first window holding any mint holds the earliest one, so no
// guess about where to stop. `from` should sit before the token existed: callers start well before its first pool
// (that time is an estimate, off by an hour on 17 Nov) or at block 0 when the pool time is unknown or older than the
// chain's own clock (CASHCAT: DexScreener says 18 Jun).
export async function findCreator(logsRpc: RpcClient, rpc: RpcClient, token: string, from: number, head: number, maxCalls = 14): Promise<{ creator: string; block: number; calls: number } | null> {
  let calls = 0;
  let span = MAX_SPAN;
  let first: { block: number; tx: string } | undefined;
  for (let lo = Math.max(0, from); lo <= head && calls < maxCalls; ) {
    const hi = Math.min(head, lo + span - 1);
    const [r] = await logsRpc.batch([{ method: "eth_getLogs", params: [{ address: token, topics: [TRANSFER_TOPIC, word(ZERO)], fromBlock: hex(lo), toBlock: hex(hi) }] }]);
    calls++;
    if (!r.ok || !Array.isArray(r.value)) {
      const why = r.ok ? "not a list" : r.message;
      if (tooManyLogs(why) && span > 1000) {
        span = Math.floor(span / 2);
        continue;
      }
      throw new HttpError(200, `mint getLogs ${lo}-${hi}: ${why.slice(0, 160)}`);
    }
    first = r.value
      .map((l) => ({ block: toNum(isObj(l) ? l.blockNumber : null), tx: isObj(l) && typeof l.transactionHash === "string" ? l.transactionHash : null }))
      .filter((l): l is { block: number; tx: string } => l.block !== null && l.tx !== null)
      .sort((a, b) => a.block - b.block)[0];
    if (first) break;
    lo = hi + 1;
  }
  if (!first) return null;
  const tx = await one(rpc, "eth_getTransactionByHash", [first.tx]);
  calls++;
  const sender = isObj(tx) && typeof tx.from === "string" && /^0x[0-9a-fA-F]{40}$/.test(tx.from) ? tx.from.toLowerCase() : null;
  return sender ? { creator: sender, block: first.block, calls } : null;
}

// What the dev typed into the Pons launch form, read from the launch transaction (17 Nov: 59 of 60 recent launches
// called launchAndBuy, whose ABI is verified; 45 of 60 gave a website, 52 an X account). The form is self-declared,
// like a DexScreener listing: it says where to look, the website check decides.
const LAUNCH_ABI = parseAbi([
  "function launchAndBuy((string,string,string,string,(string,string,string,string,string),address,uint16,bool,bytes32,bytes32),uint256,address,uint256,uint256,address,address[])",
]);
export type LaunchInfo = { description: string | null; website: string | null; x: string | null; telegram: string | null; github: string | null };

// Sorts the form's links by what they point at, so the order of the five social slots does not matter.
export function sortLinks(links: string[], description: string | null): LaunchInfo {
  const out: LaunchInfo = { description, website: null, x: null, telegram: null, github: null };
  for (const raw of links) {
    const u = raw.trim();
    if (!/^https?:\/\/[^\s]+$/i.test(u) || u.length > 300) continue;
    const x = u.match(/^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/?(?:[?#].*)?$/i);
    if (x) out.x ??= x[1];
    else if (/^https?:\/\/(?:www\.)?t(?:elegram)?\.me\//i.test(u)) out.telegram ??= u;
    else if (/^https?:\/\/(?:www\.)?github\.com\//i.test(u)) out.github ??= u;
    else if (!/^https?:\/\/(?:www\.)?(?:discord\.(?:gg|com)|(?:x|twitter)\.com)\//i.test(u)) out.website ??= u;
  }
  return out;
}

// launchAndBuy decoded by its ABI; any other launch call (1 in 60 used an unlisted function) falls back to the
// http(s) links written in its input.
export function parseLaunchInput(input: string): LaunchInfo | null {
  if (!/^0x[0-9a-fA-F]*$/.test(input) || input.length < 10) return null;
  try {
    const d = decodeFunctionData({ abi: LAUNCH_ABI, data: input as `0x${string}` });
    const form = d.args[0] as readonly [string, string, string, string, readonly string[], ...unknown[]];
    return sortLinks([...form[4]], form[3]?.slice(0, 500) || null);
  } catch {
    let text = ""; // bytes as characters, no Buffer (the Pages function runs without Node's)
    for (let i = 10; i + 1 < input.length; i += 2) text += String.fromCharCode(Number.parseInt(input.slice(i, i + 2), 16));
    return sortLinks(text.match(/https?:\/\/[\x21-\x7e]+/g) ?? [], null);
  }
}

// Launch forms for up to any number of launch transactions, 10 per RPC request. Missing or unreadable = null.
export async function readLaunchInfos(rpc: RpcClient, txs: string[]): Promise<Map<string, LaunchInfo | null>> {
  const out = new Map<string, LaunchInfo | null>();
  for (let i = 0; i < txs.length; i += 10) {
    const part = txs.slice(i, i + 10);
    const res = await rpc.batch(part.map((h) => ({ method: "eth_getTransactionByHash", params: [h] })));
    part.forEach((h, j) => {
      const r = res[j];
      const input = r?.ok && isObj(r.value) && typeof r.value.input === "string" ? r.value.input : null;
      out.set(h, input ? parseLaunchInput(input) : null);
    });
  }
  return out;
}

// The launch transaction of a Pons coin whose hash was not kept (coins found before 17 Nov): its launch event.
export async function launchTx(logsRpc: RpcClient, token: string, block: number): Promise<string | null> {
  const [r] = await logsRpc.batch([{ method: "eth_getLogs", params: [{ address: LAUNCHER, topics: [LAUNCH_TOPIC, word(token)], fromBlock: hex(block), toBlock: hex(block) }] }]);
  const log = r.ok && Array.isArray(r.value) ? r.value[0] : null;
  return isObj(log) && typeof log.transactionHash === "string" ? log.transactionHash : null;
}
