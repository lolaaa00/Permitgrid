import { describe, expect, it } from "vitest";
import { resultTone } from "./StatusBadge";

describe("resultTone", () => {
  it("maps PASS and CLEARED to green", () => {
    expect(resultTone("PASS")).toBe("green");
    expect(resultTone("CLEARED")).toBe("green");
  });

  it("maps blocking failures to red", () => {
    expect(resultTone("FAIL")).toBe("red");
    expect(resultTone("EXPIRED_OR_INACTIVE")).toBe("red");
    expect(resultTone("OUT_OF_SCOPE")).toBe("red");
    expect(resultTone("REGULATORY_CONFLICT")).toBe("red");
  });

  it("maps supervisory / gating states to amber", () => {
    expect(resultTone("PARTIAL")).toBe("amber");
    expect(resultTone("INSUFFICIENT_EVIDENCE")).toBe("amber");
    expect(resultTone("SUPERVISION_REQUIRED")).toBe("amber");
    expect(resultTone("ADDITIONAL_CREDENTIAL_REQUIRED")).toBe("amber");
    expect(resultTone("STALE")).toBe("amber");
  });

  it("falls back to neutral for unknown values", () => {
    expect(resultTone("SOMETHING_ELSE")).toBe("neutral");
  });
});
