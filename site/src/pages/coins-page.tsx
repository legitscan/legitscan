import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { CoinTable } from '@/components/coin-table'
import { SectionHead } from '@/components/section-head'
import { coins, type Status } from '@/data/example-coins'

const MC = {
  all: [0, Infinity],
  '0-100k': [0, 100_000],
  '100-500k': [100_000, 500_000],
  '500k+': [500_000, Infinity],
} as const
type McKey = keyof typeof MC

const SORTS = { newest: 'Newest', mc: 'Market cap', github: 'GitHub activity' } as const
type SortKey = keyof typeof SORTS

const TABS: [Status, string][] = [['verified', 'Verified'], ['pending', 'Waiting for proof'], ['revoked', 'Lost proof']]

export function CoinsPage() {
  const [params, setParams] = useSearchParams()
  const status = (params.get('status') as Status) || 'verified'
  const [mc, setMc] = useState<McKey>('100-500k')
  const [sort, setSort] = useState<SortKey>('newest')
  const [need, setNeed] = useState({ github: false, x402: false, locked: false })

  const list = useMemo(() => {
    const [lo, hi] = MC[mc]
    return coins
      .filter((c) => c.status === status)
      .filter((c) => status !== 'verified' || (c.mcUsd >= lo && c.mcUsd < hi))
      .filter((c) => !need.github || c.checks.github === 'pass')
      .filter((c) => !need.x402 || c.checks.x402 === 'pass')
      .filter((c) => !need.locked || c.lpLocked)
      .sort((a, b) =>
        sort === 'mc' ? b.mcUsd - a.mcUsd : sort === 'github' ? (a.lastCommitHoursAgo ?? 1e9) - (b.lastCommitHoursAgo ?? 1e9) : a.ageHours - b.ageHours,
      )
  }, [status, mc, sort, need])

  return (
    <main className="mx-auto max-w-[1240px] px-4 pb-24 pt-10 md:px-6 md:pt-14">
      <SectionHead kicker="Robinhood Chain" title="Tech coins" example>
        Every coin here has a product you can check. Identity on the left, risk on the right.
      </SectionHead>

      <div role="tablist" aria-label="Status" className="flex gap-6 border-b border-line">
        {TABS.map(([s, name]) => (
          <button
            key={s}
            role="tab"
            aria-selected={status === s}
            onClick={() => setParams(s === 'verified' ? {} : { status: s })}
            className={`-mb-px min-h-11 border-b-2 text-sm font-medium ${status === s ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'}`}
          >
            {name} <span className="num ml-1 text-muted">{coins.filter((c) => c.status === s).length}</span>
          </button>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
        <Select label="Market cap" value={mc} onChange={(v) => setMc(v as McKey)} options={Object.keys(MC).map((k) => [k, k === 'all' ? 'Any' : `$${k}`])} disabled={status !== 'verified'} />
        <Select label="Sort" value={sort} onChange={(v) => setSort(v as SortKey)} options={Object.entries(SORTS)} />
        {([['github', 'GitHub proven'], ['x402', 'x402 revenue'], ['locked', 'LP locked']] as const).map(([k, name]) => (
          <label key={k} className="inline-flex min-h-11 cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={need[k]}
              onChange={(e) => setNeed((n) => ({ ...n, [k]: e.target.checked }))}
              className="h-4 w-4 accent-[#0a7c91]"
            />
            {name}
          </label>
        ))}
      </div>

      <div className="mt-4">
        {list.length ? (
          <CoinTable coins={list} />
        ) : (
          <div className="card p-8 text-center text-muted">No coins match these filters.</div>
        )}
      </div>
    </main>
  )
}

function Select({ label, value, onChange, options, disabled }: { label: string; value: string; onChange: (v: string) => void; options: (readonly [string, string])[] | [string, string][]; disabled?: boolean }) {
  return (
    <label className={`inline-flex items-center gap-2 ${disabled ? 'opacity-50' : ''}`}>
      <span className="label">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-11 rounded-[10px] border border-line bg-surface px-2.5 font-mono text-sm"
      >
        {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    </label>
  )
}
