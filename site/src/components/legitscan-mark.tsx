// LegitScan mark: a lens ring that a check mark breaks out of. Same shape as the glass object in the film stills.
export function LegitScanMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="13" cy="18.5" r="9" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="M8.6 18.8 L12.2 22.4 L27.5 5.5" fill="none" stroke="#0a7c91" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
