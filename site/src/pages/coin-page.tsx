import { ArrowLeft, ArrowRight, ExternalLink } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { CaCopyButton } from '@/components/ca-copy-button'
import { CheckMark } from '@/components/check-mark'
import { ScanNotice } from '@/components/scan-notice'
import { CoinIcon } from '@/components/live-coin-table'
import { coinName, migratedMs, useApi, type CheckKind, type CheckRow, type LiveCoin } from '@/data/live-coins'
import { isCa, pctText, shortCa, since, usd } from '@/format-coin'

export function CoinPage() {
  const { ca = '' } = useParams()
  const valid = isCa(ca)
  // fresh changes the URL after a scan, so the 60 s edge cache does not hand back the answer from before it.
  const [fresh, setFresh] = useState(0)
  const { loading, failed, notFound, data } = useApi(valid ? `/api/coin/${ca.toLowerCase()}${fresh ? `?fresh=${fresh}` : ''}` : '/api/coin/invalid')
  const scan = useScan(ca.toLowerCase(), () => setFresh(Date.now()))
  const shown = data?.coin?.ca === ca.toLowerCase() ? data.coin : null
  // A coin nobody has checked yet gets checked as soon as someone opens it, once per visit.
  const autoScanned = useRef('')
  useEffect(() => {
    if (!shown || shown.checks.website || autoScanned.current === shown.ca) return
    if (!shown.websites.length && shown.launchForm && !shown.launchForm.website) return // nothing to read
    autoScanned.current = shown.ca
    scan.run()
  }, [shown, scan.run])
  if (!valid || notFound) return <NotListed ca={ca} />
  if (loading && !shown) return <Shell><p className="mt-10 text-muted">Loading this coin…</p></Shell>
  if (failed || !data || !shown) return <Shell><p className="mt-10 text-fail">Could not load this coin. Try again in a minute.</p></Shell>
  const c = shown
  const name = coinName(c)

  return (
    <Shell>
      <header className="mt-4 flex flex-col gap-4 border-b border-line pb-8 md:flex-row md:items-end md:justify-between">
        <div className="flex items-center gap-4">
          <CoinIcon coin={c} size={56} />
          <div>
            <LegitLine coin={c} />
            <h1 className="display mt-1 text-4xl md:text-5xl">
              {c.name ?? name} {c.symbol && <span className="font-mono text-2xl text-accent">${c.symbol}</span>}
            </h1>
          </div>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <CaCopyButton ca={c.ca} ticker={c.symbol ?? 'TOKEN'} />
          <span className="font-mono text-xs text-muted">{data.updatedMs ? `Data updated ${since(data.updatedMs)} ago` : 'Robinhood Chain'}</span>
        </div>
      </header>

      <ScanNotice className="mt-6" />

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <section className="card p-5 md:p-6" aria-labelledby="id-h">
          <div className="label">Legit report</div>
          <h2 id="id-h" className="mt-1 text-xl font-semibold">Does this CA belong to the project?</h2>
          <p className="mt-2 text-sm text-muted">{LEVEL_TEXT[c.legitLevel]}</p>
          <ScanLine scan={scan} />
          <ul className="mt-3 divide-y divide-line">
            {KINDS.map(([kind, name]) => <Proof key={kind} name={name} row={c.checks[kind]} fallback={notChecked(c, kind)} />)}
          </ul>
          {data.devSignature && <SignatureProof sig={data.devSignature} />}
          {c.launchForm && <LaunchForm form={c.launchForm} />}
          {c.legitLevel < 2 && (
            <Link to={`/claim?ca=${c.ca}`} className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-accent hover:underline">
              Your project? Send the tweet or sign with the launch wallet <ArrowRight size={14} aria-hidden="true" />
            </Link>
          )}
        </section>

        <section className="card p-5 md:p-6" aria-labelledby="risk-h">
          <div className="label">Risk</div>
          <h2 id="risk-h" className="mt-1 text-xl font-semibold">How easy is a rug?</h2>
          <dl className="mt-3 divide-y divide-line text-sm">
            <Fact k="Trades on" v={c.bonded === false ? 'Pons bonding curve' : c.dex ?? 'no data'} />
            {c.bondPct !== null && <Fact k="Curve" v={c.bonded ? `migrated${migratedMs(c) ? ` ${since(migratedMs(c))} ago` : ''}` : `${pctText(c.bondPct)} filled`} />}
            <Fact k="Market cap" v={c.mcUsd !== null ? usd(c.mcUsd) : 'no data'} />
            <Fact k="Liquidity" v={c.liqUsd !== null ? `${usd(c.liqUsd)}${c.mcOverLiq ? `, MC is ${c.mcOverLiq}x` : ''}` : 'no data'} warn={!!c.mcNotBacked} />
            <Fact k="Holders" v={c.holders !== null ? String(c.holders) : 'no data'} />
            <Fact k="Owner can" v={c.powers === null ? 'no data' : c.powers.length ? c.powers.join(', ') : 'nothing found'} warn={!!c.powers?.length} />
            <Fact k="Burned" v={pctText(c.burnedPct)} />
            {c.freeHost ? (
              <Fact k="Website address" v={`free hosting (${c.freeHost}), no own domain`} warn />
            ) : (
              c.domain && <Fact k="Website domain registered" v={c.domainCreatedMs ? `${since(c.domainCreatedMs)} ago (${c.domain})` : `no data (${c.domain})`} warn={!!c.domainYoung} />
            )}
            <Fact k="Same ticker, other CA" v={c.sameTicker === null ? 'no data' : c.sameTicker ? `${c.sameTicker} token${c.sameTicker > 1 ? 's' : ''}` : 'none'} warn={!!c.sameTicker} />
          </dl>
          {c.mcNotBacked && <p className="mt-3 text-sm text-warn">MC is over 100x the liquidity: a small trade sets this price.</p>}
          {c.domainYoung && <p className="mt-3 text-sm text-warn">The website's domain was registered less than a week ago.</p>}
          {c.freeHost && <p className="mt-3 text-sm text-warn">The website runs on free hosting ({c.freeHost}). Anyone can make one in a minute, with no domain to buy.</p>}
          <p className="mt-4 text-xs text-muted">Not a safety rating.</p>
        </section>
      </div>

      <section className="card mt-4 p-5 md:p-6" aria-labelledby="dev-h">
        <div className="label">Dev report</div>
        <h2 id="dev-h" className="mt-1 text-xl font-semibold">What the creator did with this token</h2>
        <p className="mt-2 text-sm text-muted">Separate from the Legit report: it shows behavior, it does not prove who made the coin. A burn is a good sign, not a promise; the dev can hold more in other wallets.</p>
        {c.dev ? (
          <dl className="mt-3 grid gap-x-10 divide-y divide-line text-sm md:grid-cols-2 md:divide-y-0">
            <Fact k="Wallet" v={shortCa(c.dev)} />
            <Fact k="Coins launched by this wallet" v={c.devLaunches !== null ? String(c.devLaunches) : 'no data'} warn={(c.devLaunches ?? 0) >= 2} />
            <Fact k="Received" v={pctText(c.devGotPct)} />
            <Fact k="Burned" v={ofGot(c.devBurnedPct, c.devGotPct)} good={share(c.devBurnedPct, c.devGotPct) >= 0.5} />
            <Fact k="Sent to pools or routers (sells, liquidity)" v={ofGot(c.devToContractPct, c.devGotPct)} warn={share(c.devToContractPct, c.devGotPct) >= 0.5} />
            <Fact k="Sent to other wallets" v={ofGot(c.devToWalletPct, c.devGotPct)} warn={share(c.devToWalletPct, c.devGotPct) >= 0.25} />
            <Fact k="Holds now" v={pctText(c.devHoldsPct)} />
            <Fact k="Top 10 wallets hold" v={pctText(c.top10Pct)} warn={c.top10Pct !== null && c.top10Pct > 50} good={c.top10Pct !== null && c.top10Pct <= 50} />
          </dl>
        ) : (
          <p className="mt-3 text-sm text-muted">No dev wallet known for this coin yet.</p>
        )}
        {!c.checkedMs && <p className="mt-3 text-sm text-muted">Deep check not done yet. Coins over $5k MC get it within the hour.</p>}
      </section>

      <section className="mt-10">
        <div className="label">History</div>
        <ol className="mt-4 border-l border-line pl-5">
          {([
            ...(data.history ?? []).map((h) => [h.atMs, `${KIND_NAME[h.kind]}: ${STATUS_WORD[h.status]}. ${h.reason}`] as const),
            [c.checkedMs, 'Holders, contract and dev wallet checked'],
            [c.bonded ? migratedMs(c) : null, 'Left the Pons curve for its DEX pool'],
            [c.launchedMs ?? c.pairCreatedMs, c.launchedMs ? 'Launched on Pons' : 'First trading pair'],
          ] as const)
            .filter(([t]) => t !== null)
            .sort((a, b) => (b[0] ?? 0) - (a[0] ?? 0))
            .map(([t, e]) => (
              <li key={e} className="relative pb-5">
                <span className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-accent" />
                <div className="font-mono text-xs text-muted">{since(t)} ago</div>
                <div className="text-sm">{e}</div>
              </li>
            ))}
        </ol>
      </section>
    </Shell>
  )
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto max-w-[1240px] px-4 pb-24 pt-8 md:px-6 md:pt-12">
      <Link to="/coins" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft size={15} aria-hidden="true" /> All coins
      </Link>
      {children}
    </main>
  )
}

const KINDS: [CheckKind, string][] = [
  ['website', "CA on the project's website"],
  ['x', 'CA posted by the X account the site links'],
  ['xmatch', 'Same X account on the launch form, the listing and the website'],
  ['dev', 'Signed by the wallet that launched the token'],
  ['github', 'GitHub the site links, pushed in the last 30 days'],
  ['githubca', 'CA in that GitHub (README or description), a bonus'],
  ['coingecko', 'Listed on CoinGecko for Robinhood Chain'],
]
const KIND_NAME: Record<CheckKind, string> = { website: 'Website check', x: 'X check', xmatch: 'X account match', github: 'GitHub check', githubca: 'CA on GitHub', dev: 'Dev sign', coingecko: 'CoinGecko' }
const STATUS_WORD = { pass: 'passed', fail: 'failed', none: 'nothing to check yet', error: 'could not read' } as const

const LEVEL_TEXT = {
  0: 'Not proven yet. Legit needs the website to show this address, plus the X account from the Pons launch form matching the one the site links. Legit+ needs a tweet, the GitHub README or the launch wallet\'s signature to carry the address too.',
  1: "Legit: the project's website shows this address, and the X account typed into the Pons launch form is the one that site links. For Legit+, a tweet from that account, the GitHub README or the launch wallet's signature has to carry the address.",
  2: "Legit+: the project's website shows this address, and a second channel the project controls carries it too (see the rows below).",
} as const

// Before the first check runs: say what the listing has, without judging it.
function notChecked(c: LiveCoin, kind: CheckKind) {
  const site = c.websites[0] ?? c.launchForm?.website
  if (kind === 'website') return site ? `Website: ${site.replace(/^https?:\/\//, '')}. Not read yet.` : 'No website on the market listing or the launch form, so there is nothing to check.'
  if (kind === 'x') return 'Waits for the website check.'
  if (kind === 'coingecko') return 'Not compared with CoinGecko yet.'
  if (kind === 'dev') return c.dev ? `Not signed. The launch wallet is ${shortCa(c.dev)}; its owner can sign on the claim page.` : 'We do not know the launch wallet yet.'
  return 'Waits for the website check.'
}

type Scan = { state: 'idle' | 'running' | 'done' | 'rested' | 'failed'; note: string; run: () => void }

// POST /api/scan/{ca}: the server reads the website (and the Pons launch form) now, then the page reloads the coin.
function useScan(ca: string, reload: () => void): Scan {
  const [state, setState] = useState<Scan['state']>('idle')
  const [note, setNote] = useState('')
  const reloadRef = useRef(reload)
  reloadRef.current = reload
  const run = useCallback(async () => {
    setState('running')
    setNote('')
    try {
      const r = await fetch(`/api/scan/${ca}`, { method: 'POST' })
      const body = (await r.json()) as { scanned?: boolean; checkedMs?: number; error?: string }
      if (!r.ok) {
        setState('failed')
        setNote(body.error ?? 'Scan failed. Try again in a minute.')
        return
      }
      setState(body.scanned ? 'done' : 'rested')
      reloadRef.current()
    } catch {
      setState('failed')
      setNote('Scan failed. Try again in a minute.')
    }
  }, [ca])
  return { state, note, run }
}

function ScanLine({ scan }: { scan: Scan }) {
  const text = {
    idle: '',
    running: 'Reading the website now. This takes up to 30 seconds.',
    done: 'Checked just now.',
    rested: 'Checked in the last 10 minutes. Showing that result.',
    failed: scan.note,
  }[scan.state]
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <button type="button" onClick={scan.run} disabled={scan.state === 'running'} className="btn min-h-11 border border-line px-4 text-sm disabled:opacity-60">
        {scan.state === 'running' ? 'Scanning…' : 'Scan now'}
      </button>
      <p className={`text-sm ${scan.state === 'failed' ? 'text-fail' : 'text-muted'}`} role="status" aria-live="polite">{text}</p>
    </div>
  )
}

// What the dev typed when launching on Pons. Anyone launching can type anything, so these are only claims; the checks
// above test them.
function LaunchForm({ form }: { form: NonNullable<LiveCoin['launchForm']> }) {
  const rows = [
    ['Website', form.website],
    ['X', form.x && `@${form.x}`],
    ['Telegram', form.telegram],
    ['GitHub', form.github],
  ].filter((r): r is [string, string] => !!r[1])
  return (
    <details className="mt-1 text-sm">
      <summary className="min-h-11 cursor-pointer py-2 text-muted hover:text-ink">What the dev typed into the Pons launch form</summary>
      {rows.length ? (
        <dl className="divide-y divide-line">{rows.map(([k, v]) => <Fact key={k} k={k} v={v.replace(/^https?:\/\/(www\.)?/, '')} />)}</dl>
      ) : (
        <p className="text-muted">No links in the launch form.</p>
      )}
      {form.description && <p className="mt-2 whitespace-pre-wrap break-words text-muted">{form.description}</p>}
      <p className="mt-2 text-xs text-faint">Self-declared on chain at launch. The checks above test it.</p>
    </details>
  )
}

function LegitLine({ coin: c }: { coin: LiveCoin }) {
  const w = c.checks.website
  const text = c.legitLevel === 2 ? 'Legit+' : c.legitLevel === 1 ? 'Legit' : w?.status === 'pass' ? 'CA on the website. Not legit yet' : w ? 'Not proven' : 'Legit checks not run yet'
  return <div className={`font-mono text-sm ${c.legit ? 'text-pass' : 'text-muted'}`}>{text}</div>
}

function Proof({ name, row, fallback }: { name: string; row: CheckRow | null; fallback: string }) {
  const link = row?.sourceUrl
  return (
    <li className="grid grid-cols-[24px_1fr] gap-3 py-4">
      <span className="pt-0.5"><CheckMark value={row?.status ?? null} label={name} /></span>
      <div className="min-w-0">
        <div className="font-medium">{name}</div>
        <p className="mt-0.5 text-sm text-muted">{row ? row.reason : fallback}</p>
        {link && (
          <a href={link} className="mt-1 inline-flex max-w-full items-center gap-1 font-mono text-xs text-accent hover:underline" rel="noopener noreferrer nofollow" target="_blank">
            <span className="truncate">{link.replace(/^https?:\/\/(www\.)?/, '')}</span> <ExternalLink size={12} className="shrink-0" aria-hidden="true" />
          </a>
        )}
        {row && <div className="mt-1 font-mono text-xs text-faint">checked {since(row.checkedMs)} ago{row.status === 'pass' && row.passedMs ? `, passing since ${since(row.passedMs)} ago` : ''}</div>}
      </div>
    </li>
  )
}

// The signed message and signature, in full: anyone can paste them into a signature checker (etherscan.io/verifiedSignatures)
// and see the launch wallet signed it.
function SignatureProof({ sig }: { sig: { wallet: string; message: string; signature: string; signedMs: number } }) {
  return (
    <details className="mt-1 text-sm">
      <summary className="min-h-11 cursor-pointer py-2 text-muted hover:text-ink">Check the signature yourself</summary>
      <dl className="grid gap-2 font-mono text-xs">
        <dt className="text-muted">Wallet</dt>
        <dd className="break-all">{sig.wallet}</dd>
        <dt className="text-muted">Message</dt>
        <dd className="whitespace-pre-wrap break-all rounded-[10px] bg-panel p-3">{sig.message}</dd>
        <dt className="text-muted">Signature</dt>
        <dd className="break-all">{sig.signature}</dd>
      </dl>
    </details>
  )
}

// Dev moves as a share of what the dev received: "12% of supply (100% of what it got)".
const share = (part: number | null, got: number | null) => (part !== null && got ? part / got : 0)
const ofGot = (part: number | null, got: number | null) => (part === null ? 'no data' : got ? `${pctText(part)} (${Math.round((part / got) * 100)}% of what it got)` : pctText(part))

function Fact({ k, v, warn = false, good = false }: { k: string; v: string; warn?: boolean; good?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-3">
      <dt className="text-muted">{k}</dt>
      <dd className={`text-right font-mono ${warn ? 'text-warn' : good ? 'text-pass' : ''}`}>{v}</dd>
    </div>
  )
}

function NotListed({ ca }: { ca: string }) {
  return (
    <main className="mx-auto max-w-2xl px-4 pb-24 pt-16 md:px-6">
      <div className="label">Not in the list</div>
      <h1 className="mt-2 display text-4xl">We have not seen this address yet.</h1>
      <p className="mt-3 break-all font-mono text-sm text-muted">{ca}</p>
      <p className="mt-4 text-muted">
        The scanner reads every Pons launch and the busiest Robinhood Chain pools. A coin from somewhere else shows up once it starts trading there.
      </p>
      <Link to="/coins" className="mt-6 inline-flex min-h-12 items-center btn btn-dark">Browse coins</Link>
    </main>
  )
}
