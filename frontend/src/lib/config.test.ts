import { describe, it, expect } from "vitest";
import { isValidContractAddress } from "./config";

// Regression coverage for the production bug where an empty/undefined
// NEXT_PUBLIC_CONTRACT_ADDRESS reached the GenLayer write path and threw
// `Address "undefined" is invalid` deep inside a wallet write instead of
// failing early with a clear CONFIGURATION_ERROR. isValidContractAddress
// is the pure function backing both isContractConfigured() (UI guard) and
// requireContractAddress() (structural guard in genlayerClient.ts) — this
// file tests it directly since it has no framework/env dependency.
describe("isValidContractAddress", () => {
  it("accepts a real 20-byte hex address", () => {
    expect(isValidContractAddress("0xD6cF90D8A4F7323B12EA4398A6AbDF415A4E9500")).toBe(true);
  });

  it("rejects an empty string (unset env var)", () => {
    expect(isValidContractAddress("")).toBe(false);
  });

  it('rejects the literal string "undefined"', () => {
    expect(isValidContractAddress("undefined")).toBe(false);
  });

  it('rejects the literal string "null"', () => {
    expect(isValidContractAddress("null")).toBe(false);
  });

  it("rejects a too-short hex value", () => {
    expect(isValidContractAddress("0x1234")).toBe(false);
  });

  it("rejects a value missing the 0x prefix", () => {
    expect(isValidContractAddress("D6cF90D8A4F7323B12EA4398A6AbDF415A4E9500")).toBe(false);
  });

  it("rejects a value with non-hex characters", () => {
    expect(isValidContractAddress("0xZZcF90D8A4F7323B12EA4398A6AbDF415A4E9500")).toBe(false);
  });
});
