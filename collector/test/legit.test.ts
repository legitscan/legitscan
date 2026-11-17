import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAndSave, dueForChecks, PASSED_RECHECK_MS, RECHECK_MS, saveChecks } from "../src/check-store.ts";
import { claimAnswer, CLAIMS_PER_HOUR } from "../src/claim.ts";
import { CHECKS_PER_DAY, tokenCheckAnswer } from "../src/token-checks.ts";
import { checkCoin, checkXMatch, ownerMatches, siteNamed, pageLinks, parseOembed, projectHandle, publicUrl, freeHost, REQUEST_PAGES, readDomainCreated, readSites, registrableDomain } from "../src/legit-checks.ts";
import type { Fetcher } from "../src/http-json.ts";
import { apiAnswer, legitLevel } from "../src/read-coins.ts";
import { openSqlite } from "../src/sqlite-adapter.ts";

const CA = "0x47b537f7c2c2183967fe5ba883291b8ada490db6";
const OTHER = "0x9525dcf8f115a4b4c4db99b3b7ceb19172363ad8";
const NOW = Date.UTC(2026, 10, 17);

type Fake = { status?: number; type?: string; body: string | object; headers?: Record<string, string> };
// A tiny internet: url -> answer. Records every URL asked, so tests can check what was (not) fetched.
function web(pages: Record<string, Fake>) {
  const asked: string[] = [];
  const fetch: Fetcher = async (url) => {
    asked.push(url);
    const oembed = url.match(/^https:\/\/publish\.x\.com\/oembed\?.*url=([^&]+)/);
    const key = oembed ? `oembed:${decodeURIComponent(oembed[1])}` : url;
    const p = pages[key];
    if (!p) return new Response("not found", { status: 404 });
    const body = typeof p.body === "string" ? p.body : JSON.stringify(p.body);
    return new Response(body, { status: p.status ?? 200, headers: { "content-type": p.type ?? (typeof p.body === "string" ? "text/html" : "application/json"), ...p.headers } });
  };
  return { fetch, asked };
}
const tweet = (handle: string, text: string) => ({
  author_url: `https://x.com/${handle}`,
  html: `<blockquote class="twitter-tweet"><p lang="en" dir="ltr">${text}</p>&mdash; Name (@${handle}) <a href="https://x.com/${handle}/status/1">Nov 1</a></blockquote>`,
});

test("publicUrl keeps plain public sites only", () => {
  assert.equal(publicUrl("https://offrouter.org/x#y")?.href, "https://offrouter.org/x");
  for (const bad of ["http://localhost/", "http://127.0.0.1/", "http://10.0.0.5/", "http://192.168.1.1/", "http://169.254.169.254/latest", "ftp://a.com/", "https://a.com:8443/", "https://u:p@a.com/", "javascript:alert(1)"]) {
    assert.equal(publicUrl(bad), null, bad);
  }
});

test("page links: X profiles, tweets, GitHub in href vs anywhere", () => {
  const l = pageLinks(`<a href="https://x.com/OffRouter">X</a> <a href="https://twitter.com/intent/tweet">share</a>
    <blockquote><a href="https://twitter.com/someone/status/1234567890?ref=a">t</a></blockquote>
    <a href="https://github.com/offrouter">code</a> /* thanks https://github.com/stranger/trail-effect */`);
  assert.deepEqual(l.xHandles, ["OffRouter"]);
  assert.deepEqual(l.tweets, ["https://x.com/someone/status/1234567890"]);
  assert.deepEqual(l.github, ["https://github.com/offrouter"]);
  assert.deepEqual(l.githubSeen.sort(), ["https://github.com/offrouter", "https://github.com/stranger/trail-effect"]);
  assert.equal(projectHandle(["OffRouter", "vitalik"], "offrouter"), "OffRouter");
  assert.equal(projectHandle(["mow"], null), "mow");
  assert.equal(projectHandle(["a_one", "b_two"], null), null); // several, none named by the listing
  assert.ok(ownerMatches("orbioso", ["orbio", "orbiodotso"]));
  assert.ok(!ownerMatches("f1shlalala", ["novaai-robinhood", "NOVAAI_7"]));
});

test("oEmbed: author and tweet text, not the byline", () => {
  const t = parseOembed(tweet("OffRouter", `CA: ${CA}<br>live now &amp; open`), "https://x.com/OffRouter/status/9")!;
  assert.equal(t.handle, "OffRouter");
  assert.equal(t.text, `CA: ${CA}\nlive now & open`);
  assert.equal(parseOembed({ error: "x" }, "u"), null);
});

test("website: CA in a JSON the bundle loads passes; listing pages and copies fail; bot checks are reported", async () => {
  const { fetch, asked } = web({
    "https://offrouter.org/": { body: `<html><a href="https://x.com/OffRouter">x</a><script src="/assets/app.js"></script></html>` },
    "https://offrouter.org/assets/app.js": { type: "text/javascript", body: `fetch("/holders").then(r=>r.json())` },
    "https://offrouter.org/holders": { body: { token: CA } },
  });
  const ok = await readSites(fetch, ["https://offrouter.org/"], CA);
  assert.equal(ok.status, "pass");
  assert.equal(ok.foundAt, "https://offrouter.org/holders");
  assert.deepEqual(ok.xHandles, ["OffRouter"]);
  assert.ok(!asked.some((u) => !u.startsWith("https://offrouter.org/")), "only the project's own site is read");

  const many = Array.from({ length: 15 }, (_, i) => "0x" + String(i + 1).padStart(40, "0")).join(" "); // 15 distinct
  const listing = await readSites(web({ "https://launchpad.fun/": { body: `${many} ${CA}` } }).fetch, ["https://launchpad.fun/"], CA);
  assert.equal(listing.status, "fail");
  assert.match(listing.reason, /listing many coins/);

  const copy = await readSites(web({ "https://real.xyz/": { body: `CA ${OTHER}` } }).fetch, ["https://real.xyz/"], CA);
  assert.equal(copy.status, "fail");

  const blocked = await readSites(web({ "https://guarded.xyz/": { status: 403, body: "Just a moment", headers: { "cf-mitigated": "challenge" } } }).fetch, ["https://guarded.xyz/"], CA);
  assert.equal(blocked.status, "error");
  assert.match(blocked.reason, /bot check/);

  // A site slower than the deadline is "could not read", never "fail": the address may be on a page we did not reach.
  let t = 0;
  const slow: Fetcher = async (u, i) => ((t += 20_000), fetch(u, i));
  const late = await readSites(slow, ["https://offrouter.org/"], CA, 14, () => t);
  assert.equal(late.status, "error");
  assert.match(late.reason, /too slow/);

  assert.equal((await readSites(fetch, [], CA)).status, "none");
  assert.equal((await readSites(fetch, ["http://localhost/"], CA)).status, "none");
});

test("X triangle: only a tweet by the account the site links counts", async () => {
  const site = { "https://offrouter.org/": { body: `${CA} <a href="https://x.com/OffRouter">x</a> <a href="https://github.com/offrouter/mcp">gh</a>` } };
  const own = "https://x.com/OffRouter/status/111111";
  const fan = "https://x.com/fan/status/222222";
  const { fetch } = web({
    ...site,
    [`oembed:${own}`]: { body: tweet("OffRouter", `CA ${CA}`) },
    [`oembed:${fan}`]: { body: tweet("fan", `CA ${CA}`) },
    "https://api.github.com/repos/offrouter/mcp": { body: { full_name: "offrouter/mcp", pushed_at: new Date(NOW - 2 * 86_400_000).toISOString(), html_url: "https://github.com/offrouter/mcp" } },
    "https://api.github.com/repos/offrouter/mcp/readme": { body: `# OffRouter MCP\n\nToken: ${CA}` },
  });
  const base = { fetch, ca: CA, websites: ["https://offrouter.org/"], listedHandle: "offrouter", now: NOW };
  const none = await checkCoin({ ...base, claimedTweets: [] });
  const by = (r: { results: { kind: string; status: string; reason: string; sourceUrl: string | null }[] }, kind: string) => r.results.find((x) => x.kind === kind)!;
  assert.deepEqual(["website", "x", "github"].map((k) => by(none, k).status), ["pass", "none", "pass"]);
  assert.equal(by(none, "xmatch").status, "pass"); // listing (offrouter) and site (OffRouter) agree
  const byFan = await checkCoin({ ...base, claimedTweets: [fan] });
  assert.equal(by(byFan, "x").status, "none"); // a fan's tweet is not a candidate at all
  const byOwner = await checkCoin({ ...base, claimedTweets: [fan, own] });
  assert.equal(by(byOwner, "x").status, "pass");
  assert.equal(by(byOwner, "x").sourceUrl, own);
  assert.match(by(byOwner, "github").reason, /2 days ago/);
  assert.equal(by(byOwner, "githubca").status, "pass"); // the README carries the CA
  assert.equal(by(byOwner, "githubca").sourceUrl, "https://github.com/offrouter/mcp#readme");

  const wrongCa = web({ ...site, [`oembed:${own}`]: { body: tweet("OffRouter", `CA ${OTHER}`) } });
  const fail = await checkCoin({ ...base, fetch: wrongCa.fetch, claimedTweets: [own], skipGithub: true });
  assert.equal(by(fail, "x").status, "fail");

  const copySite = web({ "https://offrouter.org/": { body: OTHER } });
  const copy = await checkCoin({ ...base, fetch: copySite.fetch, claimedTweets: [own], skipGithub: true });
  assert.deepEqual(["website", "x"].map((k) => by(copy, k).status), ["fail", "none"]); // no site proof, so the tweet is never read
  assert.ok(!copySite.asked.some((u) => u.includes("oembed")));
});

test("saved checks: history only on change, legit needs website and X, stats and claim flow", async () => {
  const db = openSqlite(":memory:");
  await db.prepare("INSERT INTO coins (ca, found_via, found_ms, symbol, mc_usd, websites, x_handle) VALUES (?, 'pons', 1, 'OFF', 28000, ?, 'offrouter')").bind(CA, JSON.stringify(["https://offrouter.org/"])).run();
  const pass = (kind: "website" | "x") => ({ kind, status: "pass" as const, reason: "ok", sourceUrl: "https://offrouter.org/", atMs: null });
  await saveChecks(db, CA, [pass("website"), { kind: "x", status: "none", reason: "no tweet yet", sourceUrl: null, atMs: null }], NOW);
  await saveChecks(db, CA, [pass("website")], NOW + 1000);
  let one = (await apiAnswer(db, `/api/coin/${CA}`, NOW)).body as any;
  assert.equal(one.coin.legit, false);
  assert.equal(one.coin.checks.website.passedMs, NOW); // streak start kept
  assert.equal(one.coin.checks.website.checkedMs, NOW + 1000); // last look, from check_queue
  const stored = await db.prepare("SELECT checked_ms FROM checks WHERE ca = ? AND kind = 'website'").bind(CA).first<{ checked_ms: number }>();
  assert.equal(stored?.checked_ms, NOW); // the unchanged answer was not written again
  assert.equal(one.history.length, 2);

  // Claim: the tweet is read, the coin is checked at once, and it becomes legit.
  const own = "https://x.com/OffRouter/status/333333";
  const { fetch } = web({
    "https://offrouter.org/": { body: `${CA} <a href="https://x.com/OffRouter">x</a>` },
    [`oembed:${own}`]: { body: tweet("OffRouter", `our CA ${CA}`) },
  });
  const env = { db, fetch, now: NOW + 5000, ip: "1.2.3.4" };
  assert.equal((await claimAnswer({ tweetUrl: "https://example.com/x" }, env)).status, 400);
  assert.equal((await claimAnswer({ tweetUrl: own, ca: OTHER }, env)).status, 400); // tweet does not carry that CA
  const ok = await claimAnswer({ tweetUrl: own }, env);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  one = (await apiAnswer(db, `/api/coin/${CA}`, NOW)).body as any;
  assert.equal(one.coin.legit, true);
  assert.equal(one.coin.checks.x.sourceUrl, own);
  const stats = ((await apiAnswer(db, "/api/stats", NOW)).body as any).stats;
  assert.deepEqual([stats.websitePass, stats.xPass, stats.legit, stats.claims, stats.latest.x.symbol], [1, 1, 1, 1, "OFF"]);
  const queued = await db.prepare("SELECT wanted_ms FROM check_queue WHERE ca = ?").bind(CA).first<{ wanted_ms: number }>();
  assert.equal(queued?.wanted_ms, NOW + 5000); // GitHub comes on the collector's next run

  for (let i = 0; i < CLAIMS_PER_HOUR; i++) await db.prepare("INSERT INTO claims (ca, tweet_url, author, ip_hash, created_ms) SELECT ca, tweet_url || ?, author, ip_hash, ? FROM claims LIMIT 1").bind(`?${i}`, NOW).run();
  assert.equal((await claimAnswer({ tweetUrl: own }, env)).status, 429);
  db.close();
});

test("check queue: claimed first, then never checked, then stale; no website or small MC skipped", async () => {
  const db = openSqlite(":memory:");
  const add = (n: number, mc: number, websites: string | null) =>
    db.prepare("INSERT INTO coins (ca, found_via, found_ms, mc_usd, websites) VALUES (?, 'pons', 1, ?, ?)").bind("0x" + String(n).padStart(40, "0"), mc, websites).run();
  const ca = (n: number) => "0x" + String(n).padStart(40, "0");
  const site = JSON.stringify(["https://a.xyz"]);
  await add(1, 9_000, site); // never checked
  await add(2, 50_000, site); // checked long ago
  await add(3, 50_000, site); // checked just now
  await add(4, 1_000, site); // under the floor, but claimed
  await add(5, 1_000, site); // under the floor
  await add(6, 90_000, null); // no website
  await add(7, 90_000, "[]");
  const q = (n: number, checked: number | null, wanted: number | null) => db.prepare("INSERT INTO check_queue (ca, checked_ms, wanted_ms) VALUES (?, ?, ?)").bind(ca(n), checked, wanted).run();
  await q(2, NOW - RECHECK_MS - 1, null);
  await q(3, NOW - 1000, null);
  await q(4, NOW - 1000, NOW - 10);
  await add(8, 50_000, site); // website passed, looked at 2 hours ago: not due (passed coins wait a day)
  await add(9, 50_000, site); // website passed, looked at over a day ago: due
  await q(8, NOW - 2 * RECHECK_MS, null);
  await q(9, NOW - PASSED_RECHECK_MS - 1, null);
  for (const n of [8, 9]) await db.prepare("INSERT INTO checks (ca, kind, status, reason, checked_ms) VALUES (?, 'website', 'pass', 'ok', 1)").bind(ca(n)).run();
  const due = (await dueForChecks(db, 5_000, NOW, 10)).map((r) => r.ca);
  assert.deepEqual(due, [ca(4), ca(1), ca(9), ca(2)]);

  // New coins: one look in their first 3 days whatever their MC, using the launch form's website.
  await db.prepare("INSERT INTO coins (ca, found_via, found_ms, mc_usd, launched_ms, launch_website) VALUES (?, 'pons', 1, 1200, ?, 'https://new.fun')").bind(ca(10), NOW - 3600_000).run();
  await db.prepare("INSERT INTO coins (ca, found_via, found_ms, mc_usd, launched_ms, launch_website) VALUES (?, 'pons', 1, 1200, ?, 'https://old.fun')").bind(ca(11), NOW - 4 * 86_400_000).run();
  const withNew = (await dueForChecks(db, 5_000, NOW, 10)).map((r) => r.ca);
  assert.ok(withNew.includes(ca(10)), "a new coin with a launch-form website is checked");
  assert.ok(!withNew.includes(ca(11)), "a small coin older than 3 days is not");
  await db.prepare("INSERT INTO check_queue (ca, checked_ms) VALUES (?, ?)").bind(ca(10), NOW - 2 * RECHECK_MS).run();
  assert.ok(!(await dueForChecks(db, 5_000, NOW, 10)).some((r) => r.ca === ca(10)), "and only once while under the floor");
  db.close();
});

test("domain age: registered name, RDAP date once per domain, young domains flagged", async () => {
  assert.equal(registrableDomain("https://docs.orbio.so/x"), "orbio.so");
  assert.equal(registrableDomain("https://www.shop.example.co.uk/"), "example.co.uk");
  assert.equal(registrableDomain("http://localhost/"), null);
  // Free hosting: the platform's own age is not the project's (TSR on vercel.app showed 2020 before this).
  assert.equal(registrableDomain("https://tessera-site-taupe.vercel.app/"), "tessera-site-taupe.vercel.app");
  assert.equal(freeHost("tessera-site-taupe.vercel.app"), "vercel.app");
  assert.equal(freeHost("dustprotocol.gitbook.io"), "gitbook.io");
  assert.equal(freeHost("orbio.so"), null);
  const created = new Date(Date.now() - 2 * 86_400_000).toISOString(); // 2 days old
  const { fetch, asked } = web({
    "https://rdap.org/domain/newcoin.fun": { body: { events: [{ eventAction: "last changed", eventDate: "2026-01-01T00:00:00Z" }, { eventAction: "registration", eventDate: created }] } },
    "https://rdap.org/domain/orbio.so": { body: { events: [] } },
    "https://app.newcoin.fun/": { body: `CA ${CA}` },
  });
  assert.equal(await readDomainCreated(fetch, "newcoin.fun"), Date.parse(created));
  assert.equal(await readDomainCreated(fetch, "orbio.so"), null); // registry gives no date
  assert.equal(await readDomainCreated(fetch, "unknown.fun"), null); // 404

  const db = openSqlite(":memory:");
  await db.prepare("INSERT INTO coins (ca, found_via, found_ms, mc_usd, websites) VALUES (?, 'pons', 1, 9000, ?)").bind(CA, JSON.stringify(["https://app.newcoin.fun/"])).run();
  await checkAndSave(db, CA, { fetch, now: Date.now(), skipGithub: true });
  await checkAndSave(db, CA, { fetch, now: Date.now() + 1000, skipGithub: true });
  assert.equal(asked.filter((u) => u === "https://rdap.org/domain/newcoin.fun").length, 2); // 1 direct call above + 1 from the checks
  const coin = ((await apiAnswer(db, `/api/coin/${CA}`)).body as any).coin;
  assert.deepEqual([coin.domain, coin.domainCreatedMs, coin.domainYoung], ["newcoin.fun", Date.parse(created), true]);
  db.close();
});

test("X account match: launch form, listing and website compared, no X API", () => {
  const site = (xHandles: string[], pagesRead = 3) => ({ status: "pass" as const, reason: "", foundAt: null, pagesRead, xHandles, tweets: [], github: [], githubSeen: [] });
  const m = (s: ReturnType<typeof site>, launch: string | null, listing: string | null) => checkXMatch(s, launch, listing);
  assert.equal(m(site(["orbiodotso"]), "orbiodotso", "OrbioDotSo").status, "pass");
  assert.equal(m(site(["orbiodotso"]), "orbiodotso", "OrbioDotSo").reason, "The launch form, the market listing and the website all name @orbiodotso.");
  // NOVAAI, 17 Nov: the launch form named another account than the listing and the site.
  const nova = m(site(["NOVAAI_77"]), "lalarochaas", "NOVAAI_77");
  assert.equal(nova.status, "fail");
  assert.match(nova.reason, /launch form names @lalarochaas but the market listing names @NOVAAI_77/);
  assert.match(m(site(["real_one"]), "other", null).reason, /The launch form names @other, but the website links @real_one/);
  assert.equal(m(site(["vermyxrh"]), "vermyxrh", null).reason, "The launch form and the website both name @vermyxrh.");
  assert.equal(m(site([]), "solo", null).status, "none"); // one source: nothing to compare
  assert.equal(m(site(["x1"], 0), "x1", null).status, "none"); // site not read: does not count as a source
  assert.equal(m(site(["a", "b"]), "b", null).status, "pass"); // the site may link several; the named one is among them
  // The CoinGecko page is one more named source: it must agree with the others.
  assert.equal(checkXMatch(site(["mowcatmeme"]), null, null, "mowcatmeme").status, "pass");
  assert.match(checkXMatch(site([]), "realteam", null, "someoneelse").reason, /^The launch form names @realteam but the CoinGecko page names @someoneelse\.$/);
});

test("a link with a contract address in it is a platform page, not the project's site (NOVAAI, 17 Nov)", async () => {
  const asked: string[] = [];
  const fetch: Fetcher = async (url) => (asked.push(url), new Response(`CA ${CA}`, { headers: { "content-type": "text/html" } }));
  const site = await readSites(fetch, [`https://www.ponsfamily.com/launchpad/${CA}`, `https://scan.example/token?a=${CA}`], CA);
  assert.deepEqual([site.status, asked.length], ["none", 0]);
});

test("links in a module the page's script imports are found (WAFERMAP, 17 Nov)", async () => {
  const { fetch } = web({
    "https://wafer.example/": { body: `<script type="module" src="/assets/main-1.js"></script> CA ${CA}` },
    "https://wafer.example/assets/main-1.js": { body: `import{n as e}from"./shell-2.js";const lazy=()=>import("./page-3.js");`, type: "text/javascript" },
    "https://wafer.example/assets/shell-2.js": { body: `const l=[{href:"https://x.com/wafermap"},{href:"https://github.com/wafermap/wafermap-cli"}];`, type: "text/javascript" },
  });
  const site = await readSites(fetch, ["https://wafer.example/"], CA);
  assert.equal(site.status, "pass");
  assert.deepEqual(site.xHandles, ["wafermap"]);
  assert.deepEqual(site.githubSeen, ["https://github.com/wafermap/wafermap-cli"]);
});

test("legit levels: website + launch-form X match is Legit, a project channel carrying the CA is Legit+", () => {
  const row = (status: string) => ({ status, reason: "", sourceUrl: null, atMs: null, checkedMs: 1, passedMs: null }) as any;
  const none = { website: null, x: null, xmatch: null, github: null, githubca: null, dev: null, coingecko: null };
  const site = { ...none, website: row("pass") };
  assert.equal(legitLevel({ ...none, xmatch: row("pass") }, "rushrtrade"), 0); // no website, no level
  assert.equal(legitLevel(site, "rushrtrade"), 0);
  assert.equal(legitLevel({ ...site, xmatch: row("pass") }, null), 0); // listing + site agree, but no launch form
  assert.equal(legitLevel({ ...site, xmatch: row("pass") }, "rushrtrade"), 1);
  assert.equal(legitLevel({ ...site, xmatch: row("fail") }, "rushrtrade"), 0);
  for (const k of ["x", "githubca", "dev"]) assert.equal(legitLevel({ ...site, [k]: row("pass") }, null), 2, k);
  assert.equal(legitLevel({ ...site, github: row("pass"), coingecko: row("pass") }, null), 0); // activity and listings are not proof
});

test("a scan reads as deep as the hourly run on a one-site coin, within a total cap (ZOLVA, 17 Nov)", async () => {
  // Home page with many addresses (a listing look), then a chain of scripts; the CA sits in the 11th file.
  const many = Array.from({ length: 12 }, (_, i) => "0x" + String(i + 1).padStart(40, "0")).join(" ");
  const pages: Record<string, { body: string; type?: string }> = { "https://deep.example/": { body: `${many} ${CA} <script src="/c1.js"></script>` } };
  for (let i = 1; i <= 10; i++) pages[`https://deep.example/c${i}.js`] = { body: i === 10 ? `const ca="${CA}"` : `import("./c${i + 1}.js")`, type: "text/javascript" };
  const { fetch } = web(pages);
  assert.equal((await readSites(fetch, ["https://deep.example/"], CA, 14, Date.now, REQUEST_PAGES)).status, "pass");
  assert.equal((await readSites(fetch, ["https://deep.example/"], CA, 8)).status, "fail"); // the old 8 a site
  const capped = await readSites(fetch, ["https://deep.example/", "https://two.example/", "https://three.example/"], CA, 14, Date.now, 5);
  assert.equal(capped.pagesRead, 5); // never more than the total cap across sites
});

// 17 Nov: 16 coins failed with "a page listing many coins", and their sites were their own: ostraagent.xyz shows
// "$OSTRA contract 0x68ff..." among 21 contracts, quantapools.tech "CA 0x1da8..." among 63, ponsfamily.com links its
// own token in the footer. A copy launched on a launchpad named like the coin must still not pass.
test("listing pages: the coin's own site counts, a launchpad or a copy next to it does not", async () => {
  const many = Array.from({ length: 20 }, (_, i) => "0x" + String(i + 1).padStart(40, "0")).join(" ");
  const ostra = web({ "https://ostraagent.xyz/": { body: `${many} <span class="mono">$OSTRA contract</span><code>${CA}</code>` } }).fetch;
  const own = await readSites(ostra, ["https://ostraagent.xyz/"], CA, 20, Date.now, Infinity, { names: ["OSTRA", "Ostra Agent"], namesOf: async () => [] });
  assert.deepEqual([own.status, own.foundAt], ["pass", "https://ostraagent.xyz/"]);
  assert.equal((await readSites(ostra, ["https://ostraagent.xyz/"], CA)).status, "fail"); // without names: as before

  const pad = web({ "https://launchpad.fun/": { body: `${many} ${CA}` } }).fetch;
  assert.equal((await readSites(pad, ["https://launchpad.fun/"], CA, 20, Date.now, Infinity, { names: ["OSTRA", "Ostra Agent"], namesOf: async () => [] })).status, "fail");

  const pons = web({ "https://ponsfamily.com/": { body: `${many} <a href="/launchpad/${CA}">PONS</a> <a href="/launchpad/${OTHER}">PONS</a>` } }).fetch;
  const names = ["PONS", "Pons"];
  assert.equal((await readSites(pons, ["https://ponsfamily.com/"], CA, 20, Date.now, Infinity, { names, namesOf: async () => [["Pons", "Pons"]] })).status, "fail");
  assert.equal((await readSites(pons, ["https://ponsfamily.com/"], CA, 20, Date.now, Infinity, { names, namesOf: async () => [["MEOW", "Cat"]] })).status, "pass");
});

test("a site named after its coin", () => {
  assert.ok(siteNamed("https://ufg.finance", ["UFG", "United Founders"]));
  assert.ok(siteNamed("https://thegoldengoose.live", ["GG", "Golden Goose"]));
  assert.ok(siteNamed("https://looping.gg/", ["GG", "Looping"]));
  assert.ok(siteNamed("https://app.netnet.capital/", ["NET", "NetNet"]));
  assert.ok(siteNamed("https://www.ponsbot.family/", ["PONSBOT", "Pons Bot"]));
  assert.ok(!siteNamed("https://eggs.fun/", ["GG", "GG"])); // short tickers must equal the domain name
  assert.ok(!siteNamed("https://launchpad.fun/", ["OSTRA", "Ostra Agent"]));
  assert.ok(!siteNamed("https://app.fun/", ["HAPPYAPP"])); // a 3-letter domain name is not found inside a longer name
});

test("own listing page through the database: a copy named like the site on the same page blocks it", async () => {
  const many = Array.from({ length: 20 }, (_, i) => "0x" + String(i + 1).padStart(40, "0")).join(" ");
  const { fetch } = web({ "https://ponsfamily.com/": { body: `${many} /launchpad/${CA} /launchpad/${OTHER}` } });
  const db = openSqlite(":memory:");
  const add = (ca: string, sym: string) =>
    db.prepare("INSERT INTO coins (ca, found_via, found_ms, symbol, name, websites, mc_usd) VALUES (?, 'pons', 1, ?, 'Pons', '[\"https://ponsfamily.com/\"]', 1e6)").bind(ca, sym).run();
  await add(CA, "PONS");
  await add("0x" + "e".repeat(40), "pons"); // a copy elsewhere: not on this page, does not matter
  await checkAndSave(db, CA, { fetch, now: NOW, skipGithub: true });
  const site = async () => (((await apiAnswer(db, `/api/coin/${CA}`, NOW)).body as any).coin.checks.website.status);
  assert.equal(await site(), "pass");
  await add(OTHER, "PoNs"); // a copy launched on the same launchpad, so on the same page; any spelling
  await checkAndSave(db, CA, { fetch, now: NOW + 1000, skipGithub: true });
  assert.equal(await site(), "fail");
  db.close();
});

test("the hourly run reads 20 files a site (own.money keeps its CA in file 15 to 20)", async () => {
  const pages: Record<string, { body: string; type?: string }> = { "https://deep.example/": { body: `<script src="/c1.js"></script>` } };
  for (let i = 1; i <= 17; i++) pages[`https://deep.example/c${i}.js`] = { body: i === 17 ? `const ca="${CA}"` : `import("./c${i + 1}.js")`, type: "text/javascript" };
  const { fetch } = web(pages);
  assert.equal((await readSites(fetch, ["https://deep.example/"], CA)).status, "pass");
  assert.equal((await readSites(fetch, ["https://deep.example/"], CA, 14)).status, "fail"); // the old 14
});

// Owner, 17 Nov: /stats shows how often visitors check a token (paste a CA and press Check, or Scan now), repeats
// included. Bots, our own localhost testing and coins we do not list are not counted; one visitor counts at most
// CHECKS_PER_DAY a day.
test("token checks: every check counts, capped per visitor a day, shown on /stats", async () => {
  const db = openSqlite(":memory:");
  await db.prepare("INSERT INTO coins (ca, found_via, found_ms) VALUES (?, 'pons', 1)").bind(CA).run();
  const env = { db, now: NOW, ip: "1.2.3.4", userAgent: "Mozilla/5.0 Chrome/130", origin: "https://legitscan.pages.dev" };
  assert.equal((await tokenCheckAnswer(CA, env)).body.counted, true);
  assert.equal((await tokenCheckAnswer(CA.toUpperCase().replace("0X", "0x"), env)).body.counted, true); // same visitor again
  assert.equal((await tokenCheckAnswer(CA, { ...env, ip: "5.6.7.8" })).body.counted, true);
  assert.equal((await tokenCheckAnswer(CA, { ...env, now: NOW + 86_400_000 })).body.counted, true); // the next day
  assert.equal((await tokenCheckAnswer(OTHER, { ...env, ip: "9.9.9.9" })).body.counted, false); // not a coin we list
  assert.equal((await tokenCheckAnswer(CA, { ...env, ip: "9.9.9.9", userAgent: "Twitterbot/1.0" })).body.counted, false);
  assert.equal((await tokenCheckAnswer(CA, { ...env, ip: "9.9.9.9", origin: "http://localhost:4301" })).body.counted, false);
  const stats = ((await apiAnswer(db, "/api/stats", NOW)).body as any).stats;
  assert.deepEqual([stats.tokenChecks, stats.tokenChecksToday, stats.tokenChecksSince], [4, 3, "2026-11-17"]);

  for (let i = 0; i < CHECKS_PER_DAY + 5; i++) await tokenCheckAnswer(CA, { ...env, ip: "7.7.7.7" });
  const capped = ((await apiAnswer(db, "/api/stats", NOW)).body as any).stats;
  assert.equal(capped.tokenChecksToday, 3 + CHECKS_PER_DAY); // a loop stops counting at the cap
  db.close();
});
