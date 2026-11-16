// EXAMPLE DATA for the design pass. Every coin, address and number in this file is invented.
// The site shows an "Example data" label wherever this file is used. Replace with the API once it exists.

export type Check = 'pass' | 'fail' | 'none'
export type Status = 'verified' | 'pending' | 'revoked'

export type Coin = {
  chain: 'robinhood'
  ca: string
  name: string
  ticker: string
  what: string // one line: what the product does
  mcUsd: number
  liqUsd: number
  ageHours: number
  venue: string
  lpLocked: boolean
  status: Status
  source: 'claimed' | 'auto'
  checkedMinAgo: number
  checks: { website: Check; x: Check; github: Check; x402: Check }
  website: string
  xHandle: string
  github?: string
  lastCommitHoursAgo?: number
  x402Usdg?: number
  ownerPowers: string[] // mint, pause, blacklist, upgrade
  burnedPct: number
  lookalikes: number
  note?: string // why pending or revoked
}

export const coins: Coin[] = [
  {
    chain: 'robinhood', ca: '0x7c3a91e04b2d58f6a1c9e3b07d4f2a61c8e5b19d', name: 'Lumen Agent', ticker: 'LUMEN',
    what: 'Pay-per-call research agent with an x402 endpoint', mcUsd: 312_000, liqUsd: 48_200, ageHours: 9,
    venue: 'pons-v2', lpLocked: true, status: 'verified', source: 'claimed', checkedMinAgo: 4,
    checks: { website: 'pass', x: 'pass', github: 'pass', x402: 'pass' },
    website: 'lumen-agent.example', xHandle: 'lumenagent', github: 'lumen-agent/core', lastCommitHoursAgo: 3,
    x402Usdg: 412.5, ownerPowers: [], burnedPct: 0, lookalikes: 3,
  },
  {
    chain: 'robinhood', ca: '0x2f84d0b6e19a37c5f2e8d4a90b1c6e73f5a2d084', name: 'Driftline', ticker: 'DRIFT',
    what: 'Wallet alerts for new pools, Telegram bot and API', mcUsd: 188_400, liqUsd: 31_050, ageHours: 26,
    venue: 'pons-v2', lpLocked: true, status: 'verified', source: 'auto', checkedMinAgo: 11,
    checks: { website: 'pass', x: 'pass', github: 'pass', x402: 'none' },
    website: 'driftline.example', xHandle: 'driftline_app', github: 'driftline/bot', lastCommitHoursAgo: 20,
    ownerPowers: [], burnedPct: 2.1, lookalikes: 0,
  },
  {
    chain: 'robinhood', ca: '0xa90e5c27d4b13f86e0a2c9d5b74f1e38a6c20d57', name: 'Quartz MCP', ticker: 'QRTZ',
    what: 'MCP server that reads Robinhood Chain for any agent', mcUsd: 446_900, liqUsd: 70_300, ageHours: 51,
    venue: 'long-xyz', lpLocked: true, status: 'verified', source: 'claimed', checkedMinAgo: 2,
    checks: { website: 'pass', x: 'pass', github: 'pass', x402: 'pass' },
    website: 'quartzmcp.example', xHandle: 'quartz_mcp', github: 'quartz-mcp/server', lastCommitHoursAgo: 1,
    x402Usdg: 1_208, ownerPowers: [], burnedPct: 0, lookalikes: 7,
  },
  {
    chain: 'robinhood', ca: '0x5d1b73a8f0c2e94d6b3a17e5c08f2d9b4e61a3c2', name: 'Ferro', ticker: 'FERRO',
    what: 'Gas and fee estimator API for trading bots', mcUsd: 121_700, liqUsd: 18_900, ageHours: 4,
    venue: 'uniswap-v3', lpLocked: false, status: 'verified', source: 'claimed', checkedMinAgo: 7,
    checks: { website: 'pass', x: 'pass', github: 'fail', x402: 'none' },
    website: 'ferro.example', xHandle: 'ferroapi', ownerPowers: ['mint'], burnedPct: 0, lookalikes: 1,
  },
  {
    chain: 'robinhood', ca: '0xc4e8a2f17b05d93e6a1c8f4b2d7e05a3b9c61f80', name: 'Tessellate', ticker: 'TESS',
    what: 'Open-source chart engine for on-chain data', mcUsd: 264_000, liqUsd: 39_400, ageHours: 73,
    venue: 'virtuals', lpLocked: true, status: 'verified', source: 'auto', checkedMinAgo: 15,
    checks: { website: 'pass', x: 'pass', github: 'pass', x402: 'none' },
    website: 'tessellate.example', xHandle: 'tessellate_dev', github: 'tessellate/engine', lastCommitHoursAgo: 46,
    ownerPowers: [], burnedPct: 12.4, lookalikes: 2,
  },
  {
    chain: 'robinhood', ca: '0x81f3c0a6d2e47b95c1a8e3f06d4b27c9e5a0f3b6', name: 'Sablenet', ticker: 'SABLE',
    what: 'Private RPC relay for agents', mcUsd: 97_200, liqUsd: 12_600, ageHours: 2,
    venue: 'pons-v2', lpLocked: true, status: 'pending', source: 'auto', checkedMinAgo: 3,
    checks: { website: 'pass', x: 'none', github: 'pass', x402: 'none' },
    website: 'sablenet.example', xHandle: 'sablenet', github: 'sablenet/relay', lastCommitHoursAgo: 5,
    ownerPowers: [], burnedPct: 0, lookalikes: 0, note: 'Website shows the CA. No tweet from @sablenet with it yet.',
  },
  {
    chain: 'robinhood', ca: '0x3e9a5d0c71b84f2e6d3a9c05b18e7f4a2c6d0b93', name: 'Pylon Data', ticker: 'PYLON',
    what: 'Token holder exports as CSV and JSON', mcUsd: 143_500, liqUsd: 22_100, ageHours: 6,
    venue: 'bankr', lpLocked: true, status: 'pending', source: 'claimed', checkedMinAgo: 9,
    checks: { website: 'fail', x: 'pass', github: 'none', x402: 'none' },
    website: 'pylondata.example', xHandle: 'pylon_data', ownerPowers: [], burnedPct: 0, lookalikes: 0,
    note: 'Tweet has the CA. The website does not show it yet.',
  },
  {
    chain: 'robinhood', ca: '0x9b02e6f4a8c13d75e0b2a9f6c4d81e3a7b5c20e4', name: 'Hexgate', ticker: 'HXG',
    what: 'Token launch scanner', mcUsd: 0, liqUsd: 140, ageHours: 40,
    venue: 'uniswap-v2', lpLocked: false, status: 'revoked', source: 'auto', checkedMinAgo: 22,
    checks: { website: 'fail', x: 'fail', github: 'pass', x402: 'none' },
    website: 'hexgate.example', xHandle: 'hexgate_io', github: 'hexgate/scan', lastCommitHoursAgo: 90,
    ownerPowers: ['mint', 'blacklist'], burnedPct: 0, lookalikes: 4,
    note: 'Launch tweet deleted and the website now shows a different CA.',
  },
  {
    chain: 'robinhood', ca: '0x6a4c1f8e30d29b57a6e1c4f0b83d2a9e5c7f14d1', name: 'Northvane', ticker: 'NVANE',
    what: 'Prediction feed API', mcUsd: 54_300, liqUsd: 3_900, ageHours: 30,
    venue: 'uniswap-v4', lpLocked: false, status: 'revoked', source: 'claimed', checkedMinAgo: 41,
    checks: { website: 'pass', x: 'fail', github: 'none', x402: 'none' },
    website: 'northvane.example', xHandle: 'northvane', ownerPowers: ['upgrade'], burnedPct: 0, lookalikes: 0,
    note: 'The X account was renamed. Old handle now belongs to someone else.',
  },
]

export const copycats = [
  { ticker: 'QRTZ', copies: 7, newest: '14 min ago' },
  { ticker: 'LUMEN', copies: 3, newest: '1 h ago' },
  { ticker: 'TESS', copies: 2, newest: '5 h ago' },
]

export function findCoin(ca: string) {
  return coins.find((c) => c.ca.toLowerCase() === ca.toLowerCase())
}
