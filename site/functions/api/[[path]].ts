// Every /api/* request: answered from D1 by the same code the local dev server and the collector tests use.
import type { D1Like } from '../../../collector/src/d1-types.ts'
import { claimAnswer } from '../../../collector/src/claim.ts'
import { signAnswer } from '../../../collector/src/dev-sign.ts'
import { scanAnswer } from '../../../collector/src/scan.ts'
import { apiAnswer } from '../../../collector/src/read-coins.ts'

type Ctx = { request: Request; env: { DB: D1Like; TURNSTILE_SECRET?: string }; waitUntil: (p: Promise<unknown>) => void }

const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...extra } })

// The collector writes every 5 minutes, so a minute of edge cache costs nothing and saves D1 reads.
export const onRequestGet = async ({ request, env, waitUntil }: Ctx) => {
  const cache = (globalThis.caches as unknown as { default: Cache }).default
  const hit = await cache.match(request)
  if (hit) return hit
  const { status, body } = await apiAnswer(env.DB, new URL(request.url).pathname)
  const res = json(status, body, { 'cache-control': 'public, max-age=60', 'access-control-allow-origin': '*' })
  if (status === 200) waitUntil(cache.put(request, res.clone()))
  return res
}

// POST /api/scan/{ca} (check a coin now), /api/claim (a tweet) and /api/sign (a dev signature). Same-site forms, so no CORS header: other sites cannot
// post from a visitor's browser.
export const onRequestPost = async ({ request, env }: Ctx) => {
  const path = new URL(request.url).pathname.replace(/\/+$/, '')
  const scan = path.match(/^\/api\/scan\/(0x[0-9a-fA-F]{40})$/)
  if (scan) {
    const { status, body } = await scanAnswer(scan[1], { db: env.DB, fetch: (u, i) => fetch(u, i), now: Date.now(), ip: request.headers.get('cf-connecting-ip') ?? 'unknown' })
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
