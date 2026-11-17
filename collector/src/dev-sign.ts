// Dev sign: the wallet that launched a token signs a short message on /claim. Only the holder of that wallet's key can
// make the signature, so it proves the person claiming is the token's creator. No transaction, no gas, no seed phrase.
// Plain wallets only (personal_sign). Smart-contract wallets would need an on-chain ERC-1271 call; none launched a
// coin on our list so far, add it when one does.
import { recoverMessageAddress } from "viem";
import type { D1Like } from "./d1-types.ts";
import { saveChecks } from "./check-store.ts";

export const SIGN_FRESH_MS = 15 * 60_000; // a message is good for 15 minutes after we hand it out
const ADDRESS = /^0x[0-9a-f]{40}$/;

// The exact text the wallet shows and signs. The server rebuilds it from the parts, so nothing else can be signed in.
export function devSignMessage(ca: string, wallet: string, issuedMs: number) {
  return [
    "LegitScan dev check",
    "",
    "I launched this token on Robinhood Chain.",
    `Token: ${ca.toLowerCase()}`,
    `Wallet: ${wallet.toLowerCase()}`,
    `Issued: ${new Date(issuedMs).toISOString()}`,
    "",
    "Signing is free and sends nothing.",
  ].join("\n");
}

type Answer = { status: number; body: Record<string, unknown> };
const no = (status: number, error: string): Answer => ({ status, body: { error } });

// The launch wallet we know for a coin: the Pons launch event's creator, else the dev wallet GeckoTerminal reports.
async function launchWallet(db: D1Like, ca: string) {
  return db.prepare("SELECT ca, symbol, coalesce(creator, dev) AS wallet FROM coins WHERE ca = ?").bind(ca).first<{ ca: string; symbol: string | null; wallet: string | null }>();
}

// GET /api/sign-message/{ca}/{wallet}: the message to sign, issued now. Refuses early when the wallet is not the
// launcher, so a dev does not sign for nothing.
export async function signMessageAnswer(db: D1Like, ca: string, wallet: string, now: number): Promise<Answer> {
  const c = ca.toLowerCase();
  const w = wallet.toLowerCase();
  if (!ADDRESS.test(c) || !ADDRESS.test(w)) return no(400, "Not a 0x address.");
  const coin = await launchWallet(db, c);
  if (!coin) return no(404, "That coin is not in our list yet.");
  if (!coin.wallet) return no(404, "We do not know which wallet launched this coin yet, so a signature cannot be checked.");
  if (coin.wallet !== w) return no(403, `This wallet did not launch $${coin.symbol ?? "this coin"}. Connect the wallet that launched it (${coin.wallet.slice(0, 6)}…${coin.wallet.slice(-4)}).`);
  return { status: 200, body: { message: devSignMessage(c, w, now), issuedMs: now } };
}

// POST /api/sign: { ca, wallet, issuedMs, signature }. Rebuilds the message, recovers the signer, compares it with the
// launch wallet, and stores the signature so anyone can check it again.
export async function signAnswer(input: unknown, db: D1Like, now: number): Promise<Answer> {
  const b = (input ?? {}) as { ca?: unknown; wallet?: unknown; issuedMs?: unknown; signature?: unknown };
  const ca = typeof b.ca === "string" ? b.ca.toLowerCase() : "";
  const wallet = typeof b.wallet === "string" ? b.wallet.toLowerCase() : "";
  const issuedMs = typeof b.issuedMs === "number" ? b.issuedMs : NaN;
  const signature = typeof b.signature === "string" ? b.signature : "";
  if (!ADDRESS.test(ca) || !ADDRESS.test(wallet)) return no(400, "Not a 0x address.");
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) return no(400, "That is not a wallet signature.");
  if (!Number.isFinite(issuedMs) || issuedMs > now + 60_000 || now - issuedMs > SIGN_FRESH_MS) return no(400, "The message expired. Ask for a new one and sign again.");

  const coin = await launchWallet(db, ca);
  if (!coin?.wallet) return no(404, "We do not know which wallet launched this coin yet.");
  const message = devSignMessage(ca, wallet, issuedMs);
  let signer: string;
  try {
    signer = (await recoverMessageAddress({ message, signature: signature as `0x${string}` })).toLowerCase();
  } catch {
    return no(400, "That signature could not be read.");
  }
  if (signer !== wallet) return no(403, "The signature is not from this wallet.");
  if (signer !== coin.wallet) return no(403, "This wallet did not launch the coin.");

  await db
    .prepare(
      `INSERT INTO dev_signatures (ca, wallet, message, signature, signed_ms) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (ca) DO UPDATE SET wallet = excluded.wallet, message = excluded.message, signature = excluded.signature, signed_ms = excluded.signed_ms`,
    )
    .bind(ca, signer, message, signature, now)
    .run();
  await saveChecks(db, ca, [{ kind: "dev", status: "pass", reason: `The wallet that launched this token (${signer.slice(0, 6)}…${signer.slice(-4)}) signed the claim.`, sourceUrl: null, atMs: now }], now, false);
  return { status: 200, body: { ca, symbol: coin.symbol, wallet: signer } };
}
