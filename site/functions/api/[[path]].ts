// Every /api/* request: answered from D1 by the same code the local dev server and the collector tests use.
import type { D1Like } from '../../../collector/src/d1-types.ts'
import { claimAnswer } from '../../../collector/src/claim.ts'
import { signAnswer } from '../../../collector/src/dev-sign.ts'
import { scanAnswer } from '../../../collector/src/scan.ts'
import { tokenCheckAnswer } from '../../../collector/src/token-checks.ts'
import { apiAnswer } from '../../../collector/src/read-coins.ts'

// RPC_URL: a keyed Robinhood Chain RPC (Alchemy). The public node answers Cloudflare with HTTP 429, so without it a scan
// cannot read the Pons launch form; the owner sets it with `npx wrangler pages secret put RPC_URL --project-name legitscan`.
type Ctx = { request: Request; env: { DB: D1Like; TURNSTILE_SECRET?: string; RPC_URL?: string }; waitUntil: (p: Promise<unknown>) => void }

const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...extra } })

// Edge copy, stale-while-revalidate by hand: a copy under a minute old is served as is; up to 10 minutes old it is served
// at once and rebuilt in the background. Data changes once an hour (collector run) or per coin on a scan, and the coin
// page asks with ?fresh= after a scan, which is a new key. 17 Nov: from the Miami edge a rebuild of /api/coins took 3.7 s.
const FRESH_MS = 60_000
const KEEP_S = 600
const STORED = 'x-stored-ms'

export const onRequestGet = async ({ request, env, waitUntil }: Ctx) => {
  const cache = (globalThis.caches as unknown as { default: Cache }).default
  const out = { 'cache-control': 'public, max-age=60', 'access-control-allow-origin': '*' }
  // Answers from D1; a 200 also goes into the edge copy (the write is left to waitUntil, so nobody waits for it).
  const build = async () => {
    const { status, body } = await apiAnswer(env.DB, new URL(request.url).pathname)
    if (status === 200) waitUntil(cache.put(request, json(status, body, { 'cache-control': `public, max-age=${KEEP_S}`, [STORED]: String(Date.now()) })))
    return json(status, body, out)
  }
  const hit = await cache.match(request)
  if (!hit) return build()
  // ponytail: every visitor in the stale window starts a rebuild; a lock key in the cache if D1 reads ever matter.
  if (Date.now() - Number(hit.headers.get(STORED) ?? 0) > FRESH_MS) waitUntil(build())
  return new Response(hit.body, { status: hit.status, headers: { 'content-type': 'application/json; charset=utf-8', ...out } })
}

// POST /api/scan/{ca} (check a coin now), /api/check/{ca} (a visitor checked a token, for /stats), /api/claim (a tweet) and /api/sign (a dev signature). Same-site forms, so no CORS header: other sites cannot
// post from a visitor's browser.
export const onRequestPost = async ({ request, env }: Ctx) => {
  const path = new URL(request.url).pathname.replace(/\/+$/, '')
  const scan = path.match(/^\/api\/scan\/(0x[0-9a-fA-F]{40})$/)
  if (scan) {
    const { status, body } = await scanAnswer(scan[1], { db: env.DB, fetch: (u, i) => fetch(u, i), now: Date.now(), ip: request.headers.get('cf-connecting-ip') ?? 'unknown', rpcUrl: env.RPC_URL })
    return json(status, body, { 'cache-control': 'no-store' })
  }
  const check = path.match(/^\/api\/check\/(0x[0-9a-fA-F]{40})$/)
  if (check) {
    const h = request.headers
    const { status, body } = await tokenCheckAnswer(check[1], { db: env.DB, now: Date.now(), ip: h.get('cf-connecting-ip') ?? 'unknown', userAgent: h.get('user-agent') ?? '', origin: h.get('origin') ?? h.get('referer') ?? '' })
    return json(status, body, { 'cache-control': 'no-store' })
  }
  if (path !== '/api/claim' && path !== '/api/sign') return json(404, { error: 'not found' })
  // Read as text and cap it: a missing or false content-length header must not let a big body through.
  const raw = await request.text()
  if (raw.length > 4_000) return json(413, { error: 'too large' })
  let input: unknown
  try {
    input = JSON.parse(raw)
  } catch {
    return json(400, { error: 'Send JSON.' })
  }
  if (path === '/api/sign') {
    const { status, body } = await signAnswer(input, env.DB, Date.now())
    return json(status, body, { 'cache-control': 'no-store' })
  }
  const { status, body } = await claimAnswer(input, {
    db: env.DB,
    fetch: (u, i) => fetch(u, i),
    now: Date.now(),
    ip: request.headers.get('cf-connecting-ip') ?? 'unknown',
    turnstileSecret: env.TURNSTILE_SECRET,
  })
  return json(status, body, { 'cache-control': 'no-store' })
}
