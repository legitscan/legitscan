import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { shortCa } from '@/format-coin'

// Zolva style (research/web-playbook.md "Keputusan owner"): short address shown, a click copies the full one.
export function CaCopyButton({ ca, ticker }: { ca: string; ticker: string }) {
  const [done, setDone] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ca)
      setDone(true)
      setTimeout(() => setDone(false), 2000)
    } catch {
      /* clipboard blocked: the full address is still in the aria-label and title */
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      title={ca}
      aria-label={`Copy the $${ticker} contract address ${ca}`}
      className="inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-line bg-surface px-3 font-mono text-sm transition-colors hover:bg-bg"
    >
      <span className="font-semibold text-accent">${ticker} CA</span>
      <span>{shortCa(ca)}</span>
      {done ? <Check size={15} className="text-accent" aria-hidden="true" /> : <Copy size={15} className="text-muted" aria-hidden="true" />}
    </button>
  )
}
