import { describe, expect, it } from "vitest";
import { evaluateRequirementSet } from "./requirementSetValidity";
import type { WorkOrder, RequirementSet } from "./types";

function makeWorkOrder(overrides: Partial<WorkOrder> = {}): WorkOrder {
  return {
    work_order_id: "wo-1",
    ref: "PG-0001",
    title: "t",
    category: "c",
    jurisdiction: "j",
    exact_scope: "s",
    environment: "e",
    role: "r",
    creator: "0xabc",
    status: "REQUIREMENTS_ACTIVE",
    source_version: 1,
    requirement_version: 1,
    created_at: "",
    sources: [],
    ...overrides,
  };
}

function makeRequirementSet(overrides: Partial<RequirementSet> = {}): RequirementSet {
  return {
    version: 1,
    source_version: 1,
    created_at: "",
    requirements: [],
    ...overrides,
  };
}

describe("evaluateRequirementSet", () => {
  it("is NONE when the work order has never had a requirement set", () => {
    const wo = makeWorkOrder({ requirement_version: 0 });
    expect(evaluateRequirementSet(wo, null)).toBe("NONE");
  });

  it("is NONE when requirement_version > 0 but no set was actually read back", () => {
    const wo = makeWorkOrder({ requirement_version: 1 });
    expect(evaluateRequirementSet(wo, null)).toBe("NONE");
  });

  it("is CURRENT when status/version/source_version all match", () => {
    const wo = makeWorkOrder({ status: "REQUIREMENTS_ACTIVE", requirement_version: 3, source_version: 2 });
    const rs = makeRequirementSet({ version: 3, source_version: 2 });
    expect(evaluateRequirementSet(wo, rs)).toBe("CURRENT");
  });

  it("is STALE when the work order status is not REQUIREMENTS_ACTIVE, even if versions match", () => {
    const wo = makeWorkOrder({ status: "NEEDS_REQUIREMENTS", requirement_version: 1, source_version: 1 });
    const rs = makeRequirementSet({ version: 1, source_version: 1 });
    expect(evaluateRequirementSet(wo, rs)).toBe("STALE");
  });

  it("is STALE on a requirement_version mismatch", () => {
    const wo = makeWorkOrder({ requirement_version: 2, source_version: 1 });
    const rs = makeRequirementSet({ version: 1, source_version: 1 });
    expect(evaluateRequirementSet(wo, rs)).toBe("STALE");
  });

  it("is STALE on a source_version mismatch — this is the exact regression this module fixes: a source update bumps source_version and flips status away from REQUIREMENTS_ACTIVE without touching requirement_version, so this check alone would previously have been missed entirely", () => {
    const wo = makeWorkOrder({ status: "NEEDS_REQUIREMENTS", requirement_version: 1, source_version: 2 });
    const rs = makeRequirementSet({ version: 1, source_version: 1 });
    expect(evaluateRequirementSet(wo, rs)).toBe("STALE");
  });
});
