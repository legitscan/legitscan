import { test } from "node:test";
import assert from "node:assert/strict";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { devSignMessage, SIGN_FRESH_MS, signAnswer } from "../src/dev-sign.ts";
import { apiAnswer } from "../src/read-coins.ts";
import { saveChecks } from "../src/check-store.ts";
import { openSqlite } from "../src/sqlite-adapter.ts";

const CA = "0x47b537f7c2c2183967fe5ba883291b8ada490db6";
const NOW = Date.UTC(2026, 10, 17, 4);

test("dev sign: only the launch wallet's fresh signature passes, and it makes a website-proven coin legit", async () => {
  const dev = privateKeyToAccount(generatePrivateKey()); // throwaway test wallet, made fresh each run
  const stranger = privateKeyToAccount(generatePrivateKey());
  const wallet = dev.address.toLowerCase();
  const db = openSqlite(":memory:");
  await db.prepare("INSERT INTO coins (ca, found_via, found_ms, symbol, mc_usd, creator, dev) VALUES (?, 'pons', 1, 'OFF', 28000, ?, ?)").bind(CA, wallet, wallet).run();

  // The message is handed out only to the launch wallet.
  const ask = await apiAnswer(db, `/api/sign-message/${CA}/${wallet}`, NOW);
  assert.equal(ask.status, 200);
  const { message, issuedMs } = ask.body as { message: string; issuedMs: number };
  assert.equal(message, devSignMessage(CA, wallet, NOW));
  assert.equal((await apiAnswer(db, `/api/sign-message/${CA}/${stranger.address.toLowerCase()}`, NOW)).status, 403);

  const sign = async (who: typeof dev, text = message) => who.signMessage({ message: text });
  const send = (signature: string, extra: Record<string, unknown> = {}, at = NOW + 60_000) => signAnswer({ ca: CA, wallet, issuedMs, signature, ...extra }, db, at);

  assert.equal((await send(await sign(stranger))).status, 403); // someone else's key
  assert.equal((await send(await sign(dev, message.replace("Robinhood Chain", "another chain")))).status, 403); // other text
  assert.equal((await send(await sign(dev), {}, NOW + SIGN_FRESH_MS + 1)).status, 400); // too old
  assert.equal((await send("0x1234")).status, 400);
  const wrongWallet = await signAnswer({ ca: CA, wallet: stranger.address.toLowerCase(), issuedMs, signature: await sign(stranger, devSignMessage(CA, stranger.address, issuedMs)) }, db, NOW + 60_000);
  assert.equal(wrongWallet.status, 403); // a valid signature, but not from the launcher

  const good = await sign(dev);
  const ok = await send(good);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));

  let coin = (await apiAnswer(db, `/api/coin/${CA}`, NOW)).body as any;
  assert.equal(coin.coin.checks.dev.status, "pass");
  assert.equal(coin.coin.legit, false); // dev sign alone is not legit: the website must show the CA too
  assert.equal(coin.devSignature.signature, good); // published as sent, so anyone can check it again
  assert.equal(coin.devSignature.message, message);
  const queued = await db.prepare("SELECT count(*) AS n FROM check_queue").first<{ n: number }>();
  assert.equal(queued?.n, 0); // a signature does not reset the check schedule

  await saveChecks(db, CA, [{ kind: "website", status: "pass", reason: "ok", sourceUrl: "https://offrouter.org/", atMs: null }], NOW);
  coin = (await apiAnswer(db, `/api/coin/${CA}`, NOW)).body as any;
  assert.equal(coin.coin.legit, true); // website + dev sign
  assert.equal(coin.coin.legitLevel, 2);
  const stats = ((await apiAnswer(db, "/api/stats", NOW)).body as any).stats;
  assert.deepEqual([stats.devPass, stats.legit], [1, 1]);
  db.close();
});
