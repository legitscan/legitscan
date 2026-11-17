// CoinGecko listing: is this contract on a CoinGecko coin page for Robinhood Chain? One call returns every listed coin
// with its contract per chain (4 MB, 17 Nov: 21,855 coins, 1,468 on Robinhood Chain), so the whole list is read once an
// hour instead of asking per coin (the free Demo key allows about 10,000 calls a month).
// What it proves, measured 17 Nov: the main page of a known project names its official contract (VIRTUAL on
// virtual-protocol, whose own site shows no Robinhood address). It does not prove uniqueness: copies get pages of their
// own (commander-vrax, -2, -3, -4), so a ticker with several listed contracts is said out loud. Never a "fail": new
// coins wait one to four weeks for a listing (OffRouter: launched 6 Oct, listed by 3 Nov).
import { saveChecks } from "./check-store.ts";
import type { D1Like } from "./d1-types.ts";
import type { Fetcher } from "./http-json.ts";
import { CHECK_UA, type CheckResult } from "./legit-checks.ts";

export type CgCoin = { id: string; symbol: string; name: string };
export const COINGECKO_EVERY_MS = 3600_000;

export function parseCoingeckoList(json: unknown): Map<string, CgCoin> {
  const out = new Map<string, CgCoin>();
  if (!Array.isArray(json)) throw new Error("CoinGecko list is not a list");
  for (const c of json) {
    const ca = typeof c?.platforms?.robinhood === "string" ? c.platforms.robinhood.toLowerCase() : "";
    if (/^0x[0-9a-f]{40}$/.test(ca) && typeof c.id === "string") out.set(ca, { id: c.id, symbol: String(c.symbol ?? ""), name: String(c.name ?? c.id) });
  }
  return out;
}

export async function readCoingeckoList(fetch: Fetcher, apiKey: string): Promise<Map<string, CgCoin>> {
  const res = await fetch("https://api.coingecko.com/api/v3/coins/list?include_platform=true", {
    method: "GET",
    headers: { "x-cg-demo-api-key": apiKey, "user-agent": CHECK_UA, accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`CoinGecko answered HTTP ${res.status}`);
  return parseCoingeckoList(await res.json());
}

// The answer for one coin, given the whole Robinhood list.
export function coingeckoResult(ca: string, list: Map<string, CgCoin>): CheckResult {
  const hit = list.get(ca.toLowerCase());
  if (!hit) return { kind: "coingecko", status: "none", reason: "Not listed on CoinGecko yet. New coins usually wait one to four weeks.", sourceUrl: null, atMs: null };
  const sym = hit.symbol.toLowerCase();
  let others = 0;
  for (const [other, c] of list) if (other !== ca.toLowerCase() && c.symbol.toLowerCase() === sym) others++;
  const more = others ? ` CoinGecko also lists ${others} other Robinhood Chain contract${others === 1 ? "" : "s"} with the ticker ${hit.symbol.toUpperCase()}.` : "";
  return { kind: "coingecko", status: "pass", reason: `Listed on CoinGecko as ${hit.name} (${hit.id}).${more}`, sourceUrl: `https://www.coingecko.com/en/coins/${hit.id}`, atMs: null };
}

// Reads the list when the last read is an hour old, then compares every coin at/above the floor. Only changed answers
// are written (saveChecks). null = not due yet.
export async function refreshCoingecko(db: D1Like, fetch: Fetcher, apiKey: string, floor: number, now: number) {
  const last = await db.prepare("SELECT at_ms FROM source_times WHERE name = 'coingecko'").first<{ at_ms: number }>();
  if (last && now - last.at_ms < COINGECKO_EVERY_MS) return null;
  const list = await readCoingeckoList(fetch, apiKey);
  const coins = (await db.prepare("SELECT ca FROM coins WHERE mc_usd >= ?").bind(floor).all<{ ca: string }>()).results;
  // One read of the stored answers, then writes only for coins whose answer changed. Each D1 call from the runner takes
  // ~0.2 s: asking coin by coin made this stage 6.5 minutes on 558 coins (17 Nov), most of it for unchanged rows.
  const stored = new Map(
    (await db.prepare("SELECT ca, status, reason, source_url, at_ms FROM checks WHERE kind = 'coingecko'").all<{ ca: string; status: string; reason: string; source_url: string | null; at_ms: number | null }>()).results.map((r) => [r.ca, r]),
  );
  for (const { ca } of coins) {
    const r = coingeckoResult(ca, list);
    const old = stored.get(ca);
    if (old && old.status === r.status && old.reason === r.reason && old.source_url === r.sourceUrl && old.at_ms === r.atMs) continue;
    await saveChecks(db, ca, [r], now, false);
  }
  await db.prepare("INSERT INTO source_times (name, at_ms) VALUES ('coingecko', ?) ON CONFLICT (name) DO UPDATE SET at_ms = excluded.at_ms").bind(now).run();
  return { listed: list.size, compared: coins.length };
}
