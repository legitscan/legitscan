# Changelog

Every change worth knowing about, newest first. Versions follow [Semantic Versioning](https://semver.org): while the
version starts with 0, a new feature raises the middle number and a fix raises the last one. The format follows
[Keep a Changelog](https://keepachangelog.com).

Release steps: move the Unreleased entries under a new version and date, set the same version in
`collector/package.json` and `site/package.json`, then tag the merge commit `vX.Y.Z`.

## [Unreleased]

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
