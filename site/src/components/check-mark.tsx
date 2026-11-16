import { Check as CheckIcon, Minus, X } from 'lucide-react'
import type { Check } from '@/data/example-coins'

const LOOK = {
  pass: { Icon: CheckIcon, cls: 'text-pass', word: 'proven' },
  fail: { Icon: X, cls: 'text-fail', word: 'failed' },
  none: { Icon: Minus, cls: 'text-muted/60', word: 'no data' },
} as const

// One check result: icon, plus the word for screen readers (or visible when `word` is set).
export function CheckMark({ value, label, word = false }: { value: Check; label: string; word?: boolean }) {
  const { Icon, cls, word: w } = LOOK[value]
  return (
    <span className={`inline-flex items-center gap-1.5 ${cls}`} title={`${label}: ${w}`}>
      <Icon size={16} strokeWidth={2.5} aria-hidden="true" />
      {word ? <span className="font-mono text-xs">{w}</span> : <span className="sr-only">{`${label}: ${w}`}</span>}
    </span>
  )
}
