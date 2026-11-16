import { ArrowRight } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { CoinTable } from '@/components/coin-table'
import { FilmShot } from '@/components/film-shot'
import { useReveal } from '@/components/use-reveal'
import { coins, copycats } from '@/data/example-coins'
import { ago, isCa } from '@/format-coin'

const verified = coins.filter((c) => c.status === 'verified').sort((a, b) => a.ageHours - b.ageHours)
const pending = coins.filter((c) => c.status === 'pending')
const revoked = coins.filter((c) => c.status === 'revoked')

const WRAP = 'mx-auto w-full max-w-[1240px] px-4 md:px-6'

export function HomePage() {
  useReveal()
  return (
    <>
      <Hero />

      <section className={`${WRAP} py-20 md:py-28`}>
        <Head kicker="Newly verified" title="Tech coins that just proved their address." example>
          Website, X account and contract all point at each other. Newest first.
        </Head>
        <div className="reveal"><CoinTable coins={verified} /></div>
        <Link to="/coins" className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-accent underline-offset-4 hover:underline">
          All verified coins <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </section>

      <Chapter
        id="website"
        film="website"
        n="01"
        name="Website"
        title="The website has to show it."
        body="We open the project's own site and look for the full contract address. Pages that load it later get read too. A copy can borrow the name and the logo. It cannot put its address on the real site."
        link={['/method#website', 'How the website check works']}
      >
        <Proof rows={[
          ['GET', 'lumen-agent.example'],
          ['found', '0x7c3a91e0…c8e5b19d', true],
          ['where', 'footer, "Contract"'],
          ['checked', '4 min ago'],
        ]} />
      </Chapter>

      <Chapter
        id="x"
        film="xaccount"
        n="02"
        name="X account"
        title="The account it links has to post it."
        body="The X handle comes from the website, never from a search. Then a tweet from that exact account has to carry the same address. Replies and quotes from other people do not count."
        link={['/method#x', 'Why the handle comes from the site']}
        flip
        bg
      >
        <Proof rows={[
          ['site links', '@lumenagent'],
          ['tweet by', '@lumenagent', true],
          ['tweet holds', '0x7c3a91e0…c8e5b19d', true],
          ['if deleted', 'mark comes off'],
        ]} />
      </Chapter>

      <Chapter
        id="copies"
        film="copies"
        n="03"
        name="Copycats"
        title="One real contract. The rest are copies."
        body="A tech coin that gets attention gets cloned within hours, same ticker and same picture. Only one of them is on the project's website. We show which one, and list the rest as copies."
        link={['/coins', 'See copies caught today']}
      >
        <div className="pbox p-4">
          <div className="label mb-3">Same ticker, other contract</div>
          <ul className="space-y-2 font-mono text-sm">
            {copycats.map((c) => (
              <li key={c.ticker} className="flex justify-between gap-6">
                <span className="text-accent">${c.ticker}</span>
                <span className="text-body">1 real, {c.copies} copies</span>
              </li>
            ))}
          </ul>
          <p className="label mt-3">Example data</p>
        </div>
      </Chapter>

      <Chapter
        id="risk"
        film="risk"
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

      <section className={`${WRAP} py-20 md:py-28`}>
        <Head kicker="Live board" title="What changed in the last hour." example />
        <div className="grid gap-4 md:grid-cols-2">
          <Panel kicker="Waiting for proof" title="Half way there">
            {pending.map((c) => (
              <Row key={c.ca} to={`/coin/${c.chain}/${c.ca}`} left={`$${c.ticker}`} right={ago(c.checkedMinAgo)} note={c.note} />
            ))}
          </Panel>
          <Panel kicker="Lost proof" title="Checks that stopped passing">
            {revoked.map((c) => (
              <Row key={c.ca} to={`/coin/${c.chain}/${c.ca}`} left={`$${c.ticker}`} right={ago(c.checkedMinAgo)} note={c.note} warn />
            ))}
          </Panel>
        </div>
      </section>

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
    <section className="relative flex flex-col md:min-h-[calc(100svh-68px)] md:justify-center">
      <FilmShot name="hero" className="aspect-[16/10] md:absolute md:inset-0 md:aspect-auto" position="70% center" />
      <div className="pointer-events-none absolute inset-0 hidden bg-[linear-gradient(90deg,rgba(251,252,252,0.94)_0%,rgba(251,252,252,0.82)_34%,rgba(251,252,252,0)_62%)] md:block" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-40 bg-gradient-to-b from-transparent to-bg md:block" />
      <div className={`${WRAP} relative py-10 md:py-24`}>
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
            <Link to="/coins" className="font-medium text-ink underline-offset-4 hover:underline">Browse verified coins</Link>
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

function Head({ kicker, title, children, example = false }: { kicker: string; title: string; children?: ReactNode; example?: boolean }) {
  return (
    <div className="reveal mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        <div className="label">{kicker}</div>
        <h2 className="display mt-3 text-[34px] md:text-[clamp(2rem,3vw,2.6rem)]">{title}</h2>
        {children && <p className="mt-3 text-body text-pretty">{children}</p>}
      </div>
      {example && <div className="label shrink-0">Example data</div>}
    </div>
  )
}

// Two chapter looks, alternated like Rushr: `bg` = the still fills the section and fades into the page at top and
// bottom, text on the empty side; default = the still is the top of a card (uncropped 16:9) with the proof under it.
function Chapter({ id, film, n, name, title, body, link, flip = false, bg = false, children }: { id: string; film: string; n: string; name: string; title: string; body: string; link: [string, string]; flip?: boolean; bg?: boolean; children: ReactNode }) {
  const text = (
    <>
      <div className="font-mono text-sm"><span className="text-faint">{n}</span> <span className="ml-2 text-accent">{name}</span></div>
      <h2 className="display mt-4 text-[34px] md:text-[clamp(2.1rem,3.2vw,2.8rem)]">{title}</h2>
      <p className="mt-4 max-w-[460px] leading-relaxed text-body text-pretty">{body}</p>
    </>
  )
  const more = (
    <Link to={link[0]} className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-accent underline-offset-4 hover:underline">
      {link[1]} <ArrowRight size={15} aria-hidden="true" />
    </Link>
  )
  if (bg) {
    const veil = flip
      ? 'bg-[linear-gradient(270deg,rgba(251,252,252,0.95)_0%,rgba(251,252,252,0.8)_38%,rgba(251,252,252,0)_66%)]'
      : 'bg-[linear-gradient(90deg,rgba(251,252,252,0.95)_0%,rgba(251,252,252,0.8)_38%,rgba(251,252,252,0)_66%)]'
    return (
      <section id={id} className="chapter-bg relative scroll-mt-20 md:min-h-[min(84svh,780px)]">
        <FilmShot name={film} className="film-fade aspect-[16/9] md:absolute md:inset-0 md:aspect-auto" position={flip ? '20% center' : '80% center'} />
        <div className={`pointer-events-none absolute inset-0 hidden md:block ${veil}`} />
        <div className={`${WRAP} relative flex py-10 md:min-h-[min(84svh,780px)] md:items-center md:py-24`}>
          <div className={`reveal max-w-[460px] ${flip ? 'md:ml-auto' : ''}`}>
            {text}
            <div className="mt-6">{children}</div>
            {more}
          </div>
        </div>
      </section>
    )
  }
  return (
    <section id={id} className={`chapter-box ${WRAP} scroll-mt-20 py-16 md:py-24`}>
      <div className="grid items-center gap-8 md:grid-cols-[1fr_1.15fr] md:gap-16">
        <div className={`reveal ${flip ? 'md:order-2' : ''}`}>
          {text}
          {more}
        </div>
        <div className={`card reveal overflow-hidden ${flip ? 'md:order-1' : ''}`}>
          <FilmShot name={film} className="aspect-[16/9] [&_img]:!animate-none" />
          <div className="border-t border-line">{children}</div>
        </div>
      </div>
    </section>
  )
}

function Proof({ rows }: { rows: [string, string, boolean?][] }) {
  return (
    <dl className="pbox grid grid-cols-[96px_1fr] gap-x-4 gap-y-2 p-4 font-mono text-[13px] leading-relaxed">
      {rows.map(([k, v, ok]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className={ok ? 'text-accent' : 'text-ink'}>{v}{ok && ' ✓'}</dd>
        </div>
      ))}
    </dl>
  )
}

function Panel({ kicker, title, children }: { kicker: string; title: string; children: ReactNode }) {
  return (
    <div className="card reveal p-6">
      <div className="label">{kicker}</div>
      <h3 className="display mt-2 text-2xl">{title}</h3>
      <ul className="mt-4 divide-y divide-line">{children}</ul>
    </div>
  )
}

function Row({ to, left, right, note, warn = false }: { to: string; left: string; right: string; note?: string; warn?: boolean }) {
  return (
    <li>
      <Link to={to} className="block py-3.5 hover:opacity-80">
        <div className="flex justify-between font-mono text-sm">
          <span className={warn ? 'text-fail' : 'text-accent'}>{left}</span>
          <span className="text-muted">{right}</span>
        </div>
        {note && <p className="mt-1 text-sm text-body">{note}</p>}
      </Link>
    </li>
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
          <Link to="/coins" className="btn btn-dark">Browse verified coins</Link>
        </div>
      </div>
    </section>
  )
}
