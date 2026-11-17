import type { ReactNode } from 'react'

export function SectionHead({ kicker, title, children }: { kicker: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <div className="label">{kicker}</div>
        <h2 className="display mt-3 text-[34px] md:text-[2.4rem]">{title}</h2>
        {children && <p className="mt-3 max-w-xl text-body">{children}</p>}
      </div>
    </div>
  )
}
