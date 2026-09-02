import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SourceListEditor from "./SourceListEditor";

describe("SourceListEditor", () => {
  it("calls onChange with a new source when Add is clicked", () => {
    const onChange = vi.fn();
    render(<SourceListEditor sources={[{ url: "", role: "OTHER" }]} roles={["OTHER", "JURISDICTION_RULE"]} onChange={onChange} max={8} />);
    fireEvent.click(screen.getByText(/Add source/));
    expect(onChange).toHaveBeenCalledWith([
      { url: "", role: "OTHER" },
      { url: "", role: "OTHER" },
    ]);
  });

  it("disables Add once the max is reached", () => {
    const onChange = vi.fn();
    render(
      <SourceListEditor
        sources={[{ url: "a", role: "OTHER" }, { url: "b", role: "OTHER" }]}
        roles={["OTHER"]}
        onChange={onChange}
        max={2}
      />
    );
    expect(screen.getByText(/Add source \(2\/2\)/)).toBeDisabled();
  });

  it("removes a source row when Remove is clicked", () => {
    const onChange = vi.fn();
    render(
      <SourceListEditor
        sources={[{ url: "a", role: "OTHER" }, { url: "b", role: "OTHER" }]}
        roles={["OTHER"]}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByLabelText("Remove source 1"));
    expect(onChange).toHaveBeenCalledWith([{ url: "b", role: "OTHER" }]);
  });

  it("updates a source's URL on change", () => {
    const onChange = vi.fn();
    render(<SourceListEditor sources={[{ url: "", role: "OTHER" }]} roles={["OTHER"]} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Source URL 1"), { target: { value: "https://example.gov" } });
    expect(onChange).toHaveBeenCalledWith([{ url: "https://example.gov", role: "OTHER" }]);
  });
});
