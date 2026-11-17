import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { LiveCoinTable } from '@/components/live-coin-table'
import { SectionHead } from '@/components/section-head'
import { useApi, type LiveCoin } from '@/data/live-coins'
import { since } from '@/format-coin'
import { ScanNotice } from '@/components/scan-notice'

const MC = {
  all: ['Any', 0, Infinity],
  '5-100k': ['Under $100k', 0, 100_000],
  '100-500k': ['$100k to $500k', 100_000, 500_000],
  '500k+': ['Over $500k', 500_000, Infinity],
} as const
type McKey = keyof typeof MC

const SORTS = { mc: 'Market cap', newest: 'Newest', holders: 'Holders' } as const
type SortKey = keyof typeof SORTS

const PROOF = {
  all: ['All coins', () => true],
  legit: ['Legit', (c: LiveCoin) => c.legit],
  legitplus: ['Legit+', (c: LiveCoin) => c.legitLevel === 2],
  website: ['CA on site', (c: LiveCoin) => c.checks.website?.status === 'pass'],
} as const
type ProofKey = keyof typeof PROOF

const PAGE_SIZE = 25

// Coins at or above $5k MC, from the collector's D1 table, with their legit checks. ?proof=website|legit preselects.
export function CoinsPage() {
  const { loading, failed, data } = useApi('/api/coins')
  const [params] = useSearchParams()
  const [proof, setProof] = useState<ProofKey>((params.get('proof') as ProofKey) in PROOF ? (params.get('proof') as ProofKey) : 'all')
  const [mc, setMc] = useState<McKey>('all')
  const [sort, setSort] = useState<SortKey>('mc')
  const [page, setPage] = useState(0)
  // Off by default: a clone on a $2k pool can show a $64T MC (fake "BTC", 16 Nov) and would top every MC sort.
  const [showUnbacked, setShowUnbacked] = useState(false)

  const all = data?.coins ?? []
  const unbacked = all.filter((c) => c.mcNotBacked).length
  // Everything but the proof filter, so each proof tab can show how many coins it holds.
  const base = useMemo(() => {
    const [, lo, hi] = MC[mc]
    return all.filter((c) => c.mcUsd !== null && c.mcUsd >= lo && c.mcUsd < hi).filter((c) => showUnbacked || !c.mcNotBacked)
  }, [all, mc, showUnbacked])
  const list = useMemo(
    () =>
      base.filter(PROOF[proof][1]).sort((a, b) =>
        sort === 'newest'
          ? (b.launchedMs ?? b.pairCreatedMs ?? 0) - (a.launchedMs ?? a.pairCreatedMs ?? 0)
          : sort === 'holders'
            ? (b.holders ?? -1) - (a.holders ?? -1)
            : (b.mcUsd ?? 0) - (a.mcUsd ?? 0),
      ),
    [base, proof, sort],
  )
  useEffect(() => setPage(0), [proof, mc, sort, showUnbacked])
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE))
  const shown = list.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <main className="mx-auto max-w-[1240px] px-4 pb-24 pt-10 md:px-6 md:pt-14">
      <SectionHead kicker="Robinhood Chain" title="Every coin and its proof">
        Coins over $5k market cap, each with what we could prove about its address. Legit means the address is the project's, not that
        the coin is safe.{data?.updatedMs ? ` Updated ${since(data.updatedMs)} ago.` : ''}
      </SectionHead>

      <ScanNotice className="mb-8" />

      <div role="tablist" aria-label="Proof" className="flex gap-6 border-b border-line">
        {(Object.keys(PROOF) as ProofKey[]).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={proof === k}
            onClick={() => setProof(k)}
            className={`-mb-px min-h-11 shrink-0 border-b-2 text-sm font-medium ${proof === k ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'}`}
          >
            {PROOF[k][0]} <span className="num ml-1 text-xs text-muted">{base.filter(PROOF[k][1]).length}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-3 text-sm md:flex-row md:flex-wrap md:items-center md:gap-x-8">
        <Choice label="Market cap" value={mc} onChange={setMc} options={(Object.keys(MC) as McKey[]).map((k) => [k, MC[k][0]])} />
        <Choice label="Sort" value={sort} onChange={setSort} options={Object.entries(SORTS) as [SortKey, string][]} />
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-muted md:ml-auto">
          <input type="checkbox" checked={showUnbacked} onChange={(e) => setShowUnbacked(e.target.checked)} className="h-4 w-4 accent-[#0a7c91]" />
          Include {unbacked} coins with MC not backed by liquidity
        </label>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="card p-8 text-center text-muted">Loading coins…</div>
        ) : failed ? (
          <div className="card p-8 text-center text-fail">Could not load the coins. Try again in a minute.</div>
        ) : list.length ? (
          <>
            <LiveCoinTable coins={shown} />
            <Pager page={page} pages={pages} total={list.length} onPage={(p) => { setPage(p); window.scrollTo({ top: 0 }) }} />
          </>
        ) : (
          <div className="card p-8 text-center text-muted">No coins match these filters.</div>
        )}
      </div>
    </main>
  )
}

// A row of plain text choices: the picked one is ink and underlined, the rest muted. Replaces native dropdowns.
function Choice<K extends string>({ label, value, onChange, options }: { label: string; value: K; onChange: (v: K) => void; options: [K, string][] }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <span className="label w-24 md:w-auto">{label}</span>
      {options.map(([k, text]) => (
        <button
          key={k}
          role="radio"
          aria-checked={value === k}
          onClick={() => onChange(k)}
          className={`min-h-11 underline-offset-[6px] ${value === k ? 'font-medium text-ink underline decoration-2' : 'text-muted hover:text-ink'}`}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

function Pager({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  if (pages < 2) return null
  const from = page * PAGE_SIZE + 1
  const to = Math.min(total, (page + 1) * PAGE_SIZE)
  const btn = 'inline-flex min-h-11 min-w-11 items-center justify-center rounded-[10px] border border-line bg-surface text-sm disabled:opacity-40'
  return (
    <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-3">
      <span className="num text-sm text-muted">
        {from} to {to} of {total}
      </span>
      <div className="flex items-center gap-2">
        <button className={btn} onClick={() => onPage(page - 1)} disabled={page === 0} aria-label="Previous page">
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <span className="num px-2 text-sm">
          Page {page + 1} of {pages}
        </span>
        <button className={btn} onClick={() => onPage(page + 1)} disabled={page >= pages - 1} aria-label="Next page">
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
    </nav>
  )
}
