import { Menu, X } from 'lucide-react'
import { useState } from 'react'
import { Link, NavLink } from 'react-router'
import { LegitScanMark } from '@/components/legitscan-mark'

const LINKS = [
  ['/coins', 'Coins'],
  ['/method', 'Method'],
  ['/stats', 'Stats'],
  ['/claim', 'Claim'],
] as const

export function SiteNav() {
  const [open, setOpen] = useState(false)
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/75 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex h-[68px] max-w-[1240px] items-center justify-between px-4 md:px-6">
        <Link to="/" className="flex items-center gap-2.5 font-serif text-[1.3rem] tracking-tight" onClick={() => setOpen(false)}>
          <LegitScanMark />
          LegitScan
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-muted md:flex">
          {LINKS.map(([to, name]) => (
            <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'text-ink' : 'hover:text-ink')}>
              {name}
            </NavLink>
          ))}
          <Link to="/coins" className="btn btn-dark !min-h-10 !px-5 !text-sm">
            Check a CA
          </Link>
        </nav>
        <button
          type="button"
          className="-mr-2 flex h-11 w-11 items-center justify-center md:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      {open && (
        <nav className="border-t border-line px-4 pb-4 md:hidden">
          {LINKS.map(([to, name]) => (
            <Link key={to} to={to} onClick={() => setOpen(false)} className="block border-b border-line py-3 text-base">
              {name}
            </Link>
          ))}
        </nav>
      )}
    </header>
  )
}
