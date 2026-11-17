import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { LiveCoinTable } from '@/components/live-coin-table'
import { SectionHead } from '@/components/section-head'
import { useApi } from '@/data/live-coins'
import { since } from '@/format-coin'
import { ScanNotice } from '@/components/scan-notice'

const MC = {
  all: [0, Infinity],
  '5-100k': [0, 100_000],
  '100-500k': [100_000, 500_000],
  '500k+': [500_000, Infinity],
} as const
type McKey = keyof typeof MC

const SORTS = { mc: 'Market cap', newest: 'Newest', holders: 'Holders' } as const
const PROOF = { all: 'Any', website: 'CA on website', legit: 'Legit or Legit+', legitplus: 'Legit+' } as const
type ProofKey = keyof typeof PROOF
type SortKey = keyof typeof SORTS

// Coins at or above $5k MC, from the collector's D1 table, with their legit checks. ?proof=website|legit preselects.
export function CoinsPage() {
  const { loading, failed, data } = useApi('/api/coins')
  const [params] = useSearchParams()
  const [proof, setProof] = useState<ProofKey>((params.get('proof') as ProofKey) in PROOF ? (params.get('proof') as ProofKey) : 'all')
  const [mc, setMc] = useState<McKey>('all')
  const [sort, setSort] = useState<SortKey>('mc')
  // Off by default: a clone on a $2k pool can show a $64T MC (fake "BTC", 16 Nov) and would top every MC sort.
  const [showUnbacked, setShowUnbacked] = useState(false)

  const all = data?.coins ?? []
  const unbacked = all.filter((c) => c.mcNotBacked).length
  const list = useMemo(() => {
    const [lo, hi] = MC[mc]
    return all
      .filter((c) => c.mcUsd !== null && c.mcUsd >= lo && c.mcUsd < hi)
      .filter((c) => showUnbacked || !c.mcNotBacked)
      .filter((c) => proof === 'all' || (proof === 'legitplus' ? c.legitLevel === 2 : proof === 'legit' ? c.legit : c.checks.website?.status === 'pass'))
      .sort((a, b) =>
        sort === 'newest'
          ? (b.launchedMs ?? b.pairCreatedMs ?? 0) - (a.launchedMs ?? a.pairCreatedMs ?? 0)
          : sort === 'holders'
            ? (b.holders ?? -1) - (a.holders ?? -1)
            : (b.mcUsd ?? 0) - (a.mcUsd ?? 0),
      )
  }, [all, mc, sort, showUnbacked, proof])

  return (
    <main className="mx-auto max-w-[1240px] px-4 pb-24 pt-10 md:px-6 md:pt-14">
      <SectionHead kicker="Robinhood Chain" title="Coins over $5k market cap">
        Market and risk facts refresh about once an hour. The legit checks read each project's website, its X account and its GitHub: hourly until a coin is proven, then daily. Legit means the address is the project's, not that it is safe.
        {data?.updatedMs ? ` Updated ${since(data.updatedMs)} ago.` : ''}
      </SectionHead>

      <ScanNotice className="mb-6" />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
        <Select label="Market cap" value={mc} onChange={(v) => setMc(v as McKey)} options={Object.keys(MC).map((k) => [k, k === 'all' ? 'Any' : `$${k}`])} />
 <Select label="Proof" value={proof} onChange={(v) => setProof(v as ProofKey)} options={Object.entries(PROOF)} />
        <Select label="Sort" value={sort} onChange={(v) => setSort(v as SortKey)} options={Object.entries(SORTS)} />
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2">
          <input type="checkbox" checked={showUnbacked} onChange={(e) => setShowUnbacked(e.target.checked)} className="h-4 w-4 accent-[#0a7c91]" />
          Show {unbacked} coins whose MC is not backed by liquidity
        </label>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="card p-8 text-center text-muted">Loading coins…</div>
        ) : failed ? (
          <div className="card p-8 text-center text-fail">Could not load the coins. Try again in a minute.</div>
        ) : list.length ? (
          <LiveCoinTable coins={list} />
        ) : (
          <div className="card p-8 text-center text-muted">No coins match these filters.</div>
        )}
      </div>
    </main>
  )
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: (readonly [string, string])[] | [string, string][] }) {
  return (
    <label className="inline-flex items-center gap-2">
      <span className="label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="min-h-11 rounded-[10px] border border-line bg-surface px-2.5 font-mono text-sm">
        {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    </label>
  )
}
