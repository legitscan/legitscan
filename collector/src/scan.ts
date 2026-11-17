// POST /api/scan/{ca}: someone pasted a CA and opened the coin page. Check it now, whatever its MC: read the Pons
// launch form from the chain if we have not yet (a new coin's only known website and X), then the website and X
// checks. GitHub comes on the collector's next run (the coin goes to the front of its queue).
// Guards: one scan per coin every 10 minutes (a later ask gets the stored answer), 30 scans an hour per sender.
import { launchTx, readLaunchInfos } from "./chain-reads.ts";
import { REQUEST_PAGES } from "./legit-checks.ts";
import { checkAndSave } from "./check-store.ts";
import { createRpcClient } from "./contract-facts.ts";
import type { D1Like } from "./d1-types.ts";
import type { Fetcher } from "./http-json.ts";
import { PUBLIC_RPC } from "./rpc-pool.ts";

export const SCAN_COOLDOWN_MS = 10 * 60_000;
export const SCANS_PER_HOUR = 30;
type Answer = { status: number; body: Record<string, unknown> };

async function sha256(text: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type ScanEnv = { db: D1Like; fetch: Fetcher; now: number; ip: string; rpcUrl?: string };

export async function scanAnswer(rawCa: string, env: ScanEnv): Promise<Answer> {
  const ca = rawCa.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(ca)) return { status: 400, body: { error: "Not a 0x address." } };
  const coin = await env.db
    .prepare("SELECT c.ca, c.launch_block, c.launch_tx, c.launch_info_at_ms, q.checked_ms FROM coins c LEFT JOIN check_queue q ON q.ca = c.ca WHERE c.ca = ?")
    .bind(ca)
    .first<{ ca: string; launch_block: number | null; launch_tx: string | null; launch_info_at_ms: number | null; checked_ms: number | null }>();
  if (!coin) return { status: 404, body: { error: "not in our list yet" } };
  if (coin.checked_ms && env.now - coin.checked_ms < SCAN_COOLDOWN_MS) return { status: 200, body: { ca, scanned: false, checkedMs: coin.checked_ms } };

  const ipHash = await sha256(`scan|${env.ip}|${new Date(env.now).toISOString().slice(0, 10)}`);
  const recent = await env.db.prepare("SELECT count(*) AS n FROM scans WHERE ip_hash = ? AND at_ms > ?").bind(ipHash, env.now - 3600_000).first<{ n: number }>();
  if ((recent?.n ?? 0) >= SCANS_PER_HOUR) return { status: 429, body: { error: `At most ${SCANS_PER_HOUR} scans an hour. Stored results are still shown.` } };
  await env.db.prepare("INSERT INTO scans (ip_hash, at_ms) VALUES (?, ?)").bind(ipHash, env.now).run();

  // The launch form, once per coin: 1-2 RPC calls.
  if (coin.launch_block !== null && coin.launch_info_at_ms === null) {
    const rpc = createRpcClient({ url: env.rpcUrl ?? PUBLIC_RPC, fetch: env.fetch, sleep: () => Promise.resolve() });
    try {
      const tx = coin.launch_tx ?? (await launchTx(rpc, ca, coin.launch_block));
      const form = tx ? (await readLaunchInfos(rpc, [tx])).get(tx) ?? null : null;
      await env.db
        .prepare("UPDATE coins SET launch_tx = coalesce(launch_tx, ?), launch_desc = ?, launch_website = ?, launch_x = ?, launch_telegram = ?, launch_github = ?, launch_info_at_ms = ? WHERE ca = ?")
        .bind(tx, form?.description ?? null, form?.website ?? null, form?.x ?? null, form?.telegram ?? null, form?.github ?? null, env.now, ca)
        .run();
    } catch {
      // The chain did not answer: the checks below still run with what we know; the collector reads the form later.
    }
  }
  const results = await checkAndSave(env.db, ca, { fetch: env.fetch, now: env.now, skipGithub: true, maxPages: REQUEST_PAGES });
  await env.db.prepare("UPDATE check_queue SET wanted_ms = ? WHERE ca = ?").bind(env.now, ca).run();
  return { status: 200, body: { ca, scanned: true, checkedMs: env.now, results } };
}
