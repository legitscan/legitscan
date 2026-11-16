// Copied from reinkeep-data/collector/src/types.ts. null always means "could not tell", never "no".
export type ContractFacts = {
  token: string;
  readAtMs: number;
  scannerVersion: number; // which version of the contract scanner produced this; see SCANNER_VERSION
  isContract: boolean;
  codeSize: number | null;
  isProxy: boolean | null;
  implementation: string | null;
  // powers, from the bytecode's function selectors (see contract-facts.ts: it finds the common names only)
  hasMint: boolean | null;
  hasPause: boolean | null;
  hasBlacklist: boolean | null;
  hasUpgrade: boolean | null;
  hasOwnerFunction: boolean | null;
  owner: string | null;
  ownerRenounced: boolean | null;
  mintWithLiveOwner: boolean | null;
  totalSupply: string | null; // base units, decimal string
  decimals: number | null;
  symbol: string | null;
};
