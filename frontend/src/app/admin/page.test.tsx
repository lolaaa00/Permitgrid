import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import type { WalletStatus } from "@/lib/wallet";

vi.mock("@/lib/config", () => ({
  isContractConfigured: () => true,
}));

const getPendingAdmin = vi.fn();
const proposeAdmin = vi.fn();
const acceptAdmin = vi.fn();

vi.mock("@/lib/contract", () => ({
  contractReads: {
    getPendingAdmin: (...args: unknown[]) => getPendingAdmin(...args),
  },
  contractWrites: {
    proposeAdmin: (...args: unknown[]) => proposeAdmin(...args),
    acceptAdmin: (...args: unknown[]) => acceptAdmin(...args),
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
const { default: AdminPage } = await import("./page");

// 20-byte (40 hex char) addresses — deliberately generated, not hand-typed,
// to avoid an off-by-one in the zero-padding.
const ADDR_AA = "0x00000000000000000000000000000000000000aa";
const ADDR_BBB = "0x0000000000000000000000000000000000000bbb";
const ADDR_ABC = "0x0000000000000000000000000000000000000AbC";

describe("AdminPage", () => {
  beforeEach(() => {
    getPendingAdmin.mockReset();
    proposeAdmin.mockReset();
    acceptAdmin.mockReset();
    getPendingAdmin.mockResolvedValue("");
    mockWallet.status = "disconnected";
    mockWallet.address = null;
    mockWallet.writeClient = null;
  });

  it("shows a connect-wallet prompt when disconnected", async () => {
    render(<AdminPage />);
    await waitFor(() => expect(getPendingAdmin).toHaveBeenCalled());
    expect(screen.getByText(/connect a wallet/i)).toBeInTheDocument();
  });

  it("shows no-pending-rotation state when get_pending_admin returns empty", async () => {
    getPendingAdmin.mockResolvedValue("");
    render(<AdminPage />);
    await waitFor(() =>
      expect(screen.getByTestId("pending-admin-status")).toHaveTextContent(
        "No admin rotation is currently pending."
      )
    );
    expect(screen.queryByTestId("accept-admin-button")).not.toBeInTheDocument();
  });

  it("shows the pending admin address and an accept button when a rotation is pending", async () => {
    getPendingAdmin.mockResolvedValue(ADDR_ABC);
    render(<AdminPage />);
    await waitFor(() =>
      expect(screen.getByTestId("pending-admin-status")).toHaveTextContent(ADDR_ABC)
    );
    expect(screen.getByTestId("accept-admin-button")).toBeInTheDocument();
  });

  it("shows a retry control when reading pending-admin state fails", async () => {
    getPendingAdmin.mockRejectedValue(new Error("RPC unreachable"));
    render(<AdminPage />);
    await waitFor(() => expect(screen.getByTestId("pending-admin-error")).toBeInTheDocument());
    expect(screen.getByTestId("pending-admin-error")).toHaveTextContent("RPC unreachable");
  });

  it("disables propose submit until a well-formed address is entered and a wallet is connected", async () => {
    mockWallet.status = "connected";
    mockWallet.address = ADDR_AA;
    mockWallet.writeClient = {};
    render(<AdminPage />);
    await waitFor(() => expect(getPendingAdmin).toHaveBeenCalled());

    const submit = screen.getByRole("button", { name: /propose new admin/i });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByTestId("input-new-admin"), {
      target: { value: "not-an-address" },
    });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByTestId("input-new-admin"), {
      target: { value: ADDR_BBB },
    });
    expect(submit).not.toBeDisabled();
  });

  it("calls contractWrites.proposeAdmin with the trimmed address on submit", async () => {
    mockWallet.status = "connected";
    mockWallet.address = ADDR_AA;
    mockWallet.writeClient = {};
    proposeAdmin.mockResolvedValue(ADDR_BBB);
    render(<AdminPage />);
    await waitFor(() => expect(getPendingAdmin).toHaveBeenCalled());

    fireEvent.change(screen.getByTestId("input-new-admin"), {
      target: { value: `  ${ADDR_BBB}  ` },
    });
    fireEvent.click(screen.getByRole("button", { name: /propose new admin/i }));

    await waitFor(() =>
      expect(proposeAdmin).toHaveBeenCalledWith({}, ADDR_AA, ADDR_BBB, expect.any(Function))
    );
  });

  it("calls contractWrites.acceptAdmin when the accept button is clicked", async () => {
    mockWallet.status = "connected";
    mockWallet.address = ADDR_BBB;
    mockWallet.writeClient = {};
    getPendingAdmin.mockResolvedValue(ADDR_BBB);
    acceptAdmin.mockResolvedValue("");
    render(<AdminPage />);

    const acceptButton = await screen.findByTestId("accept-admin-button");
    fireEvent.click(acceptButton);

    await waitFor(() =>
      expect(acceptAdmin).toHaveBeenCalledWith({}, ADDR_BBB, expect.any(Function))
    );
  });
});
