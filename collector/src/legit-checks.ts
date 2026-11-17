// The legit checks (PLAN 3.1, 3.2): is this contract address really the project's?
//   website: the project's own site shows the full CA (in the HTML, or in a same-site script / JSON the page loads)
//   x:       the site links an X account, and a tweet by that exact account carries the full CA (read via oEmbed)
//   github:  the site links a GitHub repo or account that was pushed to in the last 30 days
// Every check answers pass / fail / none (nothing to check yet) / error (could not read), with a plain reason and the
// URL that proves it. Runs on GitHub Actions (collector) and in the Pages function behind /claim, so it only uses fetch.
import { parse as parseDomain } from "tldts";
import { BlockedError, type Fetcher } from "./http-json.ts";

export type CheckKind = "website" | "x" | "xmatch" | "github" | "githubca" | "dev" | "coingecko"; // dev: dev-sign.ts, coingecko: coingecko.ts
export type CheckStatus = "pass" | "fail" | "none" | "error";
export type CheckResult = { kind: CheckKind; status: CheckStatus; reason: string; sourceUrl: string | null; atMs: number | null };

export const CHECK_UA = "legitscan-checker/0.1 (reads public project pages to find a token's contract address)";
const MAX_BYTES = 3_000_000;
const PAGES_PER_SITE = 14; // HTML + same-site scripts and JSON; OffRouter loads its CA from a JSON the bundle fetches
// One coin's websites get this long in all, so a slow site cannot hold up a run (the collector has 20 minutes).
const SITE_DEADLINE_MS = 25_000;
const GITHUB_ACTIVE_MS = 30 * 24 * 3600_000;
// ponytail: a page listing this many contracts is a launchpad or explorer page, not the project naming its own coin.
const LISTING_PAGE_ADDRESSES = 12;

const ADDRESS_ANY = /0x[0-9a-fA-F]{40}/g;
// A link with a contract address in it is the token's page on some platform (ponsfamily.com/launchpad/0x..., an
// explorer), not the project's own site: such a page always shows the address. 17 Nov: NOVAAI's CoinGecko "website".
const ADDRESS_IN_LINK = /0x[0-9a-fA-F]{40}/;
const X_RESERVED = new Set(["home", "i", "intent", "share", "search", "explore", "hashtag", "settings", "login", "signup", "messages", "notifications", "tos", "privacy"]);
const GH_RESERVED = new Set(["about", "features", "pricing", "login", "join", "orgs", "sponsors", "topics", "marketplace", "explore", "settings", "apps", "enterprise", "collections", "site", "contact"]);

// Only plain public http(s) addresses: no localhost, private ranges or odd ports, so a listed "website" cannot point the
// checker at internal machines.
export function publicUrl(raw: string, base?: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw, base);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.port && u.port !== "80" && u.port !== "443") return null;
  if (u.username || u.password) return null;
  const h = u.hostname.toLowerCase();
  if (!h.includes(".") || h.endsWith(".local") || h.endsWith(".internal") || h === "localhost" || h.endsWith(".localhost")) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b2] = h.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b2 === 254) || (a === 172 && b2 >= 16 && b2 <= 31) || (a === 192 && b2 === 168) || a >= 224) return null;
  }
  if (h.startsWith("[")) return null; // IPv6 literals: no project site uses one
  u.hash = "";
  return u;
}

type Page = { url: string; type: string; body: string };

// One GET, text only, capped in size and time. A bot-check page throws BlockedError: we report it, never get around it.
export async function fetchText(fetch: Fetcher, url: string, timeoutMs = 8_000): Promise<Page | null> {
  const res = await fetch(url, { method: "GET", redirect: "follow", headers: { "user-agent": CHECK_UA, accept: "text/html,application/json,*/*" }, signal: AbortSignal.timeout(timeoutMs) });
  if (res.headers.get("cf-mitigated") === "challenge") throw new BlockedError(`${new URL(url).host} shows a bot check`);
  if (!res.ok) return null;
  const type = res.headers.get("content-type") ?? "";
  if (/image|video|audio|font|octet-stream|pdf/.test(type)) return null;
  const len = Number(res.headers.get("content-length"));
  if (Number.isFinite(len) && len > MAX_BYTES) return null;
  const body = await res.text();
  return { url: res.url || url, type, body: body.length > MAX_BYTES ? body.slice(0, MAX_BYTES) : body };
}

// Links a page points at, read from raw text so links built by script bundles count too.
//   xHandles: any X profile link (a site often embeds other people's tweets; projectHandle picks the project's own)
//   tweets:   any tweet link; only candidates, the author is checked through oEmbed
//   github:   GitHub links in an href (HTML, or href:"..." in a bundle); githubSeen: GitHub URLs anywhere, which also
//             catches credits to other people's code, so checkGithub only keeps those that match the project's name
export function pageLinks(text: string) {
  const xHandles = new Set<string>();
  const tweets = new Set<string>();
  for (const m of text.matchAll(/(?:https?:)?\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})(\/status\/(\d{5,25}))?(?![A-Za-z0-9_])/gi)) {
    if (X_RESERVED.has(m[1].toLowerCase())) continue;
    if (m[3]) tweets.add(`https://x.com/${m[1]}/status/${m[3]}`);
    else xHandles.add(m[1]);
  }
  const gh = (owner: string, repo?: string) => {
    if (GH_RESERVED.has(owner.toLowerCase())) return null;
    const r = repo?.replace(/\.git$/, "");
    return r && !/^(issues|pulls|blob|tree|releases)$/.test(r) ? `https://github.com/${owner}/${r}` : `https://github.com/${owner}`;
  };
  const GH = /(?:https?:)?\/\/(?:www\.)?github\.com\/([A-Za-z0-9-]{1,39})(?:\/([A-Za-z0-9._-]{1,100}))?/i;
  const github = new Set<string>();
  const githubSeen = new Set<string>();
  for (const m of text.matchAll(new RegExp(GH.source, "gi"))) {
    const u = gh(m[1], m[2]);
    if (u) githubSeen.add(u);
  }
  for (const m of text.matchAll(/href["']?\s*[:=]\s*\\?["'`]((?:https?:)?\/\/[^"'`\\\s]+)/gi)) {
    const g = m[1].match(GH);
    const u = g && g.index === 0 ? gh(g[1], g[2]) : null;
    if (u) github.add(u);
  }
  return { xHandles: [...xHandles], tweets: [...tweets], github: [...github], githubSeen: [...githubSeen] };
}

// Letters and digits only, lowercase: "Orbio.so" and "orbioso" compare equal.
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// A GitHub owner belongs to the project when its name and the site's name or X handle contain one another.
export function ownerMatches(owner: string, names: string[]) {
  const o = squash(owner);
  return names.map(squash).some((n) => n.length >= 4 && o.length >= 4 && (o.includes(n) || n.includes(o)));
}

// The project's own X account among the ones its site links: the account the token listing names (DexScreener /
// GeckoTerminal), else the only one the site links. Several and none named = we cannot tell, so no account.
export function projectHandle(siteHandles: string[], listed: string | null): string | null {
  const unique = [...new Map(siteHandles.map((h) => [h.toLowerCase(), h])).values()];
  if (listed && unique.some((h) => h.toLowerCase() === listed.toLowerCase())) return unique.find((h) => h.toLowerCase() === listed.toLowerCase())!;
  return unique.length === 1 ? unique[0] : null;
}

// Same-site files a page loads: <script src>, JSON links, and quoted "/api/..." or "*.json" paths inside scripts.
export function sameSiteRefs(text: string, pageUrl: string): string[] {
  const host = new URL(pageUrl).hostname.replace(/^www\./, "");
  const out = new Set<string>();
  const add = (raw: string) => {
    const u = publicUrl(raw.replace(/\\\//g, "/"), pageUrl);
    if (u && u.hostname.replace(/^www\./, "") === host && u.href !== pageUrl) out.add(u.href);
  };
  for (const m of text.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) add(m[1]);
  for (const m of text.matchAll(/["'`]((?:https?:\/\/[^"'`\s]+)?\/(?:[\w.-]+\/)*[\w.-]+\.json)(?:\?[^"'`\s]*)?["'`]/g)) add(m[1]);
  for (const m of text.matchAll(/["'`](\/(?:api|data|config|token|contract|holders|ca)(?:\/[\w.-]*)*)["'`]/gi)) add(m[1]);
  for (const m of text.matchAll(/["'`](\/_next\/static\/chunks\/(?:app|pages)\/[^"'`\s]+\.js)["'`]/g)) add(m[1]);
  // Modules a script loads (Vite and other bundlers split a site into several files): import x from "./shell.js",
  // import("./page.js"). Resolved against the script's own URL. WAFERMAP keeps its X and GitHub links in such a file.
  for (const m of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["'`]((?:\.{1,2}\/|\/)[^"'`\s]+\.m?js)["'`]/g)) add(m[1]);
  return [...out];
}

export type SiteRead = {
  status: CheckStatus;
  reason: string;
  foundAt: string | null; // page that shows the CA
  pagesRead: number;
  xHandles: string[];
  tweets: string[];
  github: string[];
  githubSeen: string[];
};

// Pages a scan or claim may read in all, across a coin's sites. A Pages Function gets 50 outgoing requests: 20 pages +
// 2 RPC + 1 RDAP + up to 4 tweets leaves room. Per site it stays PAGES_PER_SITE, as in the collector, so a request
// reads as deep as the hourly run on a one-site coin (ZOLVA's CA is in its 10th file; 8 a site read it as a fail).
export const REQUEST_PAGES = 20;

// Reads one coin's listed websites (at most 3) and the same-site files they load, looking for the full CA.
export async function readSites(fetch: Fetcher, sites: string[], ca: string, pagesPerSite = PAGES_PER_SITE, clock: () => number = Date.now, maxPages = Infinity): Promise<SiteRead> {
  const deadline = clock() + SITE_DEADLINE_MS;
  const want = ca.toLowerCase();
  const links = { xHandles: new Set<string>(), tweets: new Set<string>(), github: new Set<string>(), githubSeen: new Set<string>() };
  let pagesRead = 0;
  let foundAt: string | null = null;
  let listing: string | null = null;
  let timedOut = false;
  const problems: string[] = [];
  const starts = sites
    .map((s) => publicUrl(s))
    .filter((u): u is URL => u !== null && !ADDRESS_IN_LINK.test(u.pathname + u.search))
    .slice(0, 3);
  if (!starts.length) return { status: "none", reason: "No website listed for this coin.", foundAt: null, pagesRead: 0, xHandles: [], tweets: [], github: [], githubSeen: [] };

  let spent = 0;
  for (const start of starts) {
    const queue = [start.href];
    const seen = new Set<string>();
    let budget = pagesPerSite;
    while (queue.length && budget-- > 0 && spent++ < maxPages) {
      const left = deadline - clock();
      if (left < 1_000) {
        timedOut = true;
        break;
      }
      const url = queue.shift()!;
      if (seen.has(url)) continue;
      seen.add(url);
      let page: Page | null;
      try {
        page = await fetchText(fetch, url, Math.min(8_000, left));
      } catch (e) {
        if (url === start.href) problems.push(e instanceof BlockedError ? `${start.host} shows a bot check, which we do not get around` : `${start.host} did not answer`);
        continue;
      }
      if (!page) {
        if (url === start.href) problems.push(`${start.host} did not return a page`);
        continue;
      }
      pagesRead++;
      const l = pageLinks(page.body);
      l.xHandles.forEach((h) => links.xHandles.add(h));
      l.tweets.forEach((t) => links.tweets.add(t));
      l.github.forEach((g) => links.github.add(g));
      l.githubSeen.forEach((g) => links.githubSeen.add(g));
      const lower = page.body.toLowerCase();
      if (!foundAt && lower.includes(want)) {
        const distinct = new Set((page.body.match(ADDRESS_ANY) ?? []).map((a) => a.toLowerCase())).size;
        if (distinct >= LISTING_PAGE_ADDRESSES) listing ??= page.url;
        else foundAt = page.url;
      }
      if (/javascript|html|json/.test(page.type) || /\.(js|json)(\?|$)/.test(url) || url === start.href) {
        for (const ref of sameSiteRefs(page.body, page.url)) if (!seen.has(ref)) queue.push(ref);
      }
    }
  }
  const base = { foundAt, pagesRead, xHandles: [...links.xHandles], tweets: [...links.tweets], github: [...links.github], githubSeen: [...links.githubSeen] };
  if (foundAt) return { ...base, status: "pass", reason: `The full address is on ${new URL(foundAt).host}.` };
  if (pagesRead === 0) return { ...base, status: "error", reason: problems[0] ?? "The website could not be read." };
  if (timedOut) return { ...base, status: "error", reason: `The website was too slow: read ${pagesRead} page${pagesRead === 1 ? "" : "s"} without the address, then stopped. Checked again later.` };
  if (listing) return { ...base, status: "fail", reason: `The address only shows on a page listing many coins (${new URL(listing).host}), not as the project's own.` };
  return { ...base, status: "fail", reason: `Read ${pagesRead} page${pagesRead === 1 ? "" : "s"} of the website. The full address is not there.` };
}

export type Tweet = { url: string; handle: string; text: string };

// publish.x.com oEmbed: the tweet's author and text, no X API and no scraping. null = deleted, private or not a tweet.
export function parseOembed(json: unknown, url: string): Tweet | null {
  const j = json as { author_url?: unknown; html?: unknown };
  if (typeof j?.author_url !== "string" || typeof j.html !== "string") return null;
  const handle = j.author_url.match(/(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/?$/i)?.[1];
  if (!handle) return null;
  // The tweet body is the <p> inside the blockquote; the "— Name (@handle) date" line after it is not tweet text.
  const p = j.html.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? "";
  const text = p.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  return { url, handle, text };
}

export const TWEET_URL = /^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d{5,25})(?:[/?#].*)?$/i;

export async function readTweet(fetch: Fetcher, tweetUrl: string): Promise<Tweet | null> {
  const m = tweetUrl.match(TWEET_URL);
  if (!m) return null;
  const clean = `https://x.com/${m[1]}/status/${m[2]}`;
  const res = await fetch(`https://publish.x.com/oembed?omit_script=1&dnt=1&url=${encodeURIComponent(clean)}`, {
    method: "GET",
    headers: { "user-agent": CHECK_UA, accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) throw new Error(`oEmbed answered HTTP ${res.status}`);
  return parseOembed(await res.json(), `https://x.com/${m[1]}/status/${m[2]}`);
}

// Paid X API (PLAN 3.2, pay per use, prepaid credit): recent tweets by @handle that carry the CA, last 7 days.
// Only runs when the owner sets X_BEARER_TOKEN; without it, tweets come from the site and from /claim.
export async function searchTweets(fetch: Fetcher, bearer: string, handle: string, ca: string): Promise<string[]> {
  const q = encodeURIComponent(`from:${handle} ${ca}`);
  const res = await fetch(`https://api.x.com/2/tweets/search/recent?query=${q}&max_results=10`, {
    method: "GET",
    headers: { authorization: `Bearer ${bearer}`, "user-agent": CHECK_UA },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`X API answered HTTP ${res.status}`);
  const j = (await res.json()) as { data?: { id?: string }[] };
  return (j.data ?? []).flatMap((t) => (t.id && /^\d+$/.test(t.id) ? [`https://x.com/${handle}/status/${t.id}`] : []));
}

// The X triangle (PLAN 3.2): site shows the CA, site links @handle, a tweet by @handle carries the CA.
export async function checkX(fetch: Fetcher, site: SiteRead, ca: string, claimedTweets: string[], listedHandle: string | null, xBearer?: string): Promise<CheckResult> {
  const r = (status: CheckStatus, reason: string, sourceUrl: string | null = null): CheckResult => ({ kind: "x", status, reason, sourceUrl, atMs: null });
  if (site.status !== "pass") return r("none", "Waits for the website check: the X account must come from the project's own site.");
  if (!site.xHandles.length) return r("fail", "The website shows the address but links no X account.");
  const handle = projectHandle(site.xHandles, listedHandle);
  if (!handle) return r("none", `The website links ${site.xHandles.length} X accounts and the token listing names none of them, so we cannot tell which is the project's.`);
  const want = ca.toLowerCase();
  // Tweets the site links first, then tweets sent in through /claim. At most 4 oEmbed reads per coin.
  const own = (t: string) => t.match(TWEET_URL)?.[1]?.toLowerCase() === handle.toLowerCase();
  let found: string[] = [];
  if (xBearer) found = await searchTweets(fetch, xBearer, handle, ca).catch(() => []);
  const candidates = [...new Set([...site.tweets, ...claimedTweets, ...found])].filter(own).slice(0, 4);
  if (!candidates.length) return r("none", `The website links @${handle}. No tweet from @${handle} with the address has been sent in yet.`);
  let readable = 0;
  for (const url of candidates) {
    let t: Tweet | null;
    try {
      t = await readTweet(fetch, url);
    } catch {
      continue;
    }
    if (!t) continue;
    readable++;
    if (t.handle.toLowerCase() === handle.toLowerCase() && t.text.toLowerCase().includes(want)) return r("pass", `@${t.handle} posted the full address, and the website links @${t.handle}.`, t.url);
  }
  if (!readable) return r("error", "The tweet could not be read (deleted, private, or X did not answer).");
  return r("fail", `Read ${readable} tweet${readable === 1 ? "" : "s"} from @${handle}. None carries the full address.`);
}

type Repo = { full_name?: string; html_url?: string; pushed_at?: string; description?: string | null; homepage?: string | null };

// GitHub, from the links on the official site. Two rows from one read:
// - github: last push of the linked repo (or of the account's most recently pushed repos).
// - githubca: does a README or repo description there carry the full CA? A bonus, never counted toward legit, and never
//   "fail": most projects keep the CA off GitHub. ponytail: README + description only, not a code search (GitHub's
//   code search needs a user token); add it if CAs turn up in other files.
export async function checkGithub(fetch: Fetcher, site: SiteRead, now: number, handle: string | null, ca: string, token?: string): Promise<CheckResult[]> {
  const r = (kind: "github" | "githubca", status: CheckStatus, reason: string, sourceUrl: string | null = null, atMs: number | null = null): CheckResult => ({ kind, status, reason, sourceUrl, atMs });
  const both = (status: CheckStatus, reason: string, sourceUrl: string | null = null) => [r("github", status, reason, sourceUrl), r("githubca", status, reason, sourceUrl)];
  if (site.status !== "pass") return both("none", "Waits for the website check: the repo must come from the project's own site.");
  const names = [new URL(site.foundAt!).hostname.replace(/^www\./, "").split(".")[0], ...(handle ? [handle] : [])];
  const owner = (u: string) => new URL(u).pathname.split("/")[1];
  // Linked repos whose owner matches the project first, then other linked ones, then name-matching mentions in code.
  const linked = [...site.github].sort((a, b) => Number(ownerMatches(owner(b), names)) - Number(ownerMatches(owner(a), names)));
  const links = [...new Set([...linked, ...site.githubSeen.filter((u) => ownerMatches(owner(u), names))])].slice(0, 3);
  if (!links.length) return both("none", "The website links no GitHub of its own.");
  const headers: Record<string, string> = { "user-agent": CHECK_UA, accept: "application/vnd.github+json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const get = (url: string, accept?: string) => fetch(url, { method: "GET", headers: accept ? { ...headers, accept } : headers, signal: AbortSignal.timeout(12_000) });
  const slowDown = (res: Response) => res.status === 403 || res.status === 429;
  const repos = new Map<string, Repo>();
  for (const link of links) {
    const [, o, repo] = new URL(link).pathname.split("/");
    const res = await get(repo ? `https://api.github.com/repos/${o}/${repo}` : `https://api.github.com/users/${o}/repos?sort=pushed&per_page=3&type=owner`);
    if (slowDown(res)) return both("error", "GitHub asked us to slow down. Checked again later.");
    if (!res.ok) continue;
    const j = (await res.json()) as Repo | Repo[];
    for (const one of Array.isArray(j) ? j : [j]) if (one?.full_name) repos.set(one.full_name, one);
  }
  const pushedMs = (x: Repo) => Date.parse(x.pushed_at ?? "");
  const recent = [...repos.values()].filter((x) => Number.isFinite(pushedMs(x))).sort((a, b) => pushedMs(b) - pushedMs(a));
  if (!recent.length) return both("fail", "The GitHub link on the website leads to nothing public.", links[0]);

  const best = recent[0];
  const days = Math.floor((now - pushedMs(best)) / 86_400_000);
  const when = days <= 0 ? "today" : `${days} day${days === 1 ? "" : "s"} ago`;
  const github = now - pushedMs(best) <= GITHUB_ACTIVE_MS
    ? r("github", "pass", `Code was pushed ${when}.`, best.html_url ?? links[0], pushedMs(best))
    : r("github", "fail", `Last push was ${when}. Active means a push in the last 30 days.`, best.html_url ?? links[0], pushedMs(best));

  const want = ca.toLowerCase();
  const looked = recent.slice(0, 3);
  let caRow = r("githubca", "none", `The address is not in the README or description of ${looked.map((x) => x.full_name).join(", ")}. A bonus only; most projects keep it on their site.`);
  for (const repo of looked) {
    if (`${repo.description ?? ""} ${repo.homepage ?? ""}`.toLowerCase().includes(want)) {
      caRow = r("githubca", "pass", `The description of ${repo.full_name} shows the full address.`, repo.html_url ?? null);
      break;
    }
    const res = await get(`https://api.github.com/repos/${repo.full_name}/readme`, "application/vnd.github.raw");
    if (slowDown(res)) {
      caRow = r("githubca", "error", "GitHub asked us to slow down. Checked again later.");
      break;
    }
    if (res.ok && (await res.text()).toLowerCase().includes(want)) {
      caRow = r("githubca", "pass", `The README of ${repo.full_name} shows the full address.`, repo.html_url ? `${repo.html_url}#readme` : null);
      break;
    }
  }
  return [github, caRow];
}

// Do the places that name the coin's X account agree? No X API needed, so it works from a coin's first minute.
// Sources: the Pons launch form, the market listing (DexScreener / GeckoTerminal), the CoinGecko page and the links on
// the website itself.
// Agreement is a consistency signal, not proof the account posted the CA; a mismatch is a warning worth showing
// (NOVAAI, 17 Nov: launch form @lalarochaas, listing and site @NOVAAI_77).
export function checkXMatch(site: SiteRead, launchX: string | null, listingX: string | null, cgX: string | null = null): CheckResult {
  const r = (status: CheckStatus, reason: string): CheckResult => ({ kind: "xmatch", status, reason, sourceUrl: null, atMs: null });
  const at = (h: string) => "@" + h;
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
  const siteHandles = site.pagesRead > 0 ? site.xHandles : [];
  const named: [string, string][] = [];
  if (launchX) named.push(["the launch form", launchX]);
  if (listingX) named.push(["the market listing", listingX]);
  if (cgX) named.push(["the CoinGecko page", cgX]);
  const sources = named.length + (siteHandles.length ? 1 : 0);
  if (sources < 2) {
    const only = named[0] ? `Only ${named[0][0]} names an X account (${at(named[0][1])}).` : siteHandles.length ? `Only the website links X accounts (${siteHandles.map(at).join(", ")}).` : "No X account is named anywhere.";
    return r("none", `${only} Nothing to compare it with yet.`);
  }
  for (const [where, h] of named.slice(1)) {
    if (!same(named[0][1], h)) return r("fail", `${cap(named[0][0])} names ${at(named[0][1])} but ${where} names ${at(h)}.`);
  }
  if (siteHandles.length) {
    for (const [where, h] of named) {
      if (!siteHandles.some((s) => same(s, h))) return r("fail", `${cap(where)} names ${at(h)}, but the website links ${siteHandles.map(at).join(", ")}.`);
    }
  }
  const h = named[0]?.[1] ?? siteHandles[0];
  const where = [...named.map(([w]) => w), ...(siteHandles.length ? ["the website"] : [])];
  return r("pass", `${where.slice(0, -1).join(", ")} and ${where[where.length - 1]} ${where.length === 2 ? "both" : "all"} name ${at(h)}.`.replace(/^./, (c) => c.toUpperCase()));
}

// All three checks for one coin.
export async function checkCoin(o: { fetch: Fetcher; ca: string; websites: string[]; listedHandle: string | null; launchHandle?: string | null; cgHandle?: string | null; claimedTweets: string[]; now: number; githubToken?: string; xBearer?: string; skipGithub?: boolean; maxPages?: number }) {
  const site = await readSites(o.fetch, o.websites, o.ca, PAGES_PER_SITE, Date.now, o.maxPages);
  const website: CheckResult = { kind: "website", status: site.status, reason: site.reason, sourceUrl: site.foundAt, atMs: null };
  const x = await checkX(o.fetch, site, o.ca, o.claimedTweets, o.listedHandle ?? o.launchHandle ?? o.cgHandle ?? null, o.xBearer);
  const xmatch = checkXMatch(site, o.launchHandle ?? null, o.listedHandle, o.cgHandle ?? null);
  const github = o.skipGithub
    ? []
    : await checkGithub(o.fetch, site, o.now, projectHandle(site.xHandles, o.listedHandle), o.ca, o.githubToken).catch((e: Error) =>
        (["github", "githubca"] as const).map((kind): CheckResult => ({ kind, status: "error", reason: `GitHub could not be read: ${e.message}`, sourceUrl: null, atMs: null })),
      );
  return { site, results: [website, x, xmatch, ...github] };
}

// Domain names from the Public Suffix List (tldts), private part included: on free hosting like vercel.app, pages.dev
// or github.io the platform owns the registered name and the project only has a subdomain.

// The name someone registered: "docs.orbio.so" -> "orbio.so", "shop.example.co.uk" -> "example.co.uk". On free
// hosting the site's own name is the whole host: "tessera.vercel.app".
export function registrableDomain(url: string): string | null {
  const u = publicUrl(url);
  return u ? parseDomain(u.hostname, { allowPrivateDomains: true }).domain : null;
}

// Owner 17 Nov: a project that never bought its own domain is worth a warning. "tessera.vercel.app" -> "vercel.app",
// a real domain -> null.
export function freeHost(host: string): string | null {
  const p = parseDomain(host, { allowPrivateDomains: true });
  return p.isPrivate && p.domain && p.domain !== p.publicSuffix ? p.publicSuffix : null;
}

// When the domain was registered, from RDAP (the registries' public lookup, free, no key). rdap.org forwards each
// ending to its registry. null = the registry does not say (some, like .so, publish no dates).
export async function readDomainCreated(fetch: Fetcher, domain: string): Promise<number | null> {
  const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
    method: "GET",
    redirect: "follow",
    headers: { "user-agent": CHECK_UA, accept: "application/rdap+json, application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`RDAP answered HTTP ${res.status}`);
  const j = (await res.json()) as { events?: { eventAction?: string; eventDate?: string }[] };
  const t = Date.parse(j.events?.find((e) => e.eventAction === "registration")?.eventDate ?? "");
  return Number.isFinite(t) ? t : null;
}
