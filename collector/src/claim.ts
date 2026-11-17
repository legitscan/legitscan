// POST /api/claim: someone sends a tweet that carries a coin's CA. We read the tweet through oEmbed, keep it as a
// candidate for that coin, and run the website and X checks right away. The checks decide; the sender cannot.
// Anti-spam: at most CLAIMS_PER_HOUR per sender, always. Cloudflare Turnstile (a human check) on top once the owner
// creates a widget in the Cloudflare dashboard and sets TURNSTILE_SECRET; until then the limit is the only guard.
import { checkAndSave } from "./check-store.ts";
import type { D1Like } from "./d1-types.ts";
import type { Fetcher } from "./http-json.ts";
import { readTweet, TWEET_URL, REQUEST_PAGES } from "./legit-checks.ts";
import { cleanName } from "./name-tricks.ts";

export const CLAIMS_PER_HOUR = 5;
const ADDRESS = /0x[0-9a-fA-F]{40}/g;

export type ClaimEnv = { db: D1Like; fetch: Fetcher; now: number; ip: string; turnstileSecret?: string };
type Answer = { status: number; body: Record<string, unknown> };
const no = (status: number, error: string): Answer => ({ status, body: { error } });

async function sha256(text: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function claimAnswer(input: unknown, env: ClaimEnv): Promise<Answer> {
  const body = (input ?? {}) as { tweetUrl?: unknown; ca?: unknown; turnstileToken?: unknown };
  const tweetUrl = typeof body.tweetUrl === "string" ? body.tweetUrl.trim() : "";
  if (!TWEET_URL.test(tweetUrl)) return no(400, "Paste a tweet link, like https://x.com/name/status/123...");
  const wantCa = typeof body.ca === "string" && body.ca.trim() ? body.ca.trim().toLowerCase() : null;
  if (wantCa && !/^0x[0-9a-f]{40}$/.test(wantCa)) return no(400, "That contract address is not a 0x address.");

  // One hash per sender per day; the raw IP is never stored.
  const ipHash = await sha256(`${env.ip}|${new Date(env.now).toISOString().slice(0, 10)}`);
  const recent = await env.db.prepare("SELECT count(*) AS n FROM claims WHERE ip_hash = ? AND created_ms > ?").bind(ipHash, env.now - 3600_000).first<{ n: number }>();
  if ((recent?.n ?? 0) >= CLAIMS_PER_HOUR) return no(429, `At most ${CLAIMS_PER_HOUR} claims an hour. Try again later.`);

  if (env.turnstileSecret) {
    const token = typeof body.turnstileToken === "string" ? body.turnstileToken : "";
    const form = new FormData();
    form.append("secret", env.turnstileSecret);
    form.append("response", token);
    form.append("remoteip", env.ip);
    const res = await env.fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const ok = res.ok && ((await res.json()) as { success?: boolean }).success === true;
    if (!ok) return no(403, "The human check did not pass. Reload the page and try again.");
  }

  const tweet = await readTweet(env.fetch, tweetUrl).catch(() => null);
  if (!tweet) return no(400, "We could not read that tweet. It may be deleted or from a private account.");
  const inTweet = [...new Set((tweet.text.match(ADDRESS) ?? []).map((a) => a.toLowerCase()))];
  if (!inTweet.length) return no(400, "That tweet has no full contract address in it.");
  if (wantCa && !inTweet.includes(wantCa)) return no(400, "That tweet does not carry this contract address.");
  const asked = wantCa ? [wantCa] : inTweet.slice(0, 5);
  const known = (await env.db.prepare(`SELECT ca, symbol FROM coins WHERE ca IN (${asked.map(() => "?").join(",")})`).bind(...asked).all<{ ca: string; symbol: string | null }>()).results;
  if (!known.length) return no(404, "That coin is not in our list yet. We list Robinhood Chain coins only.");
  const coin = known[0];

  await env.db
    .prepare("INSERT INTO claims (ca, tweet_url, author, ip_hash, created_ms) VALUES (?, ?, ?, ?, ?) ON CONFLICT (ca, tweet_url) DO NOTHING")
    .bind(coin.ca, tweet.url, tweet.handle, ipHash, env.now)
    .run();
  // Website and X now (a Pages function may make 50 requests: 8 pages a site, 2 sites, 4 tweets). GitHub comes on the
  // collector's next run, so the coin goes to the front of its queue.
  const results = await checkAndSave(env.db, coin.ca, { fetch: env.fetch, now: env.now, skipGithub: true, maxPages: REQUEST_PAGES });
  await env.db.prepare("UPDATE check_queue SET wanted_ms = ? WHERE ca = ?").bind(env.now, coin.ca).run();
  return { status: 200, body: { ca: coin.ca, symbol: cleanName(coin.symbol), author: tweet.handle, results } };
}
