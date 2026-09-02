import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ClearanceStamp from "./ClearanceStamp";

describe("ClearanceStamp", () => {
  it("opens the assignment gate only for CLEARED", () => {
    render(<ClearanceStamp clearance="CLEARED" />);
    expect(screen.getByTestId("assignment-gate")).toHaveTextContent("OPEN");
    expect(screen.getByText("CLEARED FOR ASSIGNMENT")).toBeInTheDocument();
  });

  it("closes the assignment gate for ADDITIONAL_CREDENTIAL_REQUIRED", () => {
    render(<ClearanceStamp clearance="ADDITIONAL_CREDENTIAL_REQUIRED" />);
    expect(screen.getByTestId("assignment-gate")).toHaveTextContent("CLOSED");
    expect(screen.getByText("ADDITIONAL CREDENTIAL REQUIRED")).toBeInTheDocument();
  });

  it("closes the assignment gate for STALE and labels it as stale", () => {
    render(<ClearanceStamp clearance="STALE" />);
    expect(screen.getByTestId("assignment-gate")).toHaveTextContent("CLOSED");
    expect(screen.getByText("ASSESSMENT STALE")).toBeInTheDocument();
  });

  it("closes the gate and shows the raw code for an unmapped clearance value", () => {
    render(<ClearanceStamp clearance="SOMETHING_UNEXPECTED" />);
    expect(screen.getByTestId("assignment-gate")).toHaveTextContent("CLOSED");
    expect(screen.getByText("SOMETHING_UNEXPECTED")).toBeInTheDocument();
  });
});
