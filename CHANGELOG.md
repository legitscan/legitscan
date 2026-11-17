# Changelog

Every change worth knowing about, newest first. Versions follow [Semantic Versioning](https://semver.org): while the
version starts with 0, a new feature raises the middle number and a fix raises the last one. The format follows
[Keep a Changelog](https://keepachangelog.com).

Release steps: move the Unreleased entries under a new version and date, set the same version in
`collector/package.json` and `site/package.json`, then tag the merge commit `vX.Y.Z`.

## [Unreleased]

### Added

- Tests on every pull request (`.github/workflows/test.yml`): the collector's tests, edge cases from real sites
  included, and the site build. A red check means do not merge yet.
- Weekly second check (`.github/workflows/audit.yml`, `collector/audit.ts`): a plainer, deeper reader looks at every
  coin's website on Monday and compares with the collector. Disagreements go into one GitHub issue. Writes nothing to D1.
- Coin page: the "Your project?" note says the one step that is missing (put the CA on the site, or post it from the
  project's X account), instead of the same link for every coin.
- Coins page: proof tabs with counts (All coins, Legit, Legit+, CA on site), market cap and sort as plain choices
  instead of dropdowns, and 25 coins a page. Titled "Every coin and its proof".
- Name tricks: a token name with hidden characters that change how it is displayed (two tokens show as USDT this
  way) or with look-alike letters from another alphabet gets a warning, and is shown as it is really written.
- CoinGecko page links: for coins listed on CoinGecko, the website and X account on their CoinGecko page are read
  about once a month. The website is checked like any other, and the X account counts like the Pons launch form's for
  the Legit level (MOWCAT has no launch form and no paid DexScreener info).
- The Pons boards mark legit and legit+ coins.

### Changed

- One readable verdict per coin on the coins list and the boards: Legit+, Legit with what proved it, CA on site, Not
  proven, Not checked or No website. The old row of small marks pushed the word "legit" over the MC column.
- CoinGecko pages are read 20 a run instead of 5.
- Launch forms of coins found before 17 Nov are looked up 50 a run instead of 10 (ZOLVA waited behind 101 coins).
- The collector checks 100 coins a run instead of 25, eight at a time (17 Nov: 223 coins were waiting).

### Fixed

- A launch form or CoinGecko page that names the same X account and website as before no longer voids the X match.
  On 17 Nov reading 20 CoinGecko pages took Legit away from 15 coins (KUDO, WORM, ROUTE, ...) for an hour. Only an X
  account or website new to us voids it now; the coin is queued for a fresh check either way.
- Missed coins, 17 Nov: a site that lists many contracts now counts when it is named after the coin and no other coin
  on that page could claim the name (a copy on a launchpad named like the coin still fails). OSTRA, QUANTA, SCROOGE,
  PONS and 12 more were read as "a page listing many coins".
- The hourly run reads 20 files a site instead of 14: own.money, ignition.family, listed.exchange and scopl.live keep
  their CA in file 15 to 20.
- CoinGecko pages of coins whose website already shows the CA are read first (56 of 117 were waiting).
- A Legit level could rest on an X account match made before the launch form or CoinGecko page was read (ZEAL: form
  @zealthemascot, site @ZEALZdotfun). New team links now void the old match and queue the coin; 58 stale matches were
  voided on 17 Nov.
- The coins list showed only the 100 biggest coins (down to $230k MC), so RUSHR, ZOLVA and most coins were missing.
  It now lists every coin over $5k.
- A website link with a contract address in it (a launchpad or explorer page for the token, like NOVAAI's CoinGecko
  "website") is no longer read as the project's site: such a page always shows the address.
- The GeckoTerminal stage stops after 6 minutes, so the legit checks always get their turn: on 17 Nov it took 15.5 of
  the run's 20 minutes.
- The home page said none of the board's coins had passed the legit checks, and that data refreshed every 5 minutes.
  The collector runs about once an hour.

## [0.2.0] - 2026-11-17

### Added

- README: what a scan shows, how the parts fit together, the API, running it locally, configuration and limits.
- Legit checks: the project's website shows the full address (the page, its scripts and data files, including modules
  a script imports), the X account that site links posted it (read through X's public embed service), the launch
  form, the market listing and the website name the same X account, GitHub activity and the address in a GitHub
  README, a signature from the launch wallet, and a CoinGecko listing for Robinhood Chain.
- Legit report with two levels. Legit: the website shows the address and the Pons launch form's X account is the one
  the site links. Legit+: the website shows it and a tweet, the GitHub README or the launch wallet's signature carries
  it too.
- Dev report: what the launch wallet received, burned, sold, moved to other wallets and still holds, how many coins it
  launched, and how much the top 10 wallets hold. It never changes the Legit level.
- Pons launch form (website, X, Telegram, GitHub, description) read from the launch transaction; the launch wallet of
  coins launched elsewhere.
- Instant scan: a coin page checks an unchecked coin as soon as it opens, plus a Scan now button (once per coin every
  10 minutes, 30 scans an hour per sender).
- Claim page for tweets that carry a coin's address, and dev sign with the launch wallet.
- Risk facts: how long ago the website's domain was registered, and a warning when the site runs on free hosting with
  no domain of its own.
- Stats and Method pages; a notice on every scan that the buyer decides.
- Pages Function API over D1: coin, coins, boards, copies, stats, scan, claim and sign.

### Changed

- Coins not proven yet are checked again every hour, proven ones once a day.
- Landing page: the glass check stays in the hero and the closing scene; the chapters show live data cards.

### Fixed

- A scan or claim read at most 8 files of a site and could mark a passing coin as failed (ZOLVA keeps its address in
  its 10th file). Now 14 files a site, 20 in all.
- Domain age on free hosting showed the platform's age (vercel.app, 2020) instead of the site's.
- The launch form is read through a keyed RPC when set: the public node answers Cloudflare with HTTP 429. A failed
  read is now reported instead of silent.
- The CoinGecko stage read stored answers coin by coin and took 6.5 of 12 minutes; it now reads them once and writes
  only changes.

## [0.1.0] - 2026-11-16

### Added

- Site design (Vite and React) and the deploy to Cloudflare Pages.
- Collector on GitHub Actions into Cloudflare D1: Pons launches, market data from DexScreener, holders from
  GeckoTerminal, contract owner powers and dev wallet flows.
- Pons boards: new launches, almost bonded, and migrated to a DEX pool.

### Fixed

- The Pons bonding curve is read straight from each pool on chain, because GeckoTerminal answered GitHub's runners with
  HTTP 429.
- Fewer D1 reads, so a run fits in 5 minutes.
- The collector schedule moved off minute zero, where GitHub delayed or dropped runs.

[Unreleased]: https://github.com/legitscan/legitscan/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/legitscan/legitscan/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/legitscan/legitscan/releases/tag/v0.1.0
