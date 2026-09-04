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

export const isContractConfigured = () => CONTRACT_ADDRESS.length > 0;
