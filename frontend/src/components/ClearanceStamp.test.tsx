import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ClearanceStamp from "./ClearanceStamp";

describe("ClearanceStamp", () => {
  it("opens the assignment gate for CLEARED when the authoritative gate says open", () => {
    render(<ClearanceStamp clearance="CLEARED" gateOpen={true} />);
    expect(screen.getByTestId("assignment-gate")).toHaveTextContent("OPEN");
    expect(screen.getByText("CLEARED FOR ASSIGNMENT")).toBeInTheDocument();
  });

  it("closes the assignment gate for ADDITIONAL_CREDENTIAL_REQUIRED", () => {
    render(<ClearanceStamp clearance="ADDITIONAL_CREDENTIAL_REQUIRED" gateOpen={false} />);
    expect(screen.getByTestId("assignment-gate")).toHaveTextContent("CLOSED");
    expect(screen.getByText("ADDITIONAL CREDENTIAL REQUIRED")).toBeInTheDocument();
  });

  it("closes the assignment gate for STALE and labels it as stale", () => {
    render(<ClearanceStamp clearance="STALE" gateOpen={false} />);
    expect(screen.getByTestId("assignment-gate")).toHaveTextContent("CLOSED");
    expect(screen.getByText("ASSESSMENT STALE")).toBeInTheDocument();
  });

  it("closes the gate and shows the raw code for an unmapped clearance value", () => {
    render(<ClearanceStamp clearance="SOMETHING_UNEXPECTED" gateOpen={false} />);
    expect(screen.getByTestId("assignment-gate")).toHaveTextContent("CLOSED");
    expect(screen.getByText("SOMETHING_UNEXPECTED")).toBeInTheDocument();
  });

  // Regression test for the exact bug this component's `gateOpen` prop
  // fixes: the gate must be driven by the contract's own
  // `is_provider_cleared(...)` result, never re-derived from
  // `clearance === "CLEARED"` alone (which is unaware of source-version
  // staleness the caller may not have accounted for).
  it("shows the gate CLOSED even when clearance is CLEARED, if the authoritative gate says closed", () => {
    render(<ClearanceStamp clearance="CLEARED" gateOpen={false} />);
    expect(screen.getByTestId("assignment-gate")).toHaveTextContent("CLOSED");
    expect(screen.getByTestId("assignment-gate")).toHaveAttribute("data-gate-open", "false");
  });

  it("shows a neutral pending state while the authoritative gate read is in flight (gateOpen=null)", () => {
    render(<ClearanceStamp clearance="CLEARED" gateOpen={null} />);
    expect(screen.getByTestId("assignment-gate")).toHaveTextContent("CHECKING");
    expect(screen.getByTestId("assignment-gate")).not.toHaveTextContent("OPEN");
    expect(screen.getByTestId("assignment-gate")).not.toHaveTextContent("CLOSED");
  });
});
