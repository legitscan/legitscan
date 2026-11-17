import { Check } from 'lucide-react'
import type { LiveCoin } from '@/data/live-coins'

// What made the coin legit, in a few words: the website always, plus the second channel(s).
function proofWords(c: LiveCoin) {
  const words = ['site']
  if (c.checks.x?.status === 'pass') words.push('X post')
  if (c.checks.githubca?.status === 'pass') words.push('GitHub')
  if (c.checks.dev?.status === 'pass') words.push('dev signed')
  if (c.legitLevel === 1) words.push('same X')
  return words.join(' + ')
}

// One readable verdict per coin, the same words as the coin page. `compact` (boards) drops the proof line and shows
// nothing for coins that are not legit, so a busy row only gets a mark when there is something to say.
export function LegitStatus({ coin: c, compact = false }: { coin: LiveCoin; compact?: boolean }) {
  if (c.legit) {
    return (
      <span className="inline-flex min-w-0 flex-col">
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-pass">
          <Check size={15} strokeWidth={3} aria-hidden="true" />
          {c.legitLevel === 2 ? 'Legit+' : 'Legit'}
        </span>
        {!compact && <span className="truncate text-xs text-muted">{proofWords(c)}</span>}
      </span>
    )
  }
  if (compact) return null
  const site = c.checks.website
  const known = c.websites.length > 0 || !!c.launchForm?.website
  const word = site?.status === 'pass' ? 'CA on site' : site ? 'Not proven' : known ? 'Not checked' : 'No website'
  return <span className={`text-sm ${site?.status === 'pass' ? 'text-ink' : 'text-muted'}`}>{word}</span>
}
