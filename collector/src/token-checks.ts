// POST /api/check/{ca}: a visitor checked a token: pasted its CA and pressed Check (home page, coins page search), or
// pressed Scan now on its page. Counted for /stats ("token checks"), repeats included (owner, 17 Nov), only for coins we
// list. Opening a coin page from a list or a shared link is not a check and never calls this. Not counted: bots by user
// agent, pages served from localhost (our own testing), and checks past CHECKS_PER_DAY from one visitor a day, so a
// loop cannot burn the D1 write budget (50M writes a month for all projects). One D1 write per counted check.
import type { D1Like } from "./d1-types.ts";
import { sha256 } from "./scan.ts";

export const CHECKS_PER_DAY = 300;
const BOT = /bot|crawl|spider|slurp|preview|headless|curl|wget|python|httpclient|axios|node-fetch/i;
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/;

export type TokenCheckEnv = { db: D1Like; now: number; ip: string; userAgent: string; origin: string };

export async function tokenCheckAnswer(rawCa: string, env: TokenCheckEnv): Promise<{ status: number; body: { counted: boolean } }> {
  const ca = rawCa.toLowerCase();
  const no = { status: 200, body: { counted: false } };
  if (!/^0x[0-9a-f]{40}$/.test(ca) || !env.userAgent || BOT.test(env.userAgent) || LOCAL.test(env.origin)) return no;
  if (!(await env.db.prepare("SELECT 1 AS ok FROM coins WHERE ca = ?").bind(ca).first())) return no;
  const day = new Date(env.now).toISOString().slice(0, 10);
  const ipHash = await sha256(`check|${env.ip}|${day}`);
  const r = await env.db
    .prepare("INSERT INTO token_checks (day, ip_hash, n) VALUES (?, ?, 1) ON CONFLICT (day, ip_hash) DO UPDATE SET n = n + 1 WHERE n < ?")
    .bind(day, ipHash, CHECKS_PER_DAY)
    .run();
  return { status: 200, body: { counted: r.meta.changes > 0 } };
}
