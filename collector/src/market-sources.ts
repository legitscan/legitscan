// Market and project data from DexScreener and GeckoTerminal (public, no key). Shapes checked live on 2026-11-16
// against OffRouter 0x47b537f7c2c2183967fe5ba883291b8ada490db6. Parsers trust nothing: an odd value becomes null.
import { HttpError, requestJson, type Fetcher, type Sleep } from "./http-json.ts";

const isObj = (v: unknown): v is Record<string, any> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => {
  const n = typeof v === "string" || typeof v === "number" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const str = (v: unknown, max = 300): string | null => (typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null);
const httpUrl = (v: unknown): string | null => {
  const s = str(v, 500);
  return s && /^https?:\/\//i.test(s) ? s : null;
};
export const ADDRESS = /^0x[0-9a-f]{40}$/;
const addr = (v: unknown): string | null => (typeof v === "string" && ADDRESS.test(v.toLowerCase()) ? v.toLowerCase() : null);

// Last path part of an x.com / twitter.com link, the handle.
export function xHandle(url: string | null): string | null {
  const m = url?.match(/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/?(?:[?#].*)?$/i);
  return m ? m[1] : null;
}

// Spaces calls to one host so a burst never trips its rate limit.
export function paced(inner: Fetcher, gapMs: number, sleep: Sleep, now: () => number): Fetcher {
  let next = 0;
  return async (input, init) => {
    const at = Math.max(now(), next);
    next = at + gapMs;
    if (at > now()) await sleep(at - now());
    return inner(input, init);
  };
}

export type Market = {
  ca: string;
  symbol: string | null;
  name: string | null;
  iconUrl: string | null;
  websites: string[];
  xHandle: string | null;
  telegram: string | null;
  dex: string | null;
  pair: string | null;
  pairCreatedMs: number | null;
  mcUsd: number | null;
  liqUsd: number | null;
  volH24Usd: number | null;
};

// DexScreener answers a list of pairs for up to 30 tokens. One Market per token that has at least one pair where it
// is the base token. MC comes from the deepest pair; liquidity and volume are summed over all of the token's pairs.
export function parseDexTokens(json: unknown): Map<string, Market> {
  if (!Array.isArray(json)) throw new HttpError(200, "DexScreener answer is not a list");
  const byToken = new Map<string, any[]>();
  for (const p of json) {
    const ca = isObj(p) && isObj(p.baseToken) ? addr(p.baseToken.address) : null;
    if (!ca) continue;
    byToken.set(ca, [...(byToken.get(ca) ?? []), p]);
  }
  const out = new Map<string, Market>();
  for (const [ca, pairs] of byToken) {
    const liq = (p: any) => num(isObj(p.liquidity) ? p.liquidity.usd : null) ?? 0;
    const best = pairs.reduce((a, b) => (liq(b) > liq(a) ? b : a));
    const info = pairs.find((p) => isObj(p.info))?.info ?? {};
    const websites = (Array.isArray(info.websites) ? info.websites : []).map((w: any) => httpUrl(isObj(w) ? w.url : null)).filter(Boolean) as string[];
    const socials = Array.isArray(info.socials) ? info.socials.filter(isObj) : [];
    const social = (type: string) => httpUrl(socials.find((s: any) => s.type === type)?.url);
    const created = pairs.map((p) => num(p.pairCreatedAt)).filter((x): x is number => x !== null && x > 0);
    const liqs = pairs.map((p) => num(isObj(p.liquidity) ? p.liquidity.usd : null)).filter((x): x is number => x !== null);
    const vols = pairs.map((p) => num(isObj(p.volume) ? p.volume.h24 : null)).filter((x): x is number => x !== null);
    out.set(ca, {
      ca,
      symbol: str(best.baseToken.symbol, 64),
      name: str(best.baseToken.name, 120),
      iconUrl: httpUrl(info.imageUrl),
      websites: websites.slice(0, 5),
      xHandle: xHandle(social("twitter")),
      telegram: social("telegram"),
      dex: str(best.dexId, 64),
      pair: str(best.pairAddress, 66)?.toLowerCase() ?? null,
      pairCreatedMs: created.length ? Math.min(...created) : null,
      mcUsd: num(best.marketCap) ?? num(best.fdv),
      liqUsd: liqs.length ? liqs.reduce((a, b) => a + b, 0) : null,
      volH24Usd: vols.length ? vols.reduce((a, b) => a + b, 0) : null,
    });
  }
  return out;
}

export type GtInfo = {
  holders: number | null;
  top10Pct: number | null;
  dev: string | null;
  verified: boolean | null;
  honeypot: boolean | null;
  iconUrl: string | null;
  websites: string[];
  xHandle: string | null;
  telegram: string | null;
};

export function parseGtInfo(json: unknown): GtInfo {
  const a = isObj(json) && isObj(json.data) && isObj(json.data.attributes) ? json.data.attributes : null;
  if (!a) throw new HttpError(200, "GeckoTerminal token info has no attributes");
  const h = isObj(a.holders) ? a.holders : {};
  const dist = isObj(h.distribution_percentage) ? h.distribution_percentage : {};
  const count = num(h.count);
  const bool = (v: unknown) => (typeof v === "boolean" ? v : null);
  const tg = str(a.telegram_handle, 64);
  return {
    holders: count !== null && Number.isInteger(count) ? count : null,
    top10Pct: num(dist.top_10),
    dev: addr(a.developer_address),
    verified: bool(a.gt_verified),
    honeypot: bool(a.is_honeypot),
    iconUrl: httpUrl(a.image_url),
    websites: (Array.isArray(a.websites) ? a.websites : []).map(httpUrl).filter(Boolean).slice(0, 5) as string[],
    xHandle: str(a.twitter_handle, 15)?.replace(/^@/, "") ?? null,
    telegram: tg ? `https://t.me/${tg}` : null,
  };
}

// Tokens in a GeckoTerminal pool list (new_pools or the busiest pools). The token is the side that is not WETH,
// USDG or native ETH.
const BASE_ASSETS = new Set([
  "0x0000000000000000000000000000000000000000",
  "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  "0x0bd7d308f8e1639fab988df18a8011f41eacad73", // WETH
  "0x5fc5360d0400a0fd4f2af552add042d716f1d168", // USDG
]);
export function parseGtPoolTokens(json: unknown): string[] {
  if (!isObj(json) || !Array.isArray(json.data)) throw new HttpError(200, "GeckoTerminal pool list has no data");
  const id = (rel: any) => (isObj(rel) && isObj(rel.data) && typeof rel.data.id === "string" ? addr(rel.data.id.slice(rel.data.id.indexOf("_") + 1)) : null);
  const out = new Set<string>();
  for (const p of json.data) {
    const rel = isObj(p) && isObj(p.relationships) ? p.relationships : {};
    for (const t of [id(rel.base_token), id(rel.quote_token)]) if (t && !BASE_ASSETS.has(t)) out.add(t);
  }
  return [...out];
}

// Pons bonding curve, from GeckoTerminal /tokens/multi (30 tokens a call). Checked live 2026-11-16: every recent Pons
// coin has launchpad_details; fdv_usd is the curve price x supply (KINETRA: 38.96% bonded, $12.1k).
export type Curve = { ca: string; symbol: string | null; name: string | null; iconUrl: string | null; bondPct: number | null; bonded: boolean | null; bondedMs: number | null; mcUsd: number | null };

export function parseGtMulti(json: unknown): Map<string, Curve> {
  if (!isObj(json) || !Array.isArray(json.data)) throw new HttpError(200, "GeckoTerminal tokens/multi has no data");
  const out = new Map<string, Curve>();
  for (const t of json.data) {
    const a = isObj(t) && isObj(t.attributes) ? t.attributes : null;
    const ca = a ? addr(a.address) : null;
    if (!a || !ca) continue;
    const lp = isObj(a.launchpad_details) ? a.launchpad_details : null;
    const pct = lp ? num(lp.graduation_percentage) : null;
    const doneAt = lp && typeof lp.completed_at === "string" ? Date.parse(lp.completed_at) : NaN;
    out.set(ca, {
      ca,
      symbol: str(a.symbol, 64),
      name: str(a.name, 120),
      iconUrl: httpUrl(a.image_url),
      bondPct: pct === null ? null : Math.min(pct, 100),
      bonded: lp && typeof lp.completed === "boolean" ? lp.completed : null,
      bondedMs: Number.isFinite(doneAt) ? doneAt : null,
      mcUsd: num(a.market_cap_usd) ?? num(a.fdv_usd),
    });
  }
  return out;
}

export type Sources = {
  dexTokens(cas: string[]): Promise<Map<string, Market>>;
  gtMulti(cas: string[]): Promise<Map<string, Curve>>;
  gtInfo(ca: string): Promise<GtInfo>;
  gtPoolTokens(path: "new_pools" | "pools", page: number): Promise<string[]>;
};

// dexFetch and gtFetch should each be paced (DexScreener ~300/min, GeckoTerminal ~30/min).
export function createSources(o: { dexFetch: Fetcher; gtFetch: Fetcher; sleep: Sleep }): Sources {
  const dex = "https://api.dexscreener.com/tokens/v1/robinhood/";
  const gt = "https://api.geckoterminal.com/api/v2/networks/robinhood";
  return {
    async dexTokens(cas) {
      if (cas.length < 1 || cas.length > 30) throw new RangeError("ask DexScreener for 1 to 30 tokens");
      for (const ca of cas) if (!ADDRESS.test(ca)) throw new RangeError(`not an address: ${ca.slice(0, 20)}`);
      return parseDexTokens(await requestJson(dex + cas.join(","), { method: "GET" }, { fetch: o.dexFetch, sleep: o.sleep }));
    },
    async gtMulti(cas) {
      if (cas.length < 1 || cas.length > 30) throw new RangeError("ask GeckoTerminal for 1 to 30 tokens");
      for (const ca of cas) if (!ADDRESS.test(ca)) throw new RangeError(`not an address: ${ca.slice(0, 20)}`);
      return parseGtMulti(await requestJson(`${gt}/tokens/multi/${cas.join(",")}`, { method: "GET" }, { fetch: o.gtFetch, sleep: o.sleep }));
    },
    async gtInfo(ca) {
      if (!ADDRESS.test(ca)) throw new RangeError("not an address");
      return parseGtInfo(await requestJson(`${gt}/tokens/${ca}/info`, { method: "GET" }, { fetch: o.gtFetch, sleep: o.sleep }));
    },
    async gtPoolTokens(path, page) {
      const sort = path === "pools" ? "&sort=h24_volume_usd_desc" : "";
      return parseGtPoolTokens(await requestJson(`${gt}/${path}?page=${page}${sort}`, { method: "GET" }, { fetch: o.gtFetch, sleep: o.sleep }));
    },
  };
}
