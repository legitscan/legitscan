// Stand-in for the hero asset. The real one is a Google Flow still + loop (PLAN.md section 5, direction A).
// Same composition so the layout does not move when the asset lands: blue-hour sky, horizon at 60%,
// wet salt flat mirroring it, a glass loupe with a check standing over its own reflection, one scan line.
export function SaltMirrorScene({ className = '' }: { className?: string }) {
  return (
    <div className={`overflow-hidden ${className}`} aria-hidden="true">
      <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#131f35" />
            <stop offset="0.45" stopColor="#3f5679" />
            <stop offset="0.8" stopColor="#a9b8cd" />
            <stop offset="1" stopColor="#efd5c8" />
          </linearGradient>
          <linearGradient id="mirror" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#d9ccc6" />
            <stop offset="0.25" stopColor="#8fa1ba" />
            <stop offset="1" stopColor="#1b2840" />
          </linearGradient>
          <radialGradient id="lens" cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
            <stop offset="0.5" stopColor="#dbe8f2" stopOpacity="0.18" />
            <stop offset="1" stopColor="#9fc3d6" stopOpacity="0.1" />
          </radialGradient>
          <linearGradient id="rim" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="0.55" stopColor="#cfe4ef" stopOpacity="0.5" />
            <stop offset="1" stopColor="#3cc6db" stopOpacity="1" />
          </linearGradient>
          <linearGradient id="handle" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.6" />
            <stop offset="1" stopColor="#7fb6c8" stopOpacity="0.35" />
          </linearGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="soft"><feGaussianBlur stdDeviation="3" /></filter>
          <filter id="grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
            <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.5 0" />
          </filter>
          <pattern id="ripple" width="1600" height="7" patternUnits="userSpaceOnUse">
            <rect width="1600" height="1" fill="#ffffff" opacity="0.05" />
          </pattern>
          <g id="loupe">
            <rect x="1166" y="452" width="34" height="190" rx="17" transform="rotate(-38 1183 547)" fill="url(#handle)" />
            <circle cx="1060" cy="360" r="158" fill="url(#lens)" stroke="url(#rim)" strokeWidth="14" />
            <circle cx="1060" cy="360" r="140" fill="none" stroke="#ffffff" strokeOpacity="0.25" strokeWidth="2" />
            <path d="M995 362 L1043 408 L1132 312" fill="none" stroke="#3cc6db" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" filter="url(#glow)" />
          </g>
        </defs>

        <rect width="1600" height="540" fill="url(#sky)" />
        {[[180, 70, 1.6], [420, 140, 1.1], [610, 60, 1.3], [860, 110, 1], [1320, 80, 1.5], [1480, 170, 1.1], [300, 230, 0.9], [1220, 200, 0.8], [760, 210, 0.9]].map(([x, y, r]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill="#ffffff" opacity="0.8" />
        ))}
        <path d="M0 540 L140 522 L260 530 L420 512 L560 528 L700 518 L860 532 L1000 520 L1180 534 L1340 516 L1480 528 L1600 520 L1600 540 Z" fill="#5e6f8a" opacity="0.55" />

        <rect y="540" width="1600" height="360" fill="url(#mirror)" />
        <path d="M0 540 L140 558 L260 550 L420 568 L560 552 L700 562 L860 548 L1000 560 L1180 546 L1340 564 L1480 552 L1600 560 L1600 540 Z" fill="#5e6f8a" opacity="0.35" />
        <rect y="540" width="1600" height="360" fill="url(#ripple)" />

        <use href="#loupe" />
        <g transform="translate(0 1080) scale(1 -1)" opacity="0.4" filter="url(#soft)">
          <use href="#loupe" />
        </g>
        <ellipse cx="1060" cy="548" rx="260" ry="10" fill="#3cc6db" opacity="0.18" filter="url(#soft)" />

        <rect width="1600" height="900" filter="url(#grain)" opacity="0.07" />
      </svg>

      <div className="scanline pointer-events-none absolute inset-0">
        <div className="h-px w-full bg-gradient-to-r from-transparent via-glow to-transparent opacity-70 shadow-[0_0_18px_2px_rgba(60,198,219,0.45)]" />
      </div>
    </div>
  )
}
