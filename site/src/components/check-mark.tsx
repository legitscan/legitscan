import { Check as CheckIcon, Minus, TriangleAlert, X } from 'lucide-react'
import type { CheckStatus } from '@/data/live-coins'

const LOOK = {
  pass: { Icon: CheckIcon, cls: 'text-pass', word: 'proven' },
  fail: { Icon: X, cls: 'text-fail', word: 'failed' },
  none: { Icon: Minus, cls: 'text-muted/60', word: 'not proven yet' },
  error: { Icon: TriangleAlert, cls: 'text-warn', word: 'could not read' },
} as const

// One check result: icon, plus the word for screen readers (or visible when `word` is set). null = never checked.
export function CheckMark({ value, label, word = false }: { value: CheckStatus | null; label: string; word?: boolean }) {
  const { Icon, cls, word: w } = value ? LOOK[value] : { Icon: Minus, cls: 'text-muted/60', word: 'not checked yet' }
  return (
    <span className={`inline-flex items-center gap-1.5 ${cls}`} title={`${label}: ${w}`}>
      <Icon size={16} strokeWidth={2.5} aria-hidden="true" />
      {word ? <span className="font-mono text-xs">{w}</span> : <span className="sr-only">{`${label}: ${w}`}</span>}
    </span>
  )
}
