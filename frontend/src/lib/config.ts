// Runtime configuration for the deployed PermitGrid contract.
// The contract is not yet deployed to a live network — until
// NEXT_PUBLIC_CONTRACT_ADDRESS is set, every page must show a clear
// "not configured" state rather than pretending calls will work.

export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "").trim();

export const RPC_URL =
  (process.env.NEXT_PUBLIC_RPC_URL || "").trim() || "https://studio.genlayer.com/api";

export const CHAIN_ID = 61999;
// Derived programmatically from CHAIN_ID so the decimal and hex forms can
// never drift apart again (a hardcoded "0xf20f" here was wrong — that is
// decimal 61967, not 61999 — and caused Rabby/MetaMask network-switch
// requests to target the wrong chain).
export const CHAIN_ID_HEX = `0x${CHAIN_ID.toString(16)}`; // "0xf22f"

export const CHAIN_NAME = "GenLayer Studio";
export const CHAIN_CURRENCY = {
  name: "GenLayer",
  symbol: "GEN",
  decimals: 18,
};
export const EXPLORER_URL = "https://explorer-studio.genlayer.com";

// A real 20-byte EVM/GenLayer hex address: 0x + 40 hex chars. Checking only
// `.length > 0` (the prior behavior) let a truthy-but-malformed value (or a
// literal "undefined"/"null" string from a misconfigured build) reach the
// GenLayer write path, which is how production hit
// `Address "undefined" is invalid` deep inside a wallet write instead of
// failing early with a clear message. This is the single source of truth
// for "is the contract address usable" — every write path must go through
// `requireContractAddress()` below rather than reading `CONTRACT_ADDRESS`
// directly, so a bad value cannot structurally reach `writeContract`.
const HEX_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export const isValidContractAddress = (value: string): boolean => HEX_ADDRESS_RE.test(value);

export const isContractConfigured = () => isValidContractAddress(CONTRACT_ADDRESS);

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

/** Returns the contract address only if it is a genuinely valid 20-byte hex
 * address; otherwise throws `ConfigurationError`. Every write and read path
 * that needs the contract address MUST call this instead of reading
 * `CONTRACT_ADDRESS` directly — it is the structural guard that makes it
 * impossible for an empty/undefined/malformed address to reach the
 * GenLayer client's `writeContract`/`readContract` calls. */
export function requireContractAddress(): string {
  if (!isValidContractAddress(CONTRACT_ADDRESS)) {
    throw new ConfigurationError(
      CONTRACT_ADDRESS
        ? `Configured contract address "${CONTRACT_ADDRESS}" is not a valid 20-byte hex address.`
        : "No contract address is configured (NEXT_PUBLIC_CONTRACT_ADDRESS is unset). Writes and reads are disabled until this is fixed."
    );
  }
  return CONTRACT_ADDRESS;
}
