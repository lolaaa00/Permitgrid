// Runtime configuration for the deployed PermitGrid contract.
// The contract is not yet deployed to a live network — until
// NEXT_PUBLIC_CONTRACT_ADDRESS is set, every page must show a clear
// "not configured" state rather than pretending calls will work.

export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "").trim();

export const RPC_URL =
  (process.env.NEXT_PUBLIC_RPC_URL || "").trim() || "https://studio.genlayer.com/api";

export const CHAIN_ID = 61999;
export const CHAIN_ID_HEX = "0xf20f"; // 61999 in hex

export const CHAIN_NAME = "GenLayer Studio";
export const CHAIN_CURRENCY = {
  name: "GenLayer",
  symbol: "GEN",
  decimals: 18,
};
export const EXPLORER_URL = "https://explorer-studio.genlayer.com";

export const isContractConfigured = () => CONTRACT_ADDRESS.length > 0;
