import { ArrowLeft, ExternalLink } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { CaCopyButton } from '@/components/ca-copy-button'
import { CheckMark } from '@/components/check-mark'
import { findCoin, type Check, type Coin } from '@/data/example-coins'
import { age, ago, usd } from '@/format-coin'

const STATUS = {
  verified: ['Legit: CA proven', 'text-pass'],
  pending: ['Waiting for proof', 'text-warn'],
  revoked: ['Proof lost', 'text-fail'],
} as const

export function CoinPage() {
  const { ca = '' } = useParams()
  const c = findCoin(ca)
  if (!c) return <NotListed ca={ca} />
  const [statusText, statusCls] = STATUS[c.status]

  return (
    <main className="mx-auto max-w-[1240px] px-4 pb-24 pt-8 md:px-6 md:pt-12">
      <Link to="/coins" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft size={15} aria-hidden="true" /> All coins
      </Link>
      <p className="label mt-2">Example data.</p>

      <header className="mt-4 flex flex-col gap-4 border-b border-line pb-8 md:flex-row md:items-end md:justify-between">
        <div>
          <div className={`font-mono text-sm font-semibold ${statusCls}`}>{statusText}</div>
          <h1 className="mt-2 display text-5xl">
            {c.name} <span className="font-mono text-2xl text-accent">${c.ticker}</span>
          </h1>
          <p className="mt-2 text-muted">{c.what}</p>
          {c.note && <p className={`mt-2 text-sm ${statusCls}`}>{c.note}</p>}
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <CaCopyButton ca={c.ca} ticker={c.ticker} />
          <span className="font-mono text-xs text-muted">
            {c.source === 'claimed' ? 'Claimed by dev' : 'Found by scanner'}, checked {ago(c.checkedMinAgo)}
          </span>
        </div>
      </header>

      <div className="mt-8 grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <section className="card p-5 md:p-6" aria-labelledby="id-h">
          <div className="label">Legit</div>
          <h2 id="id-h" className="mt-1 text-xl font-semibold">Does this CA belong to the project?</h2>
          <ul className="mt-5 divide-y divide-line">
            <Proof name="CA on the website" value={c.checks.website} src={`https://${c.website}`} srcText={c.website}>
              {c.checks.website === 'pass' ? 'Full address found in the page.' : c.checks.website === 'fail' ? 'The site does not show this address.' : 'Not checked yet.'}
            </Proof>
            <Proof name="CA tweeted by the site's X account" value={c.checks.x} src={`https://x.com/${c.xHandle}`} srcText={`@${c.xHandle}`}>
              {c.checks.x === 'pass' ? `Tweet from @${c.xHandle} holds the full address. The site links to this account.` : c.checks.x === 'fail' ? 'Tweet gone or the account changed.' : 'No tweet with the address yet.'}
            </Proof>
            <Proof name="GitHub active" value={c.checks.github} src={c.github ? `https://github.com/${c.github}` : undefined} srcText={c.github}>
              {c.lastCommitHoursAgo !== undefined ? `Last commit ${age(c.lastCommitHoursAgo)} ago.` : 'No repo linked.'}
            </Proof>
            <Proof name="Paid x402 calls" value={c.checks.x402}>
              {c.x402Usdg !== undefined ? `${c.x402Usdg.toLocaleString('en-US')} USDG received through x402.` : 'No x402 endpoint found.'}
            </Proof>
          </ul>
        </section>

        <section className="card p-5 md:p-6" aria-labelledby="risk-h">
          <div className="label">Risk</div>
          <h2 id="risk-h" className="mt-1 text-xl font-semibold">How easy is a rug?</h2>
          <dl className="mt-5 divide-y divide-line text-sm">
            <Fact k="Launched on" v={c.venue} />
            <Fact k="Liquidity" v={c.lpLocked ? `${usd(c.liqUsd)}, locked` : `${usd(c.liqUsd)}, not locked`} warn={!c.lpLocked} />
            <Fact k="Owner can" v={c.ownerPowers.length ? c.ownerPowers.join(', ') : 'nothing found'} warn={c.ownerPowers.length > 0} />
            <Fact k="Burned" v={`${c.burnedPct}%`} />
            <Fact k="Same ticker, other CA" v={c.lookalikes ? `${c.lookalikes} tokens` : 'none'} warn={c.lookalikes > 0} />
            <Fact k="Market cap" v={c.mcUsd ? usd(c.mcUsd) : 'no data'} />
            <Fact k="Age" v={age(c.ageHours)} />
          </dl>
          <p className="mt-5 text-xs text-muted">Locked liquidity does not stop the team from selling. Not a safety rating.</p>
        </section>
      </div>

      <History coin={c} />
    </main>
  )
}

function Proof({ name, value, src, srcText, children }: { name: string; value: Check; src?: string; srcText?: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[24px_1fr] gap-3 py-4">
      <span className="pt-0.5"><CheckMark value={value} label={name} /></span>
      <div>
        <div className="font-medium">{name}</div>
        <p className="mt-0.5 text-sm text-muted">{children}</p>
        {src && (
          <a href={src} className="mt-1 inline-flex items-center gap-1 font-mono text-xs text-accent hover:underline" rel="noopener noreferrer" target="_blank">
            {srcText} <ExternalLink size={12} aria-hidden="true" />
          </a>
        )}
      </div>
    </li>
  )
}

function Fact({ k, v, warn = false }: { k: string; v: string; warn?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-3">
      <dt className="text-muted">{k}</dt>
      <dd className={`text-right font-mono ${warn ? 'text-warn' : ''}`}>{v}</dd>
    </div>
  )
}

function History({ coin: c }: { coin: Coin }) {
  const rows = [
    [ago(c.checkedMinAgo), c.status === 'revoked' ? 'Re-check failed, mark removed' : 'Re-check passed'],
    [`${age(Math.max(c.ageHours - 1, 1))} ago`, c.source === 'claimed' ? 'Dev sent the launch tweet' : 'Scanner found website and X on the market feed'],
    [`${age(c.ageHours)} ago`, 'Token created on chain'],
  ]
  return (
    <section className="mt-10">
      <div className="label">History</div>
      <ol className="mt-4 border-l border-line pl-5">
        {rows.map(([t, e]) => (
          <li key={e} className="relative pb-5">
            <span className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-accent" />
            <div className="font-mono text-xs text-muted">{t}</div>
            <div className="text-sm">{e}</div>
          </li>
        ))}
      </ol>
    </section>
  )
}

function NotListed({ ca }: { ca: string }) {
  return (
    <main className="mx-auto max-w-2xl px-4 pb-24 pt-16 md:px-6">
      <div className="label">Not in the list</div>
      <h1 className="mt-2 display text-4xl">We have not checked this address yet.</h1>
      <p className="mt-3 break-all font-mono text-sm text-muted">{ca}</p>
      <p className="mt-4 text-muted">
        Once the scanner runs, a pasted address gets checked here on the spot. If this is your project, send the tweet that holds the CA.
      </p>
      <Link to="/claim" className="mt-6 inline-flex min-h-12 items-center btn btn-dark">Claim this coin</Link>
    </main>
  )
}
