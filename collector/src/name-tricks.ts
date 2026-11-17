// Token names are free text, and two tricks make one coin look like another:
// - hidden format characters (Unicode category Cf: right-to-left override, zero-width space, ...). "‮TDSU" shows
//   as "USDT" wherever it is printed (17 Nov: two such tokens on Robinhood Chain, claiming ~$99B market cap).
// - letters from a look-alike alphabet mixed into one word: Latin "USD" with a Cyrillic "Т".
// cleanName drops the hidden ones, so every page shows the name in the order it was really written; nameTricks says
// which tricks the raw name uses.

export type NameTrick = "hidden" | "mixed";

const HIDDEN = /\p{Cf}/gu;
const LATIN = /\p{Script=Latin}/u;
const LOOKALIKE = /[\p{Script=Cyrillic}\p{Script=Greek}]/u;

export const cleanName = (s: string | null | undefined): string | null => (s == null ? null : s.replace(HIDDEN, ""));

export function nameTricks(...names: (string | null | undefined)[]): NameTrick[] {
  const found = new Set<NameTrick>();
  for (const raw of names) {
    if (!raw) continue;
    if (raw.replace(HIDDEN, "") !== raw) found.add("hidden");
    for (const word of cleanName(raw)!.split(/\s+/)) if (LATIN.test(word) && LOOKALIKE.test(word)) found.add("mixed");
  }
  return [...found];
}
