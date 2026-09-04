import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import RequirementSheet from "./RequirementSheet";
import type { AssessmentItem, Requirement } from "@/lib/types";

const requirements: Requirement[] = [
  {
    requirement_id: "REQ-01",
    type: "LICENCE_STATUS",
    mandatory: true,
    target_value: "ACTIVE",
    scope_summary: "",
    verification_target: "",
  },
  {
    requirement_id: "REQ-02",
    type: "SPECIAL_ENDORSEMENT",
    mandatory: false,
    target_value: "HV",
    scope_summary: "",
    verification_target: "",
  },
];

describe("RequirementSheet", () => {
  it("shows an empty state when there are no requirements", () => {
    render(<RequirementSheet requirements={[]} />);
    expect(screen.getByTestId("requirement-sheet-empty")).toBeInTheDocument();
  });

  it("shows a neutral DEFINED state (not PENDING) for the frozen active requirement set with no items prop at all", () => {
    render(<RequirementSheet requirements={requirements} />);
    expect(screen.getByTestId("req-row-REQ-01")).toHaveTextContent("DEFINED");
    expect(screen.getByTestId("req-row-REQ-02")).toHaveTextContent("DEFINED");
    expect(screen.getByTestId("req-row-REQ-02")).toHaveTextContent("(optional)");
  });

  it("shows PENDING for a requirement with no matching item once an assessment (items=[]) is in progress/displayed", () => {
    render(<RequirementSheet requirements={requirements} items={[]} />);
    expect(screen.getByTestId("req-row-REQ-01")).toHaveTextContent("PENDING");
    expect(screen.getByTestId("req-row-REQ-02")).toHaveTextContent("PENDING");
  });

  it("shows the per-requirement assessment result when provided", () => {
    const items: AssessmentItem[] = [
      { requirement_id: "REQ-01", result: "PASS", reason_code: "", evidence_state: "", evidence_reference: "" },
      { requirement_id: "REQ-02", result: "FAIL", reason_code: "", evidence_state: "", evidence_reference: "" },
    ];
    render(<RequirementSheet requirements={requirements} items={items} />);
    expect(screen.getByTestId("req-row-REQ-01")).toHaveTextContent("PASS");
    expect(screen.getByTestId("req-row-REQ-02")).toHaveTextContent("FAIL");
  });
});
