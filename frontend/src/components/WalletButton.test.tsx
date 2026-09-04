import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import WalletButton from "./WalletButton";
import { WalletProvider } from "@/lib/wallet";

describe("WalletButton", () => {
  beforeEach(() => {
    // Ensure no injected provider between tests.
    delete (window as unknown as { ethereum?: unknown }).ethereum;
  });

  it("shows a clear no-provider state when no injected wallet exists", async () => {
    render(
      <WalletProvider>
        <WalletButton />
      </WalletProvider>
    );
    // Provider discovery is deliberately async (it tolerates late
    // injection instead of concluding "no provider" from a single
    // synchronous check), so this settles a tick after mount.
    expect(await screen.findByRole("status")).toHaveTextContent("No wallet provider found");
  });

  it("shows a connect action when a provider exists but is disconnected", async () => {
    (window as unknown as { ethereum: unknown }).ethereum = {
      request: async ({ method }: { method: string }) => {
        if (method === "eth_accounts") return [];
        return null;
      },
      on: () => undefined,
      removeListener: () => undefined,
    };
    render(
      <WalletProvider>
        <WalletButton />
      </WalletProvider>
    );
    expect(await screen.findByRole("button", { name: /connect wallet/i })).toBeInTheDocument();
  });
});
