export const shortCa = (ca: string) => `${ca.slice(0, 6)}…${ca.slice(-4)}`

export function usd(n: number) {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}T` // fake "BTC" clones on thin pools reach this
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
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

// Time since an epoch-ms moment, short: "40m", "5h", "3d".
export function since(ms: number | null, now = Date.now()) {
  if (ms === null) return 'no data'
  const min = Math.max(0, (now - ms) / 60_000)
  if (min < 60) return `${Math.round(min)}m`
  return age(min / 60)
}

export const pctText = (n: number | null) => (n === null ? 'no data' : `${Math.round(n * 10) / 10}%`)
