import { createClient } from "genlayer-js";
import type { Address } from "genlayer-js/types";
import { CHAIN_ID, CHAIN_NAME, CHAIN_CURRENCY, RPC_URL, EXPLORER_URL, requireContractAddress } from "./config";

// A minimal EIP-1193 provider shape — we don't want a hard dependency on any
// particular injected-wallet typing here.
export type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

const genLayerChain = {
  id: CHAIN_ID,
  name: CHAIN_NAME,
  rpcUrls: { default: { http: [RPC_URL] } },
  nativeCurrency: CHAIN_CURRENCY,
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
