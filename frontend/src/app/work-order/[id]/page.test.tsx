import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import type { WorkOrder, RequirementSet } from "@/lib/types";
import type { WalletStatus } from "@/lib/wallet";

vi.mock("@/lib/config", () => ({
  isContractConfigured: () => true,
}));

const getWorkOrder = vi.fn();
const getRequirementSet = vi.fn();
const extractRequirements = vi.fn();

vi.mock("@/lib/contract", () => ({
  contractReads: {
    getWorkOrder: (...args: unknown[]) => getWorkOrder(...args),
    getRequirementSet: (...args: unknown[]) => getRequirementSet(...args),
  },
  contractWrites: {
    extractRequirements: (...args: unknown[]) => extractRequirements(...args),
  },
}));

const mockWallet: { status: WalletStatus; address: string | null; writeClient: unknown; readClient: unknown } = {
  status: "disconnected",
  address: null,
  writeClient: null,
  readClient: {},
};

vi.mock("@/lib/wallet", () => ({
  useWallet: () => mockWallet,
}));

// Imported after the mocks above are registered.
const { WorkOrderDetailView } = await import("./page");

function makeWorkOrder(overrides: Partial<WorkOrder> = {}): WorkOrder {
  return {
    work_order_id: "wo-1",
    ref: "PG-0001",
    title: "Test work",
    category: "cat",
    jurisdiction: "jur",
    exact_scope: "scope",
    environment: "env",
    role: "contractor",
    creator: "0xabc",
    status: "REQUIREMENTS_ACTIVE",
    source_version: 1,
    requirement_version: 1,
    created_at: "",
    sources: [{ url: "https://example.gov/rules", role: "LICENSING_AUTHORITY" }],
    ...overrides,
  };
}

function makeRequirementSet(overrides: Partial<RequirementSet> = {}): RequirementSet {
  return {
    version: 1,
    source_version: 1,
    created_at: "",
    requirements: [
      {
        requirement_id: "REQ-01",
        type: "LICENCE_CLASS",
        mandatory: true,
        target_value: "C-10",
        scope_summary: "",
        verification_target: "",
      },
    ],
    ...overrides,
  };
}

function renderPage(id = "wo-1") {
  return render(<WorkOrderDetailView id={id} />);
}

describe("WorkOrderDetailPage — requirement-set validity", () => {
  beforeEach(() => {
    getWorkOrder.mockReset();
    getRequirementSet.mockReset();
    extractRequirements.mockReset();
    mockWallet.status = "disconnected";
    mockWallet.address = null;
    mockWallet.writeClient = null;
  });

  it("shows the no-requirements state when requirement_version is 0", async () => {
    getWorkOrder.mockResolvedValue(makeWorkOrder({ requirement_version: 0 }));
    renderPage();
    await waitFor(() => expect(screen.getByTestId("requirement-set-none")).toBeInTheDocument());
    expect(getRequirementSet).not.toHaveBeenCalled();
    expect(screen.getByTestId("assessment-unavailable")).toBeInTheDocument();
  });

  it("renders valid, current active requirements", async () => {
    getWorkOrder.mockResolvedValue(makeWorkOrder());
    getRequirementSet.mockResolvedValue(makeRequirementSet());
    renderPage();
    await waitFor(() => expect(screen.getByTestId("requirement-sheet")).toBeInTheDocument());
    expect(screen.getByTestId("req-row-REQ-01")).toBeInTheDocument();
    expect(screen.queryByTestId("requirement-set-stale")).not.toBeInTheDocument();
    // A current set makes the downstream assessment link available.
    expect(screen.queryByTestId("assessment-unavailable")).not.toBeInTheDocument();
  });

  it("clears requirements on a source_version mismatch (the exact bug this fixes)", async () => {
    getWorkOrder.mockResolvedValue(makeWorkOrder({ source_version: 2 }));
    getRequirementSet.mockResolvedValue(makeRequirementSet({ source_version: 1 }));
    renderPage();
    await waitFor(() => expect(screen.getByTestId("requirement-set-stale")).toBeInTheDocument());
    expect(screen.queryByTestId("req-row-REQ-01")).not.toBeInTheDocument();
    expect(screen.queryByTestId("requirement-sheet")).not.toBeInTheDocument();
    expect(screen.getByTestId("assessment-unavailable")).toBeInTheDocument();
  });

  it("clears requirements when work order status is not REQUIREMENTS_ACTIVE", async () => {
    getWorkOrder.mockResolvedValue(makeWorkOrder({ status: "NEEDS_REQUIREMENTS" }));
    getRequirementSet.mockResolvedValue(makeRequirementSet());
    renderPage();
    await waitFor(() => expect(screen.getByTestId("requirement-set-stale")).toBeInTheDocument());
    expect(screen.queryByTestId("req-row-REQ-01")).not.toBeInTheDocument();
  });

  it("clears requirements on a requirement_version mismatch", async () => {
    getWorkOrder.mockResolvedValue(makeWorkOrder({ requirement_version: 2 }));
    getRequirementSet.mockResolvedValue(makeRequirementSet({ version: 1 }));
    renderPage();
    await waitFor(() => expect(screen.getByTestId("requirement-set-stale")).toBeInTheDocument());
    expect(screen.queryByTestId("req-row-REQ-01")).not.toBeInTheDocument();
  });

  it("shows retryable read-failure messaging distinct from the no-requirements state", async () => {
    getWorkOrder.mockResolvedValue(makeWorkOrder());
    getRequirementSet.mockRejectedValue(new Error("Studionet RPC is unreachable right now."));
    renderPage();
    await waitFor(() => expect(screen.getByTestId("requirement-read-error")).toBeInTheDocument());
    expect(screen.queryByTestId("requirement-set-none")).not.toBeInTheDocument();
    expect(screen.queryByTestId("requirement-set-stale")).not.toBeInTheDocument();
  });

  it("does not offer the downstream assessment link when no current requirement set exists", async () => {
    getWorkOrder.mockResolvedValue(makeWorkOrder({ status: "NEEDS_REQUIREMENTS" }));
    getRequirementSet.mockResolvedValue(makeRequirementSet());
    renderPage();
    await waitFor(() => expect(screen.getByTestId("assessment-unavailable")).toBeInTheDocument());
    expect(screen.queryByText(/Run a provider clearance assessment/i)).not.toBeInTheDocument();
  });

  it("renders requirements that come back in a different order from the API normally", async () => {
    getWorkOrder.mockResolvedValue(makeWorkOrder());
    getRequirementSet.mockResolvedValue(
      makeRequirementSet({
        requirements: [
          {
            requirement_id: "REQ-02",
            type: "LICENCE_STATUS",
            mandatory: true,
            target_value: "Active",
            scope_summary: "",
            verification_target: "",
          },
          {
            requirement_id: "REQ-01",
            type: "LICENCE_CLASS",
            mandatory: true,
            target_value: "C-10",
            scope_summary: "",
            verification_target: "",
          },
        ],
      })
    );
    renderPage();
    await waitFor(() => expect(screen.getByTestId("requirement-sheet")).toBeInTheDocument());
    expect(screen.getByTestId("req-row-REQ-01")).toBeInTheDocument();
    expect(screen.getByTestId("req-row-REQ-02")).toBeInTheDocument();
  });

  it("on extraction failure, reloads canonical state rather than showing a partial set", async () => {
    mockWallet.status = "connected";
    mockWallet.address = "0xabc";
    mockWallet.writeClient = {};
    getWorkOrder
      .mockResolvedValueOnce(makeWorkOrder({ requirement_version: 0 }))
      .mockResolvedValueOnce(makeWorkOrder({ requirement_version: 0 }));
    extractRequirements.mockRejectedValue(new Error("CONSENSUS_NON_CONVERGENCE"));
    renderPage();
    await waitFor(() => expect(screen.getByTestId("requirement-set-none")).toBeInTheDocument());
    const button = screen.getByRole("button", { name: /extract \/ rebuild requirements/i });
    fireEvent.click(button);
    await waitFor(() => expect(extractRequirements).toHaveBeenCalled());
    await waitFor(() => expect(getWorkOrder).toHaveBeenCalledTimes(2));
    // Still shows the honest "none" state — never a partial/disputed set.
    expect(screen.getByTestId("requirement-set-none")).toBeInTheDocument();
  });
});
