import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { WorkOrder, Provider, RequirementSet, ClearanceAssessment } from "@/lib/types";
import { NotFoundError } from "@/lib/readClient";

vi.mock("@/lib/config", () => ({
  isContractConfigured: () => true,
}));

const getWorkOrder = vi.fn();
const getProvider = vi.fn();
const getRequirementSet = vi.fn();
const getClearanceAssessment = vi.fn();
const isProviderCleared = vi.fn();
const updateCredentials = vi.fn();

vi.mock("@/lib/contract", () => ({
  contractReads: {
    getWorkOrder: (...args: unknown[]) => getWorkOrder(...args),
    getProvider: (...args: unknown[]) => getProvider(...args),
    getRequirementSet: (...args: unknown[]) => getRequirementSet(...args),
    getClearanceAssessment: (...args: unknown[]) => getClearanceAssessment(...args),
    isProviderCleared: (...args: unknown[]) => isProviderCleared(...args),
  },
  contractWrites: {
    updateCredentials: (...args: unknown[]) => updateCredentials(...args),
  },
}));

vi.mock("@/lib/wallet", () => ({
  useWallet: () => ({
    status: "disconnected",
    address: null,
    writeClient: null,
    readClient: {},
  }),
}));

const { ProviderWorkDetailView } = await import("./view");

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
    sources: [],
    ...overrides,
  };
}

function makeProvider(overrides: Partial<Provider> = {}): Provider {
  return {
    provider_id: "prv-1",
    name: "Test Electric Co",
    creator: "0xabc",
    credential_version: 1,
    created_at: "",
    credential_sources: [{ url: "https://cred.example.gov/lookup", role: "LICENCE_REGISTRY" }],
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

function makeAssessment(overrides: Partial<ClearanceAssessment> = {}): ClearanceAssessment {
  return {
    assessment_id: 1,
    work_order_id: "wo-1",
    provider_id: "prv-1",
    requirement_version: 1,
    source_version: 1,
    credential_version: 1,
    clearance: "CLEARED",
    created_at: "",
    items: [{ requirement_id: "REQ-01", result: "PASS", reason_code: "", evidence_state: "SUFFICIENT", evidence_reference: "" }],
    ...overrides,
  };
}

function renderPage() {
  return render(<ProviderWorkDetailView providerId="prv-1" workId="wo-1" />);
}

describe("ProviderWorkDetailView — requirement-set validity and fail-closed gate", () => {
  beforeEach(() => {
    getWorkOrder.mockReset();
    getProvider.mockReset();
    getRequirementSet.mockReset();
    getClearanceAssessment.mockReset();
    isProviderCleared.mockReset();
    updateCredentials.mockReset();
    getProvider.mockResolvedValue(makeProvider());
    isProviderCleared.mockResolvedValue(false);
  });

  it("shows no-current-set state when no assessment exists and requirement_version is 0", async () => {
    getWorkOrder.mockResolvedValue(makeWorkOrder({ requirement_version: 0 }));
    getClearanceAssessment.mockRejectedValue(new NotFoundError());
    renderPage();
    await waitFor(() => expect(screen.getByTestId("requirement-set-none")).toBeInTheDocument());
    expect(getRequirementSet).not.toHaveBeenCalled();
  });

  it("shows the assessment result when the requirement set is current", async () => {
    getWorkOrder.mockResolvedValue(makeWorkOrder());
    getRequirementSet.mockResolvedValue(makeRequirementSet());
    getClearanceAssessment.mockResolvedValue(makeAssessment());
    isProviderCleared.mockResolvedValue(true);
    renderPage();
    await waitFor(() => expect(screen.getByTestId("clearance-stamp")).toBeInTheDocument());
    expect(screen.queryByTestId("stale-banner")).not.toBeInTheDocument();
    expect(screen.getByTestId("assignment-gate")).toHaveTextContent("OPEN");
  });

  it("fails closed (gate CLOSED, marked stale) when the requirement set is no longer current, even if the stored assessment clearance says CLEARED", async () => {
    // source_version mismatch: the work order's regulatory sources changed
    // after this assessment was computed.
    getWorkOrder.mockResolvedValue(makeWorkOrder({ source_version: 2 }));
    getRequirementSet.mockResolvedValue(makeRequirementSet({ source_version: 1 }));
    getClearanceAssessment.mockResolvedValue(makeAssessment({ clearance: "CLEARED", source_version: 1 }));
    isProviderCleared.mockResolvedValue(true); // even if the raw gate call said true
    renderPage();
    await waitFor(() => expect(screen.getByTestId("stale-banner")).toBeInTheDocument());
    expect(screen.getByTestId("clearance-stamp")).toHaveAttribute("data-clearance", "STALE");
    // The displayed gate must be forced CLOSED once staleness is detected,
    // regardless of what the raw is_provider_cleared() call returned.
    expect(screen.getByTestId("assignment-gate")).toHaveTextContent("CLOSED");
  });

  it("distinguishes a retryable requirement-set read failure from a legitimate empty/no-assessment state", async () => {
    getWorkOrder.mockResolvedValue(makeWorkOrder());
    getRequirementSet.mockRejectedValue(new Error("Studionet RPC is unreachable right now."));
    getClearanceAssessment.mockRejectedValue(new NotFoundError());
    renderPage();
    await waitFor(() => expect(screen.getByTestId("requirement-read-error")).toBeInTheDocument());
  });

  it("does not offer to run an assessment when no current requirement set exists", async () => {
    getWorkOrder.mockResolvedValue(makeWorkOrder({ status: "NEEDS_REQUIREMENTS" }));
    getRequirementSet.mockResolvedValue(makeRequirementSet());
    getClearanceAssessment.mockRejectedValue(new NotFoundError());
    renderPage();
    await waitFor(() => expect(screen.getByTestId("assessment-unavailable")).toBeInTheDocument());
    expect(screen.queryByText(/Run one/i)).not.toBeInTheDocument();
  });
});
