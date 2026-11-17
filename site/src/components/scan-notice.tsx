import { Link } from 'react-router'

// Shown wherever scan results are: LegitScan speeds up a decision, it does not make it. Owner, 17 Nov: the person who
// pastes the CA decides; we keep adding checks.
export function ScanNotice({ className = '' }: { className?: string }) {
  return (
    <aside className={`border-l-2 border-warn pl-4 text-sm ${className}`} aria-label="Before you decide">
      <p className="font-medium">A scan helps you decide faster. It does not decide for you.</p>
      <p className="mt-1 text-muted">
        We check public facts: the project's website, X, GitHub and the chain. They can be wrong or out of date, and a coin that passes every
        check can still lose its value. This is not financial advice. Whether you buy, and the risk of it, is yours. We keep adding checks;{' '}
        <Link to="/method" className="text-accent hover:underline">see what each one proves</Link>.
      </p>
    </aside>
  )
}
