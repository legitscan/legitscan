import { useState } from 'react'

// One Google Flow still from public/film/<name>.jpg, with drift and grain. Until the still exists,
// a pale salt-flat gradient holds its place so the layout never jumps.
export function FilmShot({ name, alt = '', className = '', position = 'center' }: { name: string; alt?: string; className?: string; position?: string }) {
  const [missing, setMissing] = useState(false)
  return (
    <div className={`grain relative overflow-hidden bg-[linear-gradient(180deg,#f6f9fb_0%,#e7eef3_55%,#dfe8ee_56%,#eef3f6_100%)] ${className}`}>
      {!missing && (
        <img
          src={`/film/${name}.jpg`}
          alt={alt}
          onError={() => setMissing(true)}
          className="film-img absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: position }}
          decoding="async"
        />
      )}
    </div>
  )
}
