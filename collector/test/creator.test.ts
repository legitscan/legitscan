import { test } from "node:test";
import assert from "node:assert/strict";
import { findCreator, MAX_SPAN, TRANSFER_TOPIC } from "../src/chain-reads.ts";
import type { RpcCall, RpcClient, RpcResult } from "../src/contract-facts.ts";

const TOKEN = "0x020bfc650a365f8bb26819deaabf3e21291018b4";
const DEV = "0xcdfc08a1c1fbafb355645e5ddc32122e5716ca90";
const ZERO_WORD = "0x" + "0".repeat(64);

// A chain where the token was first minted at `mintBlock` in tx 0xaa (sent by DEV) and minted again later in 0xbb.
function chain(mintBlock: number, opts: { tooManyAbove?: number } = {}) {
  const asked: { from: number; to: number }[] = [];
  const rpc: RpcClient = {
    async batch(calls: RpcCall[]): Promise<RpcResult[]> {
      return calls.map((c) => {
        if (c.method === "eth_getTransactionByHash") {
          return { ok: true, value: c.params[0] === "0xaa" ? { from: DEV.toUpperCase().replace("0X", "0x") } : { from: "0x" + "1".repeat(40) } };
        }
        const f = c.params[0] as { address: string; topics: string[]; fromBlock: string; toBlock: string };
        assert.equal(f.address, TOKEN);
        assert.deepEqual(f.topics, [TRANSFER_TOPIC, ZERO_WORD]); // only mints
        const from = parseInt(f.fromBlock, 16);
        const to = parseInt(f.toBlock, 16);
        asked.push({ from, to });
        if (opts.tooManyAbove && to - from + 1 > opts.tooManyAbove) return { ok: false, code: -32005, message: "logs matched by query exceeds limit of 10000" };
        const logs = [
          { blockNumber: "0x" + (mintBlock + 50).toString(16), transactionHash: "0xbb" }, // later mint, listed first on purpose
          { blockNumber: "0x" + mintBlock.toString(16), transactionHash: "0xaa" },
        ].filter((l) => parseInt(l.blockNumber, 16) >= from && parseInt(l.blockNumber, 16) <= to);
        return { ok: true, value: logs };
      });
    },
  };
  return { rpc, asked };
}

test("launch wallet: first mint's sender, walking forward from before the token existed", async () => {
  const { rpc, asked } = chain(25_000_000);
  const r = await findCreator(rpc, rpc, TOKEN, 0, 116_000_000);
  assert.deepEqual(r, { creator: DEV, block: 25_000_000, calls: 4 }); // 3 windows + the tx lookup
  assert.deepEqual(asked.map((a) => a.from), [0, MAX_SPAN, 2 * MAX_SPAN]); // stops at the first window with a mint

  // A start past the mint (pool time estimated too late) finds the later mint's sender, not the launcher: callers
  // must start well before the pool, which collect-run does (2 windows back).
  const late = await findCreator(rpc, rpc, TOKEN, 25_000_010, 116_000_000);
  assert.notEqual(late?.creator, DEV);

  const none = await findCreator(chain(200_000_000).rpc, chain(200_000_000).rpc, TOKEN, 0, 116_000_000, 5);
  assert.equal(none, null); // never minted inside the range, gives up at maxCalls

  const busy = chain(25_000_000, { tooManyAbove: 3_000_000 });
  const halved = await findCreator(busy.rpc, busy.rpc, TOKEN, 20_000_000, 116_000_000, 20);
  assert.equal(halved?.creator, DEV); // window halved until the node answers
});
