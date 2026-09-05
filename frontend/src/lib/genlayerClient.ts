import { createClient, chains } from "genlayer-js";
import type { Address } from "genlayer-js/types";
import { RPC_URL, EXPLORER_URL, requireContractAddress } from "./config";

// A minimal EIP-1193 provider shape — we don't want a hard dependency on any
// particular injected-wallet typing here.
export type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

// Live-QA finding: a hand-rolled chain object (just id/name/rpcUrls/
// nativeCurrency/blockExplorers) is NOT enough for genlayer-js@1.1.8 to
// build a real write transaction. writeContract's internal
// `_encodeAddTransactionData` reads `client.chain.defaultNumberOfInitialValidators`
// and `client.chain.defaultConsensusMaxRotations` (both required, uint256
// ABI args) plus `consensusMainContract`/`isStudio` — none of which a
// minimal object provides, so they were `undefined` and viem's ABI encoder
// threw "Cannot convert undefined to a BigInt" on every real submit. Fixed
// by using genlayer-js's own official `chains.studionet` preset (which
// carries all of that) instead of reinventing it, overriding only the
// explorer URL to match this project's documented Studionet explorer.
const genLayerChain = {
  ...chains.studionet,
  blockExplorers: { default: { name: "GenLayer Explorer", url: EXPLORER_URL } },
};

/** Read-only client — no wallet required. Used for every view call. */
export function getReadClient() {
  return createClient({
    chain: genLayerChain,
    endpoint: RPC_URL,
  });
}

/** Wallet-backed client for write transactions, built from an injected EIP-1193 provider. */
export function getWriteClient(provider: Eip1193Provider, account: Address) {
  return createClient({
    chain: genLayerChain,
    endpoint: RPC_URL,
    provider: provider as never,
    account: account as never,
  });
}

/** Structural guard: throws `ConfigurationError` (see config.ts) rather than
 * returning a bad value, so an empty/undefined/malformed address can never
 * reach `writeContract`/`readContract` — this is what makes the
 * `Address "undefined" is invalid` failure mode structurally impossible
 * instead of merely UI-warned-about. */
export function contractAddress(): Address {
  return requireContractAddress() as Address;
}
