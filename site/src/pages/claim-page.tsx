import { ArrowRight } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { CheckMark } from '@/components/check-mark'
import { SectionHead } from '@/components/section-head'
import type { CheckKind, CheckStatus } from '@/data/live-coins'
import { isCa } from '@/format-coin'

type Result = { kind: CheckKind; status: CheckStatus; reason: string; sourceUrl: string | null }
type Answer = { ca?: string; symbol?: string | null; author?: string; results?: Result[]; error?: string }

// Cloudflare Turnstile shows only when the owner has set VITE_TURNSTILE_SITE_KEY at build time. Without it the server
// still limits claims per sender.
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined
type Turnstile = { render: (el: HTMLElement, o: { sitekey: string; callback: (t: string) => void }) => void }

const NAMES: Record<CheckKind, string> = { website: 'CA on the website', x: 'CA posted by the X account the site links', xmatch: 'Same X account everywhere', github: 'GitHub', githubca: 'CA on GitHub', dev: 'Signed by the launch wallet', coingecko: 'Listed on CoinGecko' }

// /claim: a dev or anyone sends a tweet that carries a coin's CA. The server reads the tweet and checks the project's
// own website right away. The tweet only counts when its author is the account that website links. Below it, the dev
// can sign with the launch wallet instead (DevSign).
export function ClaimPage() {
  const [params] = useSearchParams()
  const [tweetUrl, setTweetUrl] = useState('')
  const [ca, setCa] = useState(params.get('ca') ?? '')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [answer, setAnswer] = useState<Answer | null>(null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!SITE_KEY || !box.current) return
    const el = box.current
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true
    s.onload = () => (window as unknown as { turnstile: Turnstile }).turnstile.render(el, { sitekey: SITE_KEY, callback: setToken })
    document.head.appendChild(s)
    return () => s.remove()
  }, [])

  async function send(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setAnswer(null)
    try {
      const res = await fetch('/api/claim', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tweetUrl: tweetUrl.trim(), ca: ca.trim() || undefined, turnstileToken: token || undefined }),
      })
      setAnswer((await res.json()) as Answer)
    } catch {
      setAnswer({ error: 'Could not reach the server. Try again in a minute.' })
    } finally {
      setBusy(false)
    }
  }

  const caBad = ca.trim() !== '' && !isCa(ca)
  const legit = ['website', 'x'].every((k) => answer?.results?.some((r) => r.kind === k && r.status === 'pass'))

  return (
    <main className="mx-auto max-w-[1240px] px-4 pb-24 pt-10 md:px-6 md:pt-14">
      <SectionHead kicker="Claim" title="Send the tweet that carries your CA.">
        We read the tweet, then your website. The coin is marked legit when your own site shows the full address and links the X account
        that posted it. Anyone can send a tweet; only the checks decide.
      </SectionHead>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <form onSubmit={send} className="card flex flex-col gap-4 p-5 md:p-6">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Tweet link</span>
            <input
              required
              type="url"
              inputMode="url"
              value={tweetUrl}
              onChange={(e) => setTweetUrl(e.target.value)}
              placeholder="https://x.com/yourproject/status/..."
              className="min-h-12 rounded-[10px] border border-line-2 bg-surface px-3 font-mono text-sm"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Contract address <span className="font-normal text-muted">(optional, when the tweet has several)</span></span>
            <input
              value={ca}
              onChange={(e) => setCa(e.target.value)}
              placeholder="0x…"
              aria-invalid={caBad}
              className="min-h-12 rounded-[10px] border border-line-2 bg-surface px-3 font-mono text-sm"
            />
            {caBad && <span className="text-sm text-fail">That is not a full 0x address.</span>}
          </label>
          {SITE_KEY && <div ref={box} />}
          <button type="submit" disabled={busy || caBad || (!!SITE_KEY && !token)} className="btn btn-dark self-start disabled:opacity-50">
            {busy ? 'Checking the tweet and your site…' : 'Check it'}
          </button>
          <p className="text-xs text-muted">At most 5 claims an hour from one connection. We keep the tweet link and its author, not your IP.</p>
        </form>

        <div aria-live="polite">
          {!answer ? (
            <ol className="flex flex-col gap-4 text-sm text-body">
              <li><span className="num mr-2 text-accent">1</span>Post the full contract address from your project's X account.</li>
              <li><span className="num mr-2 text-accent">2</span>Put the same address on your website, and link that X account from it.</li>
              <li><span className="num mr-2 text-accent">3</span>Make sure the coin's market listing (DexScreener) names your website. We take the website from there, never from the claim.</li>
              <li><span className="num mr-2 text-accent">4</span>Send the tweet here. A deleted tweet takes the mark off on the next check.</li>
            </ol>
          ) : answer.error ? (
            <div className="card p-5 text-fail">{answer.error}</div>
          ) : (
            <div className="card p-5 md:p-6">
              <div className="label">{legit ? 'Legit+' : 'Not proven yet'}</div>
              <h2 className="mt-1 text-xl font-semibold">
                {answer.symbol ? `$${answer.symbol}` : 'This coin'}: tweet by @{answer.author}
              </h2>
              <ul className="mt-3 divide-y divide-line">
                {answer.results?.map((r) => (
                  <li key={r.kind} className="grid grid-cols-[24px_1fr] gap-3 py-3">
                    <span className="pt-0.5"><CheckMark value={r.status} label={NAMES[r.kind]} /></span>
                    <div>
                      <div className="font-medium">{NAMES[r.kind]}</div>
                      <p className="text-sm text-muted">{r.reason}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-sm text-muted">GitHub is checked on the next scanner run, within a few minutes.</p>
              {answer.ca && (
                <Link to={`/coin/robinhood/${answer.ca}`} className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-accent hover:underline">
                  Open the coin page <ArrowRight size={14} aria-hidden="true" />
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      <DevSign initialCa={ca} />
    </main>
  )
}

type Eip1193 = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> }
type SignState = { busy: boolean; error?: string; done?: { symbol: string | null; ca: string; wallet: string } }

// Dev sign: the wallet that launched the token signs a message. personal_sign only, so it sends nothing and costs no gas.
function DevSign({ initialCa }: { initialCa: string }) {
  const [ca, setCa] = useState(initialCa)
  const [st, setSt] = useState<SignState>({ busy: false })
  useEffect(() => setCa(initialCa), [initialCa])

  async function sign() {
    const eth = (window as unknown as { ethereum?: Eip1193 }).ethereum
    if (!eth) return setSt({ busy: false, error: "No wallet found in this browser. Open this page in your wallet app's browser (MetaMask, Rabby, Coinbase Wallet)." })
    setSt({ busy: true })
    try {
      const [wallet] = (await eth.request({ method: 'eth_requestAccounts' })) as string[]
      const ask = await fetch(`/api/sign-message/${ca.trim().toLowerCase()}/${wallet.toLowerCase()}`)
      const msg = (await ask.json()) as { message?: string; issuedMs?: number; error?: string }
      if (!ask.ok || !msg.message) return setSt({ busy: false, error: msg.error ?? 'Could not get the message to sign.' })
      const hex = '0x' + [...new TextEncoder().encode(msg.message)].map((b) => b.toString(16).padStart(2, '0')).join('')
      const signature = (await eth.request({ method: 'personal_sign', params: [hex, wallet] })) as string
      const res = await fetch('/api/sign', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ca: ca.trim().toLowerCase(), wallet: wallet.toLowerCase(), issuedMs: msg.issuedMs, signature }),
      })
      const out = (await res.json()) as { ca?: string; symbol?: string | null; wallet?: string; error?: string }
      if (!res.ok || !out.ca || !out.wallet) return setSt({ busy: false, error: out.error ?? 'The signature was not accepted.' })
      setSt({ busy: false, done: { symbol: out.symbol ?? null, ca: out.ca, wallet: out.wallet } })
    } catch (e) {
      const code = (e as { code?: number }).code
      setSt({ busy: false, error: code === 4001 ? 'You cancelled in the wallet. Nothing was signed.' : 'The wallet did not answer. Try again.' })
    }
  }

  return (
    <section className="card mt-8 grid gap-6 p-5 md:grid-cols-2 md:p-6" aria-labelledby="dev-sign-h">
      <div>
        <div className="label">Are you the dev?</div>
        <h2 id="dev-sign-h" className="mt-1 text-xl font-semibold">Sign with the wallet that launched the token.</h2>
        <p className="mt-2 text-sm text-body">
          Your wallet shows a short message naming the token. Signing sends nothing, costs no gas and needs no seed phrase. Only the launch wallet
          can make this signature, so it proves you launched the token. With the CA on your website, that makes the coin legit, no tweet needed.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Contract address</span>
          <input value={ca} onChange={(e) => setCa(e.target.value)} placeholder="0x…" className="min-h-12 rounded-[10px] border border-line-2 bg-surface px-3 font-mono text-sm" />
        </label>
        <button type="button" onClick={sign} disabled={st.busy || !isCa(ca)} className="btn btn-dark self-start disabled:opacity-50">
          {st.busy ? 'Waiting for your wallet…' : 'Connect wallet and sign'}
        </button>
        <div aria-live="polite" className="text-sm">
          {st.error && <p className="text-fail">{st.error}</p>}
          {st.done && (
            <p className="text-pass">
              Signed by {st.done.wallet.slice(0, 6)}…{st.done.wallet.slice(-4)}, the wallet that launched {st.done.symbol ? `$${st.done.symbol}` : 'this token'}.{' '}
              <Link to={`/coin/robinhood/${st.done.ca}`} className="underline">Open the coin page</Link>
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

