import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeFunctionData, parseAbi, stringToHex } from "viem";
import { parseLaunchInput, sortLinks } from "../src/chain-reads.ts";

const ABI = parseAbi([
  "function launchAndBuy((string,string,string,string,(string,string,string,string,string),address,uint16,bool,bytes32,bytes32),uint256,address,uint256,uint256,address,address[])",
]);
const ZERO = "0x0000000000000000000000000000000000000000";
const B32 = ("0x" + "11".repeat(32)) as `0x${string}`;

test("launch form: launchAndBuy decoded, links sorted by what they point at", () => {
  // The same shape as ORBIO's real launch (17 Nov): X in slot 1, website in slot 4, other slots empty.
  const input = encodeFunctionData({
    abi: ABI,
    functionName: "launchAndBuy",
    args: [
      ["Orbio.so", "ORBIO", "ipfs://bafk", "Hold $ORBIO, earn OpenRouter credits.", ["https://x.com/orbiodotso", "", "", "https://orbio.so", ""], ZERO, 0, false, B32, B32],
      0n, ZERO, 0n, 0n, ZERO, [],
    ],
  });
  assert.deepEqual(parseLaunchInput(input), {
    description: "Hold $ORBIO, earn OpenRouter credits.",
    website: "https://orbio.so",
    x: "orbiodotso",
    telegram: null,
    github: null,
  });
});

test("launch form: another launch function falls back to the links in its input; junk is ignored", () => {
  const other = "0xb0da329a" + stringToHex("x https://t.me/coin y https://coin.fun/app z https://twitter.com/coin_dev").slice(2);
  assert.deepEqual(parseLaunchInput(other), { description: null, website: "https://coin.fun/app", x: "coin_dev", telegram: "https://t.me/coin", github: null });
  assert.equal(parseLaunchInput("0x12"), null);
  assert.equal(parseLaunchInput("hello"), null);
  const s = sortLinks(["javascript:alert(1)", "https://discord.gg/abc", "https://github.com/org/repo", "https://x.com/intent/follow?x=1", "https://site.xyz"], null);
  assert.deepEqual([s.website, s.github, s.x], ["https://site.xyz", "https://github.com/org/repo", null]);
});
