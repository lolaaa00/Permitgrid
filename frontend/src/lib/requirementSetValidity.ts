// A committed RequirementSet must never be treated as usable/current just
// because `workOrder.requirement_version > 0` — that only proves a set was
// committed at SOME point, not that it's still the active one. A source
// update bumps `source_version` and flips `status` away from
// REQUIREMENTS_ACTIVE without touching `requirement_version` or deleting
// the old history entry, so a stale set otherwise reads back
// indistinguishably from a current one unless all three conditions below
// are checked together. This is the single source of truth every page that
// renders or depends on a requirement set must use — no page should
// re-derive this check ad hoc.

import type { WorkOrder, RequirementSet } from "./types";

export type RequirementSetStatus =
  | "NONE" // no requirement set has ever been committed for this work order
  | "CURRENT" // committed, active, and matches the work order's current requirement_version and source_version
  | "STALE"; // a set was committed at some point but is no longer current

export function evaluateRequirementSet(
  wo: WorkOrder,
  rs: RequirementSet | null
): RequirementSetStatus {
  if (wo.requirement_version === 0 || !rs) return "NONE";
  const isCurrent =
    wo.status === "REQUIREMENTS_ACTIVE" &&
    rs.version === wo.requirement_version &&
    rs.source_version === wo.source_version;
  return isCurrent ? "CURRENT" : "STALE";
}
