import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { SectionHead } from '@/components/section-head'

// /method: how each check works and where it stops. Numbers here come from PLAN.md section 3 (collector data, 10-16 Nov 2026).
export function MethodPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-10 md:px-6 md:pt-14">
      <SectionHead kicker="Method" title="How we prove a contract address.">
        A server does every check. Coins not proven yet are checked again every hour, proven ones once a day, in case the project moves to a new address. Each answer on a coin page links the page, tweet or repo it came from.
      </SectionHead>

      <Part id="website" title="1. The website shows the address">
        <p>
          We take the coin's website from its market listing (DexScreener or GeckoTerminal) and, for Pons coins, from the launch form the dev
          filled in, which is stored on chain. Never from the person asking. We read that site and
          look for the full contract address. Many sites load the address later from a script or a data file on the same site, so we read those
          too, up to 14 files per site. We only read the project's own domain.
        </p>
        <p>
          A page that lists many contract addresses, like a launchpad or an explorer, does not count: the coin has to be named as the project's
          own. A copycat can borrow a name and a logo, but it cannot put its address on the real site.
        </p>
      </Part>

      <Part id="x" title="2. The account that site links posted it">
        <p>
          The X account comes from the project's website, not from a search. When the site links several accounts, we use the one the market
          listing names. Then a tweet from that exact account has to carry the full address. Replies and quotes from other people do not count.
        </p>
        <p>
          We cannot search X for free, so tweets reach us from links on the website and from the <Link to="/claim" className="text-accent hover:underline">claim page</Link>.
          We read each tweet through X's public embed service. A deleted tweet fails on the next check, and the mark comes off.
        </p>
      </Part>

      <Part id="xmatch" title="X account match">
        <p>
          Up to three places name the project's X account: the Pons launch form, the market listing and the website. We compare them. When they
          all agree the row passes; when one names a different account we show which. This needs no X access, so it works for every coin, but
          it is not counted toward legit: the launch form and the listing are typed by the dev.
        </p>
      </Part>

      <Part id="scan" title="Scan now">
        <p>
          Open any coin and the website and X checks run right away if nobody has checked it yet. The Scan now button runs them again. One coin
          is scanned at most once every 10 minutes; a scan inside that time shows the stored result. GitHub follows on the next hourly run.
        </p>
      </Part>

      <Part id="dev" title="3. The launch wallet signs">
        <p>
          Every token has the wallet that launched it, on chain. On the <Link to="/claim" className="text-accent hover:underline">claim page</Link> the
          dev can connect that wallet and sign a short message naming the token. Signing sends nothing and costs nothing, and we never ask for a
          seed phrase. Only the holder of that wallet can make the signature, so it proves the person claiming launched the token. The message and
          signature are published on the coin page, so anyone can check them again.
        </p>
      </Part>

      <Part id="github" title="4. GitHub is active">
        <p>
          When the project's website links a GitHub account or repo, we check when code was last pushed. Active means a push in the last 30 days.
          Links that only credit someone else's code are ignored: the GitHub owner's name has to match the site or the X account.
        </p>
        <p>
          We also read the README and description of the three most recently pushed repos there. When one shows the full contract address, the
          coin gets a bonus mark. It is not counted toward legit and a missing address is not marked down: most projects keep it on their site.
        </p>
      </Part>

      <Part id="coingecko" title="5. Listed on CoinGecko">
        <p>
          Once an hour we read CoinGecko's full list of Robinhood Chain contracts and mark the coins on it, with a link to the page. It helps most
          for big tokens whose own site shows no Robinhood Chain address, like Virtuals or Robinhood's stock tokens.
        </p>
        <p>
          It is not counted toward legit. Copies can get CoinGecko pages too, so when CoinGecko lists other contracts with the same ticker we say
          so. A coin that is not listed is not marked down: new coins usually wait one to four weeks.
        </p>
      </Part>

      <Part id="legit" title="Two reports: Legit and Dev">
        <p>
          The Legit report answers one question: does this address belong to the project? Legit means check 1 passes and the X account the dev
          typed into the Pons launch form is the account the website links. Legit+ means check 1 passes and a channel the project controls
          carries the address too: a tweet from that X account, the README of the GitHub the site links, or a signature from the launch wallet.
        </p>
        <p>
          The Dev report shows what the creator did: how much it burned, sold, moved to other wallets or still holds, how many coins the wallet
          launched, and how much the top 10 wallets hold. It never changes the Legit level. A dev burn is a good sign, not proof: in our data
          from Nov 2026, coins whose dev burned most of its tokens fell as often as the rest, because a dev can keep more in other wallets.
        </p>
      </Part>

      <Part id="not-safe" title="Legit does not mean safe">
        <p>
          A proven address tells you who made the coin, not what they will do with it. A team can build a site, an account and a token together;
          the identity is then real and the coin can still lose its liquidity. In our data from 10 to 16 Nov 2026, 5 of 31 tokens that had a
          website and an X account lost their liquidity anyway, and 4 of those 5 showed their address on their own site.
        </p>
        <p>That is why risk sits in its own column: where the coin trades, what the owner can still change, what the dev wallet did, how thin the pool is, and how new the website's domain is (a warning under 7 days, from the registry's public RDAP record), and whether the site has a domain at all (a warning when it runs on free hosting like vercel.app). A token whose name hides characters that change how it is displayed, or mixes look-alike letters from another alphabet, gets a warning and is shown as it is really written.</p>
      </Part>
    </main>
  )
}

function Part({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-line py-8">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="mt-3 flex flex-col gap-3 text-body">{children}</div>
    </section>
  )
}
