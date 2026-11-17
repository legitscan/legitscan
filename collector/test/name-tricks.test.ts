import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanName, nameTricks } from "../src/name-tricks.ts";
import { apiAnswer } from "../src/read-coins.ts";
import { openSqlite } from "../src/sqlite-adapter.ts";

const RLO = "‮"; // right-to-left override: what follows is shown backwards

test("name tricks: hidden characters are removed and flagged, look-alike alphabets are flagged", () => {
  assert.equal(cleanName(`${RLO}TDSU`), "TDSU"); // shown in the order it was written, not as "USDT"
  assert.deepEqual(nameTricks(`${RLO}TDSU`, "Tether USD"), ["hidden"]);
  assert.deepEqual(nameTricks("USDТ"), ["mixed"]); // Cyrillic Т at the end
  assert.deepEqual(nameTricks("ze​ro"), ["hidden"]); // zero-width space
  assert.deepEqual(nameTricks("ORBIO", "Orbio Agent"), []);
  assert.deepEqual(nameTricks("ПУТИН", "Ελλάδα"), []); // one alphabet per word is fine
  assert.deepEqual(nameTricks(null, undefined), []);
});

test("name tricks reach the API: clean name, the trick named", async () => {
  const db = openSqlite(":memory:");
  const ca = "0x" + "6a".repeat(20);
  await db.prepare("INSERT INTO coins (ca, found_via, found_ms, symbol, name, mc_usd) VALUES (?, 'geckoterminal', 1, ?, ?, 99000000000)").bind(ca, `${RLO}TDSU`, `${RLO}TDSU`).run();
  const coin = ((await apiAnswer(db, `/api/coin/${ca}`, 2)).body as any).coin;
  assert.deepEqual([coin.symbol, coin.name, coin.nameTricks], ["TDSU", "TDSU", ["hidden"]]);
  db.close();
});
