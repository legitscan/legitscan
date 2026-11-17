import { SectionHead } from '@/components/section-head'
import { useApi } from '@/data/live-coins'
import { since } from '@/format-coin'

// /stats: counts straight from the database, nothing rounded up or estimated.
export function StatsPage() {
  const { loading, failed, data } = useApi('/api/stats')
  const s = data?.stats
  const rows: [string, number | undefined, string][] = [
    ['Coins seen on Robinhood Chain', s?.coins, 'Every Pons launch plus coins from the busiest pools.'],
    ['At or above $5k market cap', s?.overFloor, 'These get the deep risk check.'],
    ['Coins with legit checks run', s?.checked, 'Coins whose market listing names a website.'],
    ['CA on the project website', s?.websitePass, 'The full address is on the site the listing names.'],
    ['Website does not show the CA', s?.websiteFail, 'The site the listing names does not show the full address. Copies land here, and so do real tokens whose site lists no address (Robinhood\'s stock tokens).'],
    ['CA posted by the linked X account', s?.xPass, 'Needs a tweet from that account, sent in on the claim page.'],
    ['Signed by the launch wallet', s?.devPass, 'The dev signed on the claim page with the wallet that launched the token.'],
    ['GitHub pushed in the last 30 days', s?.githubPass, 'Repo or account linked from the project website.'],
    ['Listed on CoinGecko', s?.coingeckoPass, 'Coins at or above $5k whose contract is on a CoinGecko page for Robinhood Chain.'],
    ['Legit or Legit+', s?.legit, 'Website, plus the launch form\'s X matching the site, or more. Not a safety rating.'],
    ['Legit+', s?.legitPlus, 'Website, plus a tweet, the GitHub README or the launch wallet\'s signature carrying the address.'],
    ['Tweets sent in', s?.claims, 'Through the claim page.'],
  ]
  return (
    <main className="mx-auto max-w-[1240px] px-4 pb-24 pt-10 md:px-6 md:pt-14">
      <SectionHead kicker="Stats" title="What the scanner has seen.">
        Counted from the database on every visit.{data?.updatedMs ? ` Last scanner run ${since(data.updatedMs)} ago.` : ''}
      </SectionHead>
      {loading ? (
        <div className="card p-8 text-center text-muted">Loading…</div>
      ) : failed || !s ? (
        <div className="card p-8 text-center text-fail">Could not load the numbers. Try again in a minute.</div>
      ) : (
        <dl className="card divide-y divide-line">
          {rows.map(([k, v, note]) => (
            <div key={k} className="flex flex-col gap-1 px-5 py-4 md:flex-row md:items-baseline md:justify-between md:gap-8">
              <div>
                <dt className="font-medium">{k}</dt>
                <p className="text-sm text-muted">{note}</p>
              </div>
              <dd className="display text-3xl md:text-4xl">{v?.toLocaleString('en-US') ?? 'no data'}</dd>
            </div>
          ))}
        </dl>
      )}
    </main>
  )
}
