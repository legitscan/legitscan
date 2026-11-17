import { Link } from 'react-router'
import { LegitScanMark } from '@/components/legitscan-mark'
import { SocialLinks } from '@/components/social-links'

const COLS = [
  ['Product', [['/coins?proof=legit', 'Legit coins'], ['/coins?proof=website', 'CA on the website'], ['/stats', 'Stats']]],
  ['Builders', [['/claim', 'Claim your coin'], ['/method', 'How checks work'], ['/api', 'API (later)']]],
  ['Project', [['/method#not-safe', 'Legit is not safe'], ['/token', 'Token']]],
] as const

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-[1240px] gap-10 px-4 py-12 md:grid-cols-4 md:px-6">
        <div>
          <div className="flex items-center gap-2.5 font-serif text-[1.3rem]">
            <LegitScanMark />
            LegitScan
          </div>
          <p className="mt-3 max-w-xs text-sm text-muted">
            Proof that a contract address belongs to the project. Not a safety rating and not advice to buy.
          </p>
          <SocialLinks className="-ml-3 mt-4" />
        </div>
        {COLS.map(([title, links]) => (
          <div key={title}>
            <div className="label">{title}</div>
            <ul className="mt-3 space-y-2 text-sm">
              {links.map(([to, name]) => (
                <li key={to}>
                  {to.startsWith('http') ? (
                    <a href={to} className="text-muted hover:text-ink">{name}</a>
                  ) : (
                    <Link to={to} className="text-muted hover:text-ink">{name}</Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-[1240px] px-4 py-5 text-xs text-muted md:px-6">
          Robinhood Chain (4663). Every coin can still lose its value. Check the risk column, then decide yourself.
        </p>
      </div>
    </footer>
  )
}
