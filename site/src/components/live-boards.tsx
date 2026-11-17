import { useState } from 'react'
import { Link } from 'react-router'
import { CoinIcon, RiskLine } from '@/components/live-coin-table'
import { coinName, migratedMs, subName, useApi, type BoardName, type LiveCoin } from '@/data/live-coins'
import { pctText, shortCa, since, usd } from '@/format-coin'

const BOARDS: [BoardName, string, string][] = [
  ['new', 'New', 'Newest Pons launches.'],
  ['almost', 'Almost bonded', 'Curve over half full, launched in the last 3 days.'],
  ['migrated', 'Migrated', 'Left the curve for their DEX pool.'],
]
const MOBILE_ROWS = 15

// GMGN-style Pons boards: three columns side by side on desktop, one tab at a time on a phone.
export function LiveBoards() {
  const [tab, setTab] = useState<BoardName>('new')
  return (
    <div>
      <div role="tablist" aria-label="Board" className="flex gap-6 border-b border-line lg:hidden">
        {BOARDS.map(([b, name]) => (
          <button
            key={b}
            role="tab"
            aria-selected={tab === b}
            aria-controls={`board-${b}`}
            onClick={() => setTab(b)}
            className={`-mb-px min-h-11 border-b-2 text-sm font-medium ${tab === b ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'}`}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:mt-0 lg:grid-cols-3">
        {BOARDS.map(([b, name, about]) => (
          <BoardColumn key={b} board={b} name={name} about={about} hiddenOnMobile={tab !== b} />
        ))}
      </div>
    </div>
  )
}

function BoardColumn({ board, name, about, hiddenOnMobile }: { board: BoardName; name: string; about: string; hiddenOnMobile: boolean }) {
  const { loading, failed, data } = useApi(`/api/board/${board}`)
  const [all, setAll] = useState(false)
  const coins = data?.coins ?? []
  return (
    <section id={`board-${board}`} role="tabpanel" aria-label={name} className={`card flex-col overflow-hidden ${hiddenOnMobile ? 'hidden lg:flex' : 'flex'}`}>
      <header className="border-b border-line px-4 py-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-semibold">{name}</h3>
          {data?.updatedMs ? <span className="font-mono text-xs text-muted">updated {since(data.updatedMs)} ago</span> : null}
        </div>
        <p className="text-sm text-muted">{about}</p>
      </header>
      {loading ? (
        <p className="px-4 py-8 text-center text-sm text-muted">Loading from the chain…</p>
      ) : failed ? (
        <p className="px-4 py-8 text-center text-sm text-fail">Could not load this board. Try again in a minute.</p>
      ) : coins.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted">No coin here right now.</p>
      ) : (
        <>
          <ul className="divide-y divide-line lg:max-h-[640px] lg:overflow-y-auto">
            {coins.map((c, i) => (
              <li key={c.ca} className={!all && i >= MOBILE_ROWS ? 'hidden lg:block' : ''}>
                <BoardRow coin={c} board={board} />
              </li>
            ))}
          </ul>
          {!all && coins.length > MOBILE_ROWS && (
            <button onClick={() => setAll(true)} className="min-h-11 border-t border-line text-sm font-medium text-accent lg:hidden">
              Show all {coins.length}
            </button>
          )}
        </>
      )}
    </section>
  )
}

function BoardRow({ coin: c, board }: { coin: LiveCoin; board: BoardName }) {
  return (
    <Link to={`/coin/robinhood/${c.ca}`} className="flex gap-3 px-4 py-3 transition-colors hover:bg-bg/70">
      <CoinIcon coin={c} size={36} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate font-semibold">{coinName(c)}</span>
          {subName(c) && <span className="min-w-0 truncate text-sm text-muted">{subName(c)}</span>}
          <span className="num ml-auto shrink-0 text-xs text-muted" title="Age since launch">{since(c.launchedMs)}</span>
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 font-mono text-xs text-muted">
          <span>{shortCa(c.ca)}</span>
          <span>MC <span className="text-ink">{c.mcUsd !== null ? usd(c.mcUsd) : 'no data'}</span></span>
          {c.holders !== null && <span>{c.holders} holders</span>}
          {c.devLaunches !== null && <span className={c.devLaunches > 5 ? 'text-warn' : ''}>dev {c.devLaunches} {c.devLaunches === 1 ? 'coin' : 'coins'}</span>}
        </div>
        <div className="mt-2">
          {board === 'migrated' ? <span className="font-mono text-xs text-accent">migrated {since(migratedMs(c))} ago</span> : <CurveBar pct={c.bondPct} />}
        </div>
        {(c.powers?.length || c.mcNotBacked) && <div className="mt-1.5"><RiskLine coin={c} /></div>}
      </div>
    </Link>
  )
}

// A hairline track filled to the curve percent: Pons moves the coin to its DEX pool at 100%.
function CurveBar({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="font-mono text-xs text-muted">curve: no data yet</span>
  return (
    <span className="flex items-center gap-3">
      <span className="relative h-1 flex-1 overflow-hidden rounded-full bg-line" role="img" aria-label={`Bonding curve ${pctText(pct)} filled`}>
        <span className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </span>
      <span className="num w-12 text-right text-xs">{pctText(pct)}</span>
    </span>
  )
}
