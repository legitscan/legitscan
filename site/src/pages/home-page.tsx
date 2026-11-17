import { ArrowRight } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { FilmShot } from '@/components/film-shot'
import { LiveBoards } from '@/components/live-boards'
import { useReveal } from '@/components/use-reveal'
import { useApi } from '@/data/live-coins'
import { isCa, shortCa, since } from '@/format-coin'

const WRAP = 'mx-auto w-full max-w-[1240px] px-4 md:px-6'

export function HomePage() {
  useReveal()
  return (
    <>
      <Hero />

      <section className={`${WRAP} py-20 md:py-28`}>
        <Head kicker="Live from the chain" title="New, almost bonded, migrated.">
          Every Pons launch on Robinhood Chain, read from the chain about once an hour. A coin marked legit has a website that shows its address. The rest are not proven yet.
        </Head>
        <div className="reveal"><LiveBoards /></div>
        <Link to="/coins" className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-accent underline-offset-4 hover:underline">
          Every coin and its proof <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </section>

      <Chapter
        id="website"
        n="01"
        name="Website"
        title="The website has to show it."
        body="We open the project's own site and look for the full contract address. Pages that load it later get read too. A copy can borrow the name and the logo. It cannot put its address on the real site."
        link={['/method#website', 'How the website check works']}
      >
        <LatestProof kind="website" />
      </Chapter>

      <Chapter
        id="x"
        n="02"
        name="X account"
        title="The account it links has to post it."
        body="The X handle comes from the website, never from a search. Then a tweet from that exact account has to carry the same address. Replies and quotes from other people do not count."
        link={['/method#x', 'Why the handle comes from the site']}
        flip
        bg
      >
        <LatestProof kind="x" />
      </Chapter>

      <Chapter
        id="copies"
        n="03"
        name="Copycats"
        title="One real contract. The rest are copies."
        body="A tech coin that gets attention gets cloned within hours, same ticker and same picture. Only one of them is on the project's website. We show which one, and list the rest as copies."
        link={['/coins', 'Browse the coin list']}
      >
        <Copies />
      </Chapter>

      <Chapter
        id="risk"
        n="04"
        name="Risk"
        title="A real address can still rug."
        body="Legit means the address belongs to the project. It says nothing about whether the team sells. So risk sits in its own column: where it launched, whether the pool is locked, and what the owner can still change."
        link={['/method#not-safe', 'What legit does not mean']}
        flip
        bg
      >
        <div className="pbox p-4">
          <div className="label">Tokens with a website and X</div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="display text-5xl">5<span className="text-faint">/31</span></span>
            <span className="text-sm text-body">lost their liquidity anyway</span>
          </div>
          <p className="mt-2 text-xs text-muted">Robinhood Chain pools launched 10 to 16 Nov 2026. 4 of the 5 showed their address on their own site.</p>
        </div>
      </Chapter>

      <NotClaimed />
      <Builders />
      <Close />
    </>
  )
}

function Hero() {
  const [ca, setCa] = useState('')
  const [err, setErr] = useState('')
  const nav = useNavigate()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!isCa(ca)) return setErr('That is not a full contract address (0x and 40 characters).')
    nav(`/coin/robinhood/${ca.trim().toLowerCase()}`)
  }
  return (
    <section className="relative flex min-h-[calc(100svh-68px)] flex-col justify-end md:justify-center">
      <FilmShot name="hero" className="phone-backdrop hero-film !absolute inset-x-0 top-0 h-[56%] md:inset-0 md:h-full" position="70% center" />
      {/* Phone veil: the glass mark stays clear at the top, the text over the salt flat sits on near-white. */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(251,252,252,0)_0%,rgba(251,252,252,0)_26%,rgba(251,252,252,0.65)_40%,rgba(251,252,252,0.92)_54%)] md:hidden" />
      <div className="pointer-events-none absolute inset-0 hidden bg-[linear-gradient(90deg,rgba(251,252,252,0.94)_0%,rgba(251,252,252,0.82)_34%,rgba(251,252,252,0)_62%)] md:block" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-40 bg-gradient-to-b from-transparent to-bg md:block" />
      <div className={`${WRAP} relative pb-10 pt-48 md:py-24`}>
        <div className="max-w-[560px]">
          <div className="label">Built for Robinhood Chain</div>
          <h1 className="display mt-4 text-[44px] md:text-[clamp(3rem,5.4vw,4.9rem)]">Tech coins with a proven address.</h1>
          <p className="mt-5 max-w-[480px] text-lg leading-relaxed text-body text-pretty">
            We check each contract on the project's own website, its X account and its GitHub. Copies fail. Rug risk is shown on its own, because a real address can still rug.
          </p>
          <form onSubmit={submit} className="mt-8 max-w-[520px]" noValidate>
            <label htmlFor="ca" className="sr-only">Contract address</label>
            <div className="flex items-center gap-2 rounded-full border border-line-2 bg-white/90 p-1.5 pl-5 shadow-[0_1px_2px_rgba(19,33,43,0.04)] backdrop-blur transition-[border-color,box-shadow] duration-200 focus-within:border-accent/60 focus-within:shadow-[0_0_0_4px_rgba(143,221,233,0.35)]">
              <input
                id="ca"
                value={ca}
                onChange={(e) => { setCa(e.target.value); setErr('') }}
                placeholder="Paste a contract address"
                className="min-w-0 flex-1 bg-transparent py-2 font-mono text-sm outline-none placeholder:text-faint focus-visible:outline-none"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={!!err}
                aria-describedby={err ? 'ca-err' : undefined}
              />
              <button type="submit" className="btn btn-dark shrink-0">Check</button>
            </div>
            {err && <p id="ca-err" className="mt-2 pl-5 text-sm text-fail">{err}</p>}
          </form>
          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 pl-1 text-sm">
            <Link to="/coins" className="font-medium text-ink underline-offset-4 hover:underline">Browse coins</Link>
            <Link to="/claim" className="text-body underline-offset-4 hover:underline">Claim your coin</Link>
          </div>
        </div>
      </div>
      <div className="relative border-t border-line bg-bg/80 backdrop-blur md:absolute md:inset-x-0 md:bottom-0">
        <ol className={`${WRAP} grid grid-cols-2 md:grid-cols-4`}>
          {[['01', 'Website', '#website'], ['02', 'X account', '#x'], ['03', 'Copycats', '#copies'], ['04', 'Risk', '#risk']].map(([n, t, href], i) => (
            <li key={n} className={`${i % 2 ? 'border-l' : ''} border-line py-4 md:border-l md:first:border-l-0 ${i > 1 ? 'border-t md:border-t-0' : ''}`}>
              <a href={href} className="block px-3 hover:text-accent md:px-5">
                <span className="num text-xs text-faint">{n}</span>
                <span className="ml-3 text-sm font-medium">{t}</span>
              </a>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function Head({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <div className="reveal mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        <div className="label">{kicker}</div>
        <h2 className="display mt-3 text-[34px] md:text-[clamp(2rem,3vw,2.6rem)]">{title}</h2>
        {children && <p className="mt-3 text-body text-pretty">{children}</p>}
      </div>
    </div>
  )
}

// One chapter: the claim on one side, the live proof card on the other. Owner, 17 Nov: the glass check stays in the
// hero and the closing scene only; here the data is the picture. `bg` = a faint panel band, every other chapter.
function Chapter({ id, n, name, title, body, link, flip = false, bg = false, children }: { id: string; n: string; name: string; title: string; body: string; link: [string, string]; flip?: boolean; bg?: boolean; children: ReactNode }) {
  return (
    <section id={id} className={`scroll-mt-20 ${bg ? 'border-y border-line bg-panel' : ''}`}>
      <div className={`${WRAP} grid items-center gap-8 py-16 md:grid-cols-[1fr_1fr] md:gap-16 md:py-24`}>
        <div className={`reveal ${flip ? 'md:order-2' : ''}`}>
          <div className="font-mono text-sm"><span className="text-faint">{n}</span> <span className="ml-2 text-accent">{name}</span></div>
          <h2 className="display mt-4 text-[34px] md:text-[clamp(2.1rem,3.2vw,2.8rem)]">{title}</h2>
          <p className="mt-4 max-w-[460px] leading-relaxed text-body text-pretty">{body}</p>
          <Link to={link[0]} className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-accent underline-offset-4 hover:underline">
            {link[1]} <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
        <div className={`reveal ${flip ? 'md:order-1' : ''}`}>{children}</div>
      </div>
    </section>
  )
}

// The latest coin that really passed this check, from /api/stats, with the page or tweet that proves it.
function LatestProof({ kind }: { kind: 'website' | 'x' }) {
  const { loading, failed, data } = useApi('/api/stats')
  const st = data?.stats
  const p = st?.latest[kind]
  const row = (k: string, v: ReactNode, ok = false) => (
    <div key={k} className="contents">
      <dt className="text-muted">{k}</dt>
      <dd className={`min-w-0 truncate ${ok ? 'text-accent' : 'text-ink'}`}>{v}{ok && ' ✓'}</dd>
    </div>
  )
  return (
    <div className="pbox p-4">
      <div className="label mb-3">{kind === 'website' ? 'Latest website pass' : 'Latest X pass'}</div>
      {loading ? (
        <p className="text-sm text-muted">Loading from the checks…</p>
      ) : failed || !st ? (
        <p className="text-sm text-fail">Could not load. Try again in a minute.</p>
      ) : !p ? (
        <p className="text-sm text-muted">
          {kind === 'x' ? 'No coin has passed the X check yet. It needs a tweet from the account the site links.' : 'No coin has passed the website check yet.'}
        </p>
      ) : (
        <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-4 gap-y-2 font-mono text-[13px] leading-relaxed">
          {row('coin', <Link to={`/coin/robinhood/${p.ca}`} className="hover:underline">${p.symbol ?? shortCa(p.ca)}</Link>)}
          {row('found', shortCa(p.ca), true)}
          {p.sourceUrl && row(kind === 'x' ? 'tweet' : 'where', <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="hover:underline">{p.sourceUrl.replace(/^https?:\/\/(www\.)?/, '')}</a>)}
          {row('checked', `${since(p.checkedMs)} ago`)}
        </dl>
      )}
      {st && (
        <p className="label mt-3">
          {kind === 'website' ? `${st.websitePass} of ${st.checked} checked coins show their CA on their site` : `${st.xPass} coins proven on X so far`}
        </p>
      )}
    </div>
  )
}

// Tickers launched more than once on Pons in the last 3 days, from /api/copies. Real counts; which contract is the
// real one waits for the website check, so the box does not pick one.
function Copies() {
  const { loading, failed, data } = useApi('/api/copies')
  const copies = data?.copies ?? []
  return (
    <div className="pbox p-4">
      <div className="label mb-3">Same ticker, several contracts, last 3 days</div>
      {loading ? (
        <p className="text-sm text-muted">Loading from the chain…</p>
      ) : failed ? (
        <p className="text-sm text-fail">Could not load. Try again in a minute.</p>
      ) : copies.length === 0 ? (
        <p className="text-sm text-muted">No repeated ticker right now.</p>
      ) : (
        <ul className="space-y-2 font-mono text-sm">
          {copies.map((c) => (
            <li key={c.ticker} className="flex justify-between gap-6">
              <span className="truncate text-accent">${c.ticker}</span>
              <span className="shrink-0 text-body">{c.contracts} contracts</span>
            </li>
          ))}
        </ul>
      )}
      {data?.updatedMs ? <p className="label mt-3">Pons launches, updated {since(data.updatedMs)} ago</p> : null}
    </div>
  )
}

function NotClaimed() {
  const points = [
    ['Legit is not safe.', 'A proven address tells you who made the coin. It does not tell you what they will do with it.'],
    ['We cannot read X freely.', 'A tweet reaches us from the dev, the community or a market listing. We check it ourselves, but we do not search all of X.'],
    ['A fake project can pass.', 'Someone can build a site, an account and a token together. The identity is then real, and the risk column has to speak.'],
  ]
  return (
    <section className={`${WRAP} border-t border-line py-20 md:py-28`}>
      <div className="grid gap-10 md:grid-cols-[1fr_1.4fr]">
        <div className="reveal">
          <div className="label">Limits</div>
          <h2 className="display mt-3 text-[34px] md:text-[clamp(2rem,3vw,2.6rem)]">What legit does not mean.</h2>
          <p className="mt-3 text-body">Being clear about the limits is part of the check.</p>
        </div>
        <ul className="divide-y divide-line border-y border-line">
          {points.map(([t, d]) => (
            <li key={t} className="reveal py-5">
              <span className="font-semibold">{t}</span> <span className="text-body">{d}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function Builders() {
  return (
    <section className={`${WRAP} pb-20 md:pb-28`}>
      <div className="card reveal grid gap-6 p-6 md:grid-cols-[1.4fr_1fr] md:items-center md:p-10">
        <div>
          <div className="label">For builders</div>
          <h2 className="display mt-3 text-[30px] md:text-[2.3rem]">Building a tech coin? Get your address proven.</h2>
          <p className="mt-3 text-body">Paste the tweet that holds your contract address. The server checks it against your website. No form and no fee.</p>
        </div>
        <div className="flex flex-wrap gap-3 md:justify-end">
          <Link to="/claim" className="btn btn-dark">Claim your coin</Link>
          <Link to="/method" className="btn btn-ghost">Read the method</Link>
        </div>
      </div>
    </section>
  )
}

// Closing band, Rushr "community" style: centered line over a still that fades into the page at both ends.
function Close() {
  return (
    <section className="relative min-h-[520px] overflow-hidden md:min-h-[min(80svh,760px)]">
      <FilmShot name="close" className="film-fade !absolute inset-0" position="center 30%" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(251,252,252,0.6)_0%,rgba(251,252,252,0.15)_45%,rgba(251,252,252,0)_70%)]" />
      <div className={`${WRAP} relative pt-24 text-center md:pt-32`}>
        <h2 className="display reveal mx-auto max-w-2xl text-[38px] md:text-[clamp(2.4rem,4vw,3.6rem)]">Check the address before you buy.</h2>
        <div className="reveal mt-7 flex justify-center">
          <Link to="/coins" className="btn btn-dark">Browse coins</Link>
        </div>
      </div>
    </section>
  )
}
