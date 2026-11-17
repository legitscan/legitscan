// POST /api/view/{ca}: a visitor opened a coin page. Counted for /stats ("coins checked by visitors"), once per day,
// visitor and coin, only for coins we list. Not counted: bots by user agent, pages served from localhost (our own
// testing), and more than VIEWS_PER_DAY coins from one visitor a day. One D1 write per counted view.
import type { D1Like } from "./d1-types.ts";
import { sha256 } from "./scan.ts";

export const VIEWS_PER_DAY = 200;
const BOT = /bot|crawl|spider|slurp|preview|headless|curl|wget|python|httpclient|axios|node-fetch/i;
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/;

export type ViewEnv = { db: D1Like; now: number; ip: string; userAgent: string; origin: string };

export async function viewAnswer(rawCa: string, env: ViewEnv): Promise<{ status: number; body: { counted: boolean } }> {
  const ca = rawCa.toLowerCase();
  const no = { status: 200, body: { counted: false } };
  if (!/^0x[0-9a-f]{40}$/.test(ca) || BOT.test(env.userAgent) || !env.userAgent || LOCAL.test(env.origin)) return no;
  if (!(await env.db.prepare("SELECT 1 AS ok FROM coins WHERE ca = ?").bind(ca).first())) return no;
  const day = new Date(env.now).toISOString().slice(0, 10);
  const ipHash = await sha256(`view|${env.ip}|${day}`);
  const today = await env.db.prepare("SELECT count(*) AS n FROM coin_views WHERE day = ? AND ip_hash = ?").bind(day, ipHash).first<{ n: number }>();
  if ((today?.n ?? 0) >= VIEWS_PER_DAY) return no;
  const r = await env.db.prepare("INSERT OR IGNORE INTO coin_views (day, ip_hash, ca) VALUES (?, ?, ?)").bind(day, ipHash, ca).run();
  return { status: 200, body: { counted: r.meta.changes > 0 } };
}
