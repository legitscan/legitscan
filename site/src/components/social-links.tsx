// Official X and GitHub logos (Simple Icons, public/logos/), never text links or look-alike icons. Each link keeps a
// label for screen readers. Used in the header and the footer.
const SOCIALS = [
  ['https://x.com/legitscan', '/logos/x.svg', 'LegitScan on X'],
  ['https://github.com/legitscan/legitscan', '/logos/github.svg', 'LegitScan source code on GitHub'],
] as const

export function SocialLinks({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center ${className}`}>
      {SOCIALS.map(([href, icon, label]) => (
        <a
          key={href}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-11 w-11 items-center justify-center rounded-[10px] opacity-70 transition-opacity hover:opacity-100 focus-visible:opacity-100"
        >
          <img src={icon} alt="" width={18} height={18} />
          <span className="sr-only">{label}</span>
        </a>
      ))}
    </div>
  )
}
