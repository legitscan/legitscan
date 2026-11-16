import { useEffect } from 'react'

// Adds .in to every .reveal element when it scrolls into view.
export function useReveal(dep?: unknown) {
  useEffect(() => {
    const els = document.querySelectorAll('.reveal:not(.in)')
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('in')
          io.unobserve(e.target)
        }
      }),
      { threshold: 0.12 },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [dep])
}
