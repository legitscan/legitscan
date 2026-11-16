export const shortCa = (ca: string) => `${ca.slice(0, 6)}…${ca.slice(-4)}`

export function usd(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`
  return `$${Math.round(n)}`
}

export function age(hours: number) {
  if (hours < 1) return '<1h'
  if (hours < 48) return `${Math.round(hours)}h`
  return `${Math.round(hours / 24)}d`
}

export function ago(min: number) {
  if (min < 60) return `${min} min ago`
  return `${Math.round(min / 60)} h ago`
}

export const isCa = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s.trim())
