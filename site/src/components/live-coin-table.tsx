import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { CheckMark } from '@/components/check-mark'
import { coinName, subName, type LiveCoin } from '@/data/live-coins'
import { shortCa, since, usd } from '@/format-coin'

const GRID = 'md:grid md:grid-cols-[minmax(0,2fr)_84px_80px_80px_72px_64px_72px_minmax(0,1.4fr)_56px] md:items-center md:gap-4'
const HEAD: [string, string?][] = [['Coin'], ['Legit'], ['MC', 'text-right'], ['Liquidity', 'text-right'], ['Holders', 'text-right'], ['Top 10', 'text-right'], ['Dev coins', 'text-right'], ['Risk'], ['Age', 'text-right']]

// Legit checks (website, X, GitHub) next to market and risk facts. Rows stack under 768px.
export function LiveCoinTable({ coins }: { coins: LiveCoin[] }) {
  return (
    <div className="card overflow-hidden">
      <div className={`hidden border-b border-line px-5 py-3 ${GRID}`}>
        {HEAD.map(([t, cls]) => <span key={t} className={`label ${cls ?? ''}`}>{t}</span>)}
      </div>
      <ul>
        {coins.map((c) => (
          <li key={c.ca} className="border-b border-line last:border-b-0">
            <Link to={`/coin/robinhood/${c.ca}`} className={`block px-4 py-3.5 transition-colors hover:bg-bg/70 md:px-5 ${GRID}`}>
              <CoinCell coin={c} right={since(c.launchedMs ?? c.pairCreatedMs)} />
              <ListCells coin={c} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function CoinCell({ coin: c, right }: { coin: LiveCoin; right: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <CoinIcon coin={c} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate font-semibold">{coinName(c)}</span>
          {subName(c) && <span className="truncate text-sm text-muted">{subName(c)}</span>}
          <span className="ml-auto font-mono text-xs text-muted md:hidden">{right}</span>
        </div>
        <div className="font-mono text-xs text-muted">{shortCa(c.ca)}</div>
      </div>
    </div>
  )
}

export function CoinIcon({ coin: c, size = 32 }: { coin: LiveCoin; size?: number }) {
  const [broken, setBroken] = useState(false)
  const box = { width: size, height: size }
  if (c.icon && !broken) {
    return <img src={c.icon} alt="" style={box} className="shrink-0 rounded-full border border-line bg-panel object-cover" loading="lazy" onError={() => setBroken(true)} />
  }
  return (
    <span style={box} className="flex shrink-0 items-center justify-center rounded-full border border-line bg-panel font-mono text-xs text-muted" aria-hidden="true">
      {coinName(c).replace(/^\W+/, '').slice(0, 1).toUpperCase() || '?'}
    </span>
  )
}

// Mobile: each value carries its own small label; desktop: the header row names the column.
function Cell({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <span className={`num text-sm md:text-right ${className}`}>
      <span className="label mr-2 md:hidden">{label}</span>
      {children}
    </span>
  )
}

function ListCells({ coin: c }: { coin: LiveCoin }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 md:contents">
      <div className="col-span-2 md:col-span-1"><LegitMarks coin={c} /></div>
      <Cell label="MC">{c.mcUsd !== null ? usd(c.mcUsd) : 'no data'}</Cell>
      <Cell label="Liquidity" className={c.mcNotBacked ? 'text-warn' : ''}>{c.liqUsd !== null ? usd(c.liqUsd) : 'no data'}</Cell>
      <Cell label="Holders">{c.holders ?? '–'}</Cell>
      <Cell label="Top 10">{c.top10Pct !== null ? `${Math.round(c.top10Pct)}%` : '–'}</Cell>
      <Cell label="Dev coins" className={c.devLaunches !== null && c.devLaunches > 5 ? 'text-warn' : ''}>{c.devLaunches ?? '–'}</Cell>
      <div className="col-span-2 md:col-span-1"><RiskLine coin={c} /></div>
      <Cell label="Age" className="hidden md:block">{since(c.launchedMs ?? c.pairCreatedMs)}</Cell>
    </div>
  )
}

// Website, X, GitHub marks; "legit" in words once website and X both pass.
export function LegitMarks({ coin: c }: { coin: LiveCoin }) {
  return (
    <span className="flex items-center gap-2">
      <span className="label md:hidden">Legit</span>
      <CheckMark value={c.checks.website?.status ?? null} label="CA on website" />
      <CheckMark value={c.checks.x?.status ?? null} label="CA posted on X" />
      {c.checks.dev?.status === 'pass' && <CheckMark value="pass" label="Signed by the launch wallet" />}
      {c.checks.coingecko?.status === 'pass' && <span className="font-mono text-xs text-muted" title="Listed on CoinGecko">CG</span>}
      <CheckMark value={c.checks.github?.status ?? null} label="GitHub active" />
      {c.legit && <span className="font-mono text-xs text-pass">{c.legitLevel === 2 ? 'legit+' : 'legit'}</span>}
    </span>
  )
}

export function RiskLine({ coin: c }: { coin: LiveCoin }) {
  const items: [string, boolean][] = []
  if (c.nameTricks.includes('hidden')) items.push(['hidden characters in name', true])
  if (c.nameTricks.includes('mixed')) items.push(['look-alike letters in name', true])
  if (c.powers?.length) items.push([`owner can ${c.powers.join(', ')}`, true])
  if (c.mcNotBacked) items.push(['MC not backed by liquidity', true])
  if (c.domainYoung && c.domainCreatedMs) items.push([`domain ${since(c.domainCreatedMs)} old`, true])
  if (c.freeHost) items.push(['free hosting, no domain', true])
  if (c.sameTicker) items.push([`${c.sameTicker} other ${c.sameTicker === 1 ? 'coin' : 'coins'} with this ticker`, false])
  if (c.dex && c.dex !== 'pons') items.push([c.dex, false])
  if (!items.length) return <span className="font-mono text-xs text-muted">{c.checkedMs ? 'nothing flagged' : 'not checked yet'}</span>
  return (
    <span className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 font-mono text-xs text-muted">
      {items.map(([t, warn]) => <span key={t} className={warn ? 'text-warn' : ''}>{t}</span>)}
    </span>
  )
}
