import { useEffect, useState } from 'react'

// One coin as /api answers it. Mirrors ApiCoin in collector/src/read-coins.ts (readCoins); null = no data yet.
export type LiveCoin = {
  ca: string
  symbol: string | null
  name: string | null
  icon: string | null
  websites: string[]
  x: string | null
  dex: string | null
  mcUsd: number | null
  liqUsd: number | null
  mcOverLiq: number | null
  mcNotBacked: boolean | null
  pairCreatedMs: number | null
  launchedMs: number | null
  bondPct: number | null
  bonded: boolean | null
  bondedMs: number | null
  holders: number | null
  top10Pct: number | null
  powers: string[] | null
  ownerRenounced: boolean | null
  burnedPct: number | null
  dev: string | null
  devLaunches: number | null
  devGotPct: number | null
  devBurnedPct: number | null
  devToContractPct: number | null
  devToWalletPct: number | null
  devHoldsPct: number | null
  sameTicker: number | null
  checkedMs: number | null
  error: string | null
  domain: string | null
  domainCreatedMs: number | null
  domainYoung: boolean | null // registered under 7 days ago
  freeHost: string | null // the site runs on free hosting (vercel.app...), no domain of its own
  // collector/src/name-tricks.ts: "hidden" = invisible characters that change how the name shows (removed from symbol
  // and name already), "mixed" = look-alike letters from another alphabet in one word
  nameTricks: ('hidden' | 'mixed')[]
  // What the dev typed into the Pons launch form, read from the launch transaction. Self-declared. null = not read yet or not a Pons launch.
  launchForm: { description: string | null; website: string | null; x: string | null; telegram: string | null; github: string | null } | null
  checks: { website: CheckRow | null; x: CheckRow | null; xmatch: CheckRow | null; github: CheckRow | null; githubca: CheckRow | null; dev: CheckRow | null; coingecko: CheckRow | null }
  legit: boolean // Legit or Legit+
  legitLevel: 0 | 1 | 2 // collector/src/read-coins.ts legitLevel: 1 Legit, 2 Legit+
}

export type CheckStatus = 'pass' | 'fail' | 'none' | 'error'
// One legit check as the API stores it (collector/src/check-store.ts). sourceUrl = the page, tweet or repo that proves it.
export type CheckRow = { status: CheckStatus; reason: string; sourceUrl: string | null; atMs: number | null; checkedMs: number; passedMs: number | null }
export type CheckKind = 'website' | 'x' | 'xmatch' | 'github' | 'githubca' | 'dev' | 'coingecko'
export type HistoryRow = { kind: CheckKind; status: CheckStatus; reason: string; atMs: number }
export type LatestPass = { ca: string; symbol: string | null; name: string | null; reason: string; sourceUrl: string | null; checkedMs: number; passedMs: number | null }
export type Stats = {
  coins: number
  overFloor: number
  checked: number
  websitePass: number
  websiteFail: number
  xPass: number
  githubPass: number
  devPass: number
  coingeckoPass: number
  legit: number
  legitPlus: number
  claims: number
  tokenChecks: number
  tokenChecksToday: number
  tokenChecksSince: string | null
  latest: { website: LatestPass | null; x: LatestPass | null; github: LatestPass | null; dev: LatestPass | null }
}

export type BoardName = 'new' | 'almost' | 'migrated'
export type DevSignature = { wallet: string; message: string; signature: string; signedMs: number }
type Answer = { updatedMs: number | null; coins?: LiveCoin[]; coin?: LiveCoin; history?: HistoryRow[]; devSignature?: DevSignature | null; stats?: Stats; copies?: { ticker: string; contracts: number }[]; error?: string }
export type ApiState = { loading: boolean; failed: boolean; notFound: boolean; data: Answer | null }

// GET /api/... once per path. Errors become a state the page shows, never invented numbers.
// A visitor checked a token (pasted its CA and pressed Check, or pressed Scan now): counted for /stats "Token checks".
// keepalive, so it still goes out when the page navigates away right after. Failure is ignored: it is only a count.
export function countCheck(ca: string) {
  fetch(`/api/check/${ca.trim().toLowerCase()}`, { method: 'POST', keepalive: true }).catch(() => {})
}

// The last good answer per path, for this tab: going back to /coins from a coin page shows the list at once while a
// fresh copy loads behind it.
const seen = new Map<string, Answer>()

export function useApi(path: string): ApiState {
  const [state, setState] = useState<ApiState>(() => {
    const kept = seen.get(path)
    return { loading: !kept, failed: false, notFound: false, data: kept ?? null }
  })
  useEffect(() => {
    let live = true
    const kept = seen.get(path)
    // No kept copy: keep showing what is there (the coin page shows the same coin while ?fresh= reloads it after a scan).
    setState((s) => (kept ? { loading: false, failed: false, notFound: false, data: kept } : { ...s, loading: true }))
    fetch(path)
      .then(async (r) => {
        const data = (await r.json()) as Answer
        if (r.ok) seen.set(path, data)
        if (live) setState({ loading: false, failed: !r.ok && r.status !== 404, notFound: r.status === 404, data })
      })
      .catch(() => live && setState(kept ? { loading: false, failed: false, notFound: false, data: kept } : { loading: false, failed: true, notFound: false, data: null }))
    return () => {
      live = false
    }
  }, [path])
  return state
}

export const coinName = (c: LiveCoin) => c.symbol ?? c.name ?? `${c.ca.slice(0, 6)}…`
// The name under the ticker, unless it only repeats it ("GC GC").
export const subName = (c: LiveCoin) => (c.name && c.symbol && c.name.toLowerCase() !== c.symbol.toLowerCase() ? c.name : null)
// When the coin left the curve. Its DEX pair is created at migration, so DexScreener's pair time is exact; bondedMs is
// when the collector first saw it migrated (late for coins that migrated before the collector watched them).
export const migratedMs = (c: LiveCoin) => c.pairCreatedMs ?? c.bondedMs
