"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Address } from "genlayer-js/types";
import { getReadClient, getWriteClient, type Eip1193Provider } from "./genlayerClient";
import { CHAIN_ID, CHAIN_ID_HEX, CHAIN_NAME, CHAIN_CURRENCY, RPC_URL } from "./config";

export type WalletStatus =
  | "no-provider"
  | "disconnected"
  | "connecting"
  | "wrong-chain"
  | "connected";

interface WalletContextValue {
  status: WalletStatus;
  address: Address | null;
  chainId: number | null;
  error: string | null;
  connect: () => Promise<void>;
  switchChain: () => Promise<void>;
  readClient: ReturnType<typeof getReadClient>;
  writeClient: ReturnType<typeof getWriteClient> | null;
}

const WalletContext = createContext<WalletContextValue | null>(null);

function getInjectedProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  const eth = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
  return eth ?? null;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<WalletStatus>(() =>
    getInjectedProvider() ? "disconnected" : "no-provider"
  );
  const [address, setAddress] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const readClient = useMemo(() => getReadClient(), []);

  const refresh = useCallback(async (provider: Eip1193Provider, acct: Address | null) => {
    if (!acct) return;
    try {
      const hexId = (await provider.request({ method: "eth_chainId" })) as string;
      const numericId = parseInt(hexId, 16);
      setChainId(numericId);
      setAddress(acct);
      setStatus(numericId === CHAIN_ID ? "connected" : "wrong-chain");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read wallet state.");
    }
  }, []);

  useEffect(() => {
    const provider = getInjectedProvider();
    if (!provider) return;

    provider
      .request({ method: "eth_accounts" })
      .then((accounts) => {
        const list = accounts as string[];
        if (list && list.length > 0) {
          void refresh(provider, list[0] as Address);
        }
      })
      .catch(() => undefined);

    const handleAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      if (!accounts || accounts.length === 0) {
        setStatus("disconnected");
        setAddress(null);
      } else {
        void refresh(provider, accounts[0] as Address);
      }
    };
    const handleChainChanged = () => {
      void refresh(provider, address);
    };
    provider.on?.("accountsChanged", handleAccountsChanged);
    provider.on?.("chainChanged", handleChainChanged);
    return () => {
      provider.removeListener?.("accountsChanged", handleAccountsChanged);
      provider.removeListener?.("chainChanged", handleChainChanged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  const connect = useCallback(async () => {
    const provider = getInjectedProvider();
    if (!provider) {
      setStatus("no-provider");
      return;
    }
    setStatus("connecting");
    setError(null);
    try {
      const accounts = (await provider.request({
        method: "eth_requestAccounts",
      })) as string[];
      if (!accounts || accounts.length === 0) {
        setStatus("disconnected");
        return;
      }
      await refresh(provider, accounts[0] as Address);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/user rejected|user denied/i.test(msg)) {
        setError("Signature request was rejected.");
      } else {
        setError(msg);
      }
      setStatus("disconnected");
    }
  }, [refresh]);

  const switchChain = useCallback(async () => {
    const provider = getInjectedProvider();
    if (!provider) return;
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: CHAIN_ID_HEX }],
      });
    } catch (err) {
      const asObj = err as { code?: number };
      if (asObj?.code === 4902) {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: CHAIN_ID_HEX,
              chainName: CHAIN_NAME,
              nativeCurrency: CHAIN_CURRENCY,
              rpcUrls: [RPC_URL],
            },
          ],
        });
      } else {
        setError(err instanceof Error ? err.message : "Failed to switch network.");
      }
    }
    if (address) await refresh(provider, address);
  }, [address, refresh]);

  const writeClient = useMemo(() => {
    const provider = getInjectedProvider();
    if (!provider || !address || status !== "connected") return null;
    return getWriteClient(provider, address);
  }, [address, status]);

  const value: WalletContextValue = {
    status,
    address,
    chainId,
    error,
    connect,
    switchChain,
    readClient,
    writeClient,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
