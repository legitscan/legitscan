// Local stand-in for the /api Pages function: same apiAnswer, reading the collector's local SQLite copy
// (Pages cannot reach the remote D1 in local dev). `npm run dev` proxies /api here.
//   node dev-api.ts
import { createServer } from 'node:http'
import { claimAnswer } from '../collector/src/claim.ts'
import { signAnswer } from '../collector/src/dev-sign.ts'
import { scanAnswer } from '../collector/src/scan.ts'
import { apiAnswer } from '../collector/src/read-coins.ts'
import { openSqlite } from '../collector/src/sqlite-adapter.ts'

const db = openSqlite(new URL('../collector/data/legitscan.sqlite', import.meta.url).pathname)
createServer(async (req, res) => {
  try {
    const path = new URL(req.url ?? '/', 'http://x').pathname
    const scan = path.match(/^\/api\/scan\/(0x[0-9a-fA-F]{40})$/)
    if (req.method === 'POST' && scan) {
      const { status, body } = await scanAnswer(scan[1], { db, fetch: (u, i) => fetch(u, i), now: Date.now(), ip: req.socket.remoteAddress ?? 'local' })
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify(body))
      return
    }
    if (req.method === 'POST' && (path === '/api/claim' || path === '/api/sign')) {
      let raw = ''
      for await (const chunk of req) raw += chunk
      const input = JSON.parse(raw || '{}')
      const { status, body } =
        path === '/api/sign'
          ? await signAnswer(input, db, Date.now())
          : await claimAnswer(input, { db, fetch: (u, i) => fetch(u, i), now: Date.now(), ip: req.socket.remoteAddress ?? 'local' })
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify(body))
      return
    }
    const { status, body } = await apiAnswer(db, path)
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify(body))
  } catch (e) {
    res.writeHead(500).end(JSON.stringify({ error: (e as Error).message }))
  }
}).listen(8788, '127.0.0.1', () => console.log('dev api on http://127.0.0.1:8788'))
