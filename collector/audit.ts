// Weekly second check (GitHub Actions, audit.yml). Reads the live /api/coins and looks at websites on its own, with a
// plainer and deeper reader than legit-checks.ts, so a bug there does not hide here. Writes nothing to D1. Prints a
// Markdown report of every coin where the two disagree; the workflow turns a non-empty report into a GitHub issue.
//   Legit, but the CA is no longer on the page the collector found it on (site changed, or a wrong pass).
//   Website check failed, but the CA is on the site (a missed coin, like OSTRA and own.money on 17 Nov).
import { writeFileSync } from "node:fs";
import { publicUrl } from "./src/legit-checks.ts";

const API = process.env.API_URL ?? "https://legitscan.pages.dev/api/coins";
const FILES_PER_SITE = 40; // twice the collector's 20, so a CA deep in a bundle still shows up here
const UA = "legitscan-audit/0.1 (weekly second check of public project pages)";

type Coin = { ca: string; symbol: string; legit: boolean; websites: string[]; launchForm: { website?: string | null } | null; checks: Record<string, { status: string; reason: string; sourceUrl: string | null } | null> };

// One retry: on 17 Nov a single timeout made a Legit coin (GRASS) look like its CA was gone.
async function text(url: string, tries = 2): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(15_000) });
    if (res.ok) return (await res.text()).slice(0, 3_000_000);
    if (res.status < 500) return null;
  } catch {}
  return tries > 1 ? text(url, tries - 1) : null;
}

// The page itself, then same-host scripts and JSON it names, breadth first. `at`: where the CA shows; `opened`: whether
// the first page answered at all (if not, say nothing about the coin).
export async function findCa(start: string, ca: string, limit = FILES_PER_SITE): Promise<{ at: string | null; opened: boolean }> {
  const first = publicUrl(start);
  if (!first) return { at: null, opened: false };
  let opened = false;
  const queue = [first.href];
  const seen = new Set<string>();
  while (queue.length && seen.size < limit) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    const body = await text(url);
    if (body === null) continue;
    if (url === first.href) opened = true;
    if (body.toLowerCase().includes(ca)) return { at: url, opened };
    for (const m of body.matchAll(/["'`(]((?:https?:\/\/[^"'`\s)]+)?\/?[\w./-]+\.(?:m?js|json))(?:\?[^"'`\s)]*)?["'`)]/g)) {
      const u = publicUrl(m[1], url);
      if (u && u.host === first.host && !seen.has(u.href)) queue.push(u.href);
    }
  }
  return { at: null, opened };
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>) {
  const out: R[] = [];
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]);
    }
  }));
  return out;
}

async function main() {
  const coins = ((await (await fetch(`${API}?audit=${Date.now()}`)).json()) as { coins: Coin[] }).coins;
  const lines = await pool(coins, 8, async (c): Promise<string | null> => {
    const ca = c.ca.toLowerCase();
    const site = c.checks.website;
    const link = `[${c.symbol}](https://legitscan.pages.dev/coin/robinhood/${c.ca})`;
    if (c.legit && site?.sourceUrl) {
      const r = await findCa(site.sourceUrl, ca);
      return r.at || !r.opened ? null : `- ${link}: Legit, but the CA is not on ${site.sourceUrl} any more.`;
    }
    if (site?.status === "fail" || site?.status === "error") {
      const sites = [...c.websites, c.launchForm?.website ?? ""].filter((s) => s && !/0x[0-9a-fA-F]{40}/.test(s)).slice(0, 3);
      for (const s of sites) {
        const { at } = await findCa(s, ca);
        if (at) return `- ${link}: the website check says "${site.reason}", but the CA is on ${at}.`;
      }
    }
    return null;
  });
  const found = lines.filter((l): l is string => !!l);
  const report = found.length
    ? `The weekly second check read ${coins.length} coins and disagrees with the collector on ${found.length}:\n\n${found.join("\n")}\n\nAsk Claude to look at this issue: each line is either a rule to fix or a site that changed.\n`
    : "";
  writeFileSync(process.env.REPORT ?? "audit-report.md", report);
  console.log(report || `The weekly second check read ${coins.length} coins and agrees with the collector on all of them.`);
}

if (process.argv[1]?.endsWith("audit.ts")) await main();
