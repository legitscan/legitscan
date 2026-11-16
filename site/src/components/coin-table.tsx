import { Lock, LockOpen } from 'lucide-react'
import { Link } from 'react-router'
import { CheckMark } from '@/components/check-mark'
import type { Coin } from '@/data/example-coins'
import { age, ago, shortCa, usd } from '@/format-coin'

const GRID = 'md:grid md:grid-cols-[minmax(0,2fr)_repeat(4,44px)_minmax(0,0.7fr)_minmax(0,1.5fr)_48px] md:items-center md:gap-4'

// Identity checks and risk side by side, never mixed. Rows become stacked cards under 768px.
export function CoinTable({ coins }: { coins: Coin[] }) {
  return (
    <div className="card overflow-hidden">
      <div className={`hidden border-b border-line px-5 py-3 ${GRID}`}>
        <span className="label">Coin</span>
        <span className="label text-center">Web</span>
        <span className="label text-center">X</span>
        <span className="label text-center">Git</span>
        <span className="label text-center">x402</span>
        <span className="label text-right">MC</span>
        <span className="label">Risk</span>
        <span className="label text-right">Age</span>
      </div>
      <ul>
        {coins.map((c) => (
          <li key={c.ca} className="border-b border-line last:border-b-0">
            <Link
              to={`/coin/${c.chain}/${c.ca}`}
              className={`block px-4 py-4 transition-colors hover:bg-bg/70 md:px-5 ${GRID}`}
            >
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold">{c.name}</span>
                  <span className="font-mono text-sm text-accent">${c.ticker}</span>
                  <span className="ml-auto font-mono text-xs text-muted md:hidden">{age(c.ageHours)}</span>
                </div>
                <div className="truncate text-sm text-muted">{c.what}</div>
                <div className="mt-0.5 font-mono text-xs text-muted">
                  {shortCa(c.ca)} · {c.source === 'claimed' ? 'claimed by dev' : 'found by scanner'} · checked {ago(c.checkedMinAgo)}
                </div>
              </div>

              <div className="mt-3 flex gap-5 md:contents">
                {(['website', 'x', 'github', 'x402'] as const).map((k) => (
                  <span key={k} className="flex items-center gap-1.5 md:justify-center">
                    <span className="label md:hidden">{k === 'website' ? 'Web' : k === 'github' ? 'Git' : k}</span>
                    <CheckMark value={c.checks[k]} label={k} />
                  </span>
                ))}
              </div>

              <div className="mt-2 flex items-center justify-between gap-4 md:contents">
                <span className="num text-sm md:text-right">
                  <span className="label mr-2 md:hidden">MC</span>
                  {c.mcUsd ? usd(c.mcUsd) : 'no data'}
                </span>
                <RiskLine coin={c} />
                <span className="num hidden text-right text-sm text-muted md:block">{age(c.ageHours)}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function RiskLine({ coin: c }: { coin: Coin }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-muted">
      <span>{c.venue}</span>
      <span className={`inline-flex items-center gap-1 whitespace-nowrap ${c.lpLocked ? '' : 'text-warn'}`}>
        {c.lpLocked ? <Lock size={13} aria-hidden="true" /> : <LockOpen size={13} aria-hidden="true" />}
        {c.lpLocked ? 'LP locked' : 'LP open'}
      </span>
      {c.ownerPowers.length > 0 && <span className="text-warn">owner: {c.ownerPowers.join(', ')}</span>}
    </span>
  )
}
