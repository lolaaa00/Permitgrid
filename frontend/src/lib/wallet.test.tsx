import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { WalletProvider, useWallet } from "./wallet";
import { CHAIN_ID_HEX } from "./config";

// A mock EIP-1193 provider shaped like Rabby's/MetaMask's real injected
// object (request/on/removeListener), used to test the wallet lifecycle
// without a real browser extension. This is an HONEST SIMULATION, not a
// live Rabby test — no real Rabby extension is available in this
// environment. See HANDOFF.md for what was/wasn't live-tested.
function makeMockProvider(opts: {
  accounts?: string[];
  chainIdHex?: string;
  onSwitchChain?: (chainId: string) => void | never;
  rejectSwitch?: boolean;
  needsAddChain?: boolean;
}) {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  let accounts = opts.accounts ?? [];
  let chainIdHex = opts.chainIdHex ?? "0x1"; // wrong chain by default

  const provider = {
    isRabby: true,
    request: vi.fn(async ({ method, params }: { method: string; params?: unknown[] }) => {
      switch (method) {
        case "eth_accounts":
          return accounts;
        case "eth_requestAccounts":
          return accounts;
        case "eth_chainId":
          return chainIdHex;
        case "wallet_switchEthereumChain": {
          if (opts.rejectSwitch) {
            const err: { message: string; code?: number } = { message: "User rejected the request." };
            throw err;
          }
          if (opts.needsAddChain) {
            const err: { message: string; code?: number } = { message: "Unrecognized chain", code: 4902 };
            throw err;
          }
          const target = (params?.[0] as { chainId: string }).chainId;
          chainIdHex = target;
          opts.onSwitchChain?.(target);
          listeners.get("chainChanged")?.forEach((fn) => fn(target));
          return null;
        }
        case "wallet_addEthereumChain": {
          const target = (params?.[0] as { chainId: string }).chainId;
          chainIdHex = target;
          listeners.get("chainChanged")?.forEach((fn) => fn(target));
          return null;
        }
        default:
          return null;
      }
    }),
    on: (event: string, handler: (...args: unknown[]) => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
    },
    removeListener: (event: string, handler: (...args: unknown[]) => void) => {
      listeners.get(event)?.delete(handler);
    },
    __emitAccountsChanged: (next: string[]) => {
      accounts = next;
      listeners.get("accountsChanged")?.forEach((fn) => fn(next));
    },
    __setChainId: (hex: string) => {
      chainIdHex = hex;
    },
    __emitChainChanged: (hex: string) => {
      chainIdHex = hex;
      listeners.get("chainChanged")?.forEach((fn) => fn(hex));
    },
  };
  return provider;
}

function Probe() {
  const { status, address, chainId, error, connect, switchChain } = useWallet();
  return (
    <div>
      <div data-testid="status">{status}</div>
      <div data-testid="address">{address ?? "none"}</div>
      <div data-testid="chainId">{chainId ?? "none"}</div>
      <div data-testid="error">{error ?? "none"}</div>
      <button onClick={() => void connect()}>connect</button>
      <button onClick={() => void switchChain()}>switch</button>
    </div>
  );
}

function setEthereum(value: unknown) {
  (window as unknown as { ethereum?: unknown }).ethereum = value;
}

function setOkxWallet(value: unknown) {
  (window as unknown as { okxwallet?: unknown }).okxwallet = value;
}

describe("wallet.tsx", () => {
  beforeEach(() => {
    setEthereum(undefined);
  });
  afterEach(() => {
    setEthereum(undefined);
    setOkxWallet(undefined);
    vi.useRealTimers();
  });

  it("CHAIN_ID_HEX is the correct Studionet hex (0xf22f for chain 61999), not the previously-wrong 0xf20f", () => {
    expect(CHAIN_ID_HEX).toBe("0xf22f");
    expect(parseInt(CHAIN_ID_HEX, 16)).toBe(61999);
  });

  it("reports no-provider when window.ethereum is absent, and recovers once it appears (late injection)", async () => {
    render(
      <WalletProvider>
        <Probe />
      </WalletProvider>
    );
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("no-provider"));

    const provider = makeMockProvider({ accounts: [], chainIdHex: "0x1" });
    act(() => {
      setEthereum(provider);
    });

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("disconnected"), {
      timeout: 3000,
    });
  }, 10000);

  it("recovers a previously-authorized account on reload via eth_accounts without prompting", async () => {
    const provider = makeMockProvider({ accounts: ["0xUser1"], chainIdHex: "0x1" });
    setEthereum(provider);
    render(
      <WalletProvider>
        <Probe />
      </WalletProvider>
    );
    await waitFor(() => expect(screen.getByTestId("address").textContent).toBe("0xUser1"));
    expect(screen.getByTestId("status").textContent).toBe("wrong-chain");
    // eth_requestAccounts (which would prompt the user) must not have been called.
    expect(provider.request).not.toHaveBeenCalledWith(
      expect.objectContaining({ method: "eth_requestAccounts" })
    );
  });

  it("wrong-chain -> switchChain sends the real 0xf22f target and updates to connected without reload", async () => {
    const provider = makeMockProvider({ accounts: ["0xUser1"], chainIdHex: "0x1" });
    setEthereum(provider);
    render(
      <WalletProvider>
        <Probe />
      </WalletProvider>
    );
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("wrong-chain"));

    act(() => screen.getByText("switch").click());

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("connected"));
    expect(provider.request).toHaveBeenCalledWith({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0xf22f" }],
    });
  });

  it("switch rejection surfaces a clear error and does not throw unhandled", async () => {
    const provider = makeMockProvider({ accounts: ["0xUser1"], chainIdHex: "0x1", rejectSwitch: true });
    setEthereum(provider);
    render(
      <WalletProvider>
        <Probe />
      </WalletProvider>
    );
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("wrong-chain"));

    act(() => screen.getByText("switch").click());

    await waitFor(() => expect(screen.getByTestId("error").textContent).toMatch(/rejected/i));
  });

  it("4902 (unrecognized chain) triggers wallet_addEthereumChain and then connects", async () => {
    const provider = makeMockProvider({ accounts: ["0xUser1"], chainIdHex: "0x1", needsAddChain: true });
    setEthereum(provider);
    render(
      <WalletProvider>
        <Probe />
      </WalletProvider>
    );
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("wrong-chain"));

    act(() => screen.getByText("switch").click());

    await waitFor(() =>
      expect(provider.request).toHaveBeenCalledWith(
        expect.objectContaining({ method: "wallet_addEthereumChain" })
      )
    );
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("connected"));
  });

  it("REGRESSION: chainChanged uses the CURRENT account, not one captured when the listener was first registered", async () => {
    // This is the exact bug described in the task: the chainChanged handler
    // must not close over a stale `address` from initial effect setup.
    const provider = makeMockProvider({ accounts: ["0xUser1"], chainIdHex: "0xf22f" });
    setEthereum(provider);
    render(
      <WalletProvider>
        <Probe />
      </WalletProvider>
    );
    await waitFor(() => expect(screen.getByTestId("address").textContent).toBe("0xUser1"));
    expect(screen.getByTestId("status").textContent).toBe("connected");

    // Account changes (e.g. user switches account in the wallet UI) —
    // address must update.
    act(() => provider.__emitAccountsChanged(["0xUser2"]));
    await waitFor(() => expect(screen.getByTestId("address").textContent).toBe("0xUser2"));

    // Now a chain change arrives. The stale-closure bug would have
    // re-fetched state for 0xUser1 (or done nothing useful); it must
    // reflect 0xUser2's real current chain.
    act(() => provider.__emitChainChanged("0x1"));
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("wrong-chain"));
    expect(screen.getByTestId("address").textContent).toBe("0xUser2");
  });

  it("accountsChanged to empty disconnects cleanly", async () => {
    const provider = makeMockProvider({ accounts: ["0xUser1"], chainIdHex: "0xf22f" });
    setEthereum(provider);
    render(
      <WalletProvider>
        <Probe />
      </WalletProvider>
    );
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("connected"));

    act(() => provider.__emitAccountsChanged([]));
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("disconnected"));
    expect(screen.getByTestId("address").textContent).toBe("none");
  });

  it("connect() rejection is handled, not an unhandled promise rejection", async () => {
    const provider = makeMockProvider({ accounts: [], chainIdHex: "0x1" });
    provider.request.mockImplementation(async ({ method }: { method: string }) => {
      if (method === "eth_requestAccounts") {
        const err: { message: string } = { message: "User rejected the request." };
        throw err;
      }
      if (method === "eth_accounts") return [];
      if (method === "eth_chainId") return "0x1";
      return null;
    });
    setEthereum(provider);
    render(
      <WalletProvider>
        <Probe />
      </WalletProvider>
    );
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("disconnected"));

    act(() => screen.getByText("connect").click());

    await waitFor(() => expect(screen.getByTestId("error").textContent).toMatch(/rejected/i));
    expect(screen.getByTestId("status").textContent).toBe("disconnected");
  });

  it("prefers a Rabby-flagged provider when window.ethereum.providers holds multiple injected wallets", async () => {
    const rabby = makeMockProvider({ accounts: ["0xRabby"], chainIdHex: "0xf22f" });
    const metamask = makeMockProvider({ accounts: ["0xMetaMask"], chainIdHex: "0xf22f" });
    (metamask as unknown as { isRabby: boolean }).isRabby = false;
    setEthereum({ providers: [metamask, rabby] });

    render(
      <WalletProvider>
        <Probe />
      </WalletProvider>
    );
    await waitFor(() => expect(screen.getByTestId("address").textContent).toBe("0xRabby"));
  });

  // Regression test for a real live-QA finding: OKX Wallet injects itself
  // as `window.okxwallet` and does NOT populate `window.ethereum` when
  // installed alongside another wallet (e.g. Rabby) that claims that slot.
  // The original discovery logic only ever checked `window.ethereum`,
  // producing a false "no wallet provider found" with OKX active. This
  // reproduces exactly that browser state and asserts the fallback works.
  it("falls back to window.okxwallet when window.ethereum is absent (OKX Wallet without EIP-6963 announce)", async () => {
    const okx = makeMockProvider({ accounts: ["0xOkxUser"], chainIdHex: "0xf22f" });
    setEthereum(undefined);
    setOkxWallet(okx);

    render(
      <WalletProvider>
        <Probe />
      </WalletProvider>
    );

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("connected"), {
      timeout: 3000,
    });
    expect(screen.getByTestId("address").textContent).toBe("0xOkxUser");
  }, 10000);
});
