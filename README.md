# LegitScan

Paste a contract address, see whether it belongs to the project it claims to be.

LegitScan checks tech coins on Robinhood Chain against the places a project controls: its own website, the X account
that site links, its GitHub, and the chain itself. Rug risk and what the creator did with the token are shown next to
it, as separate reports.

**Live:** [legitscan.pages.dev](https://legitscan.pages.dev)

> A scan helps you decide faster. It does not decide for you. The checks read public facts, which can be wrong or out
> of date, and a coin that passes every check can still lose its value. Nothing here is financial advice.

## What a scan shows

### Legit report: does this address belong to the project?

| Level | Needs |
|---|---|
| **Legit** | The project's website shows the full address, and the X account typed into the Pons launch form is the one that website links. |
| **Legit+** | The website shows the address, and a second channel the project controls carries it too: a tweet from the X account the site links, the README of the GitHub the site links, or a signature from the wallet that launched the token. |
| Not proven | Anything less. A coin is never marked down for being new. |

Every row links the page, tweet or repo that proves it, with the time it was last checked. Shown but not counted
toward a level: GitHub activity (a push in the last 30 days), a CoinGecko listing for Robinhood Chain, and whether
the launch form, the market listing and the website name the same X account.

### Dev report: what did the creator do?

How much of the token the launch wallet received, burned, sold, moved to other wallets or still holds, how many coins
that wallet launched, and how much the top 10 wallets hold. It never changes the Legit level. A burn is a good sign,
not a promise: a dev can keep more in other wallets.

### Risk

Where the coin trades (Pons bonding curve or a DEX pool), market cap against liquidity, holders, what the contract
owner can still change, how long ago the website's domain was registered, whether the site runs on free hosting with
no domain of its own, and other contracts using the same ticker.

## How it works

```
GitHub Actions (collector, hourly) ──► Cloudflare D1 ◄── Pages Function /api ◄── site (React)
        │                                                       │
        └── Robinhood Chain RPC, DexScreener, GeckoTerminal,    └── instant scan when a coin page opens
            CoinGecko, project websites, X oEmbed, GitHub API
```

- **Collector** (`collector/`): finds every Pons launch and the busy Robinhood Chain pools, reads market data, the
  Pons bonding curve, holders, the dev wallet's moves and the Pons launch form, then runs the legit checks. Coins not
  proven yet are checked again every hour, proven ones once a day.
- **API** (`site/functions/api`): a Cloudflare Pages Function over the same D1 database. `POST /api/scan/{ca}` checks a
  coin on the spot (at most once every 10 minutes per coin).
- **Site** (`site/`): React and Vite. The coin page runs a scan the first time anyone opens an unchecked coin.

X is read without scraping: tweets come from links on the project's website or from the claim page, and are read
through X's public embed service.

## API

All answers are JSON. `GET` answers are cached for 60 seconds.

| Route | Answer |
|---|---|
| `GET /api/coin/{ca}` | One coin with its checks, levels, risk facts and check history |
| `GET /api/coins` | Coins at or above $5k market cap |
| `GET /api/board/new` · `almost` · `migrated` | Pons boards: new launches, almost bonded, left the curve |
| `GET /api/copies` | Tickers launched more than once in the last 3 days |
| `GET /api/stats` | Counts per check and the latest pass of each |
| `POST /api/scan/{ca}` | Check a coin now |
| `POST /api/claim` | Send a tweet that carries a coin's address |
| `GET /api/sign-message/{ca}/{wallet}`, `POST /api/sign` | Dev sign: the launch wallet signs a short message (free, sends nothing) |

## Run it locally

Node 24.

```bash
cd collector && npm install
npm test                  # unit tests, offline
node run-local.ts         # one collector run into collector/data/legitscan.sqlite
```

```bash
cd site && npm install
node dev-api.ts           # /api on 127.0.0.1:8788, reading the local SQLite copy
npm run dev               # the site, proxying /api to dev-api
```

RPC nodes come from `RPC_URLS` and `LOGS_RPC_URLS` (comma separated) when set; otherwise the public Robinhood Chain
node is used.

## Configuration

Collector (GitHub Actions secrets):

| Secret | Use |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `D1_DATABASE_ID` | Write to D1 |
| `RPC_URLS`, `LOGS_RPC_URLS` | Robinhood Chain RPC nodes |
| `COINGECKO_API_KEY` | CoinGecko Demo key, list read once an hour |
| `X_BEARER_TOKEN` | Optional paid X API to search tweets; without it tweets come from websites and claims |

Site (Cloudflare Pages secrets):

| Secret | Use |
|---|---|
| `RPC_URL` | Keyed RPC for scans; the public node rate-limits Cloudflare |
| `TURNSTILE_SECRET` | Optional bot check on the claim form |

Database schema: `collector/schema.sql`, with changes in `collector/migrations/`.

## Layout

```
collector/
  src/legit-checks.ts   website, X, X account match, GitHub checks
  src/check-store.ts    which coins to check, storing results and history
  src/scan.ts           instant scan
  src/claim.ts          tweet claims
  src/dev-sign.ts       launch wallet signatures
  src/coingecko.ts      CoinGecko listing
  src/chain-reads.ts    Pons launches, launch forms, launch wallets
  src/read-coins.ts     the API answers and the Legit levels
  src/collect-run.ts    one collector run, stage by stage
site/
  functions/api/        Cloudflare Pages Function
  src/pages/            home, coins, coin, claim, stats, method
```

## Limits

- Robinhood Chain only for now.
- A coin has to be in the list first: every Pons launch and the busier Robinhood Chain pools. Other coins show up once
  they trade there.
- Legit says who made the coin, not what they will do with it. A team can build a site, an account and a token
  together; the identity is then real and the coin can still lose its liquidity.
