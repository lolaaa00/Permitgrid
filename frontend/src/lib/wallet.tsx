"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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

/** EIP-1193 provider rejections are commonly plain `{ code, message }`
 * objects, not real `Error` instances — real wallets vary here. Handle
 * both rather than falling through to a useless "[object Object]". */
function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return String(err);
}

/** Finds the currently injected EIP-1193 provider. Handles the common
 * multi-wallet case (e.g. Rabby + MetaMask both installed) by preferring
 * `window.ethereum.providers` (the array multiple extensions populate) and
 * picking a Rabby-flagged provider if present, else the first available.
 * This is deliberately simple window.ethereum probing, not full EIP-6963
 * (`eip6963:requestProvider`) — a real EIP-6963 upgrade would let the user
 * pick explicitly among announced providers, which is a reasonable further
 * improvement but out of scope for this pass. */
function getInjectedProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  const eth = (window as unknown as {
    ethereum?: Eip1193Provider & { providers?: (Eip1193Provider & { isRabby?: boolean })[]; isRabby?: boolean };
  }).ethereum;
  if (!eth) return null;
  if (Array.isArray(eth.providers) && eth.providers.length > 0) {
    return eth.providers.find((p) => p.isRabby) ?? eth.providers[0];
  }
  return eth;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<WalletStatus>("disconnected");
  const [address, setAddress] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [providerReady, setProviderReady] = useState(false);

  // Mirrors `address` synchronously for event handlers registered once per
  // provider instance (chainChanged in particular), so they never act on a
  // stale closed-over value — this is the fix for the bug where
  // chainChanged captured the address from the render at effect-setup time.
  const addressRef = useRef<Address | null>(null);
  useEffect(() => {
    addressRef.current = address;
  }, [address]);

  const readClient = useMemo(() => getReadClient(), []);

  const refresh = useCallback(async (provider: Eip1193Provider, acct: Address | null) => {
    if (!acct) return;
    try {
      const hexId = (await provider.request({ method: "eth_chainId" })) as string;
      const numericId = parseInt(hexId, 16);
      setChainId(numericId);
      setAddress(acct);
      addressRef.current = acct;
      setStatus(numericId === CHAIN_ID ? "connected" : "wrong-chain");
      setError(null);
    } catch (err) {
      setError(err ? errMessage(err) : "Failed to read wallet state.");
    }
  }, []);

  // Provider discovery: window.ethereum may not exist on first render (e.g.
  // the extension injects asynchronously, or the user installs/enables it
  // after the page loads). Poll briefly for late injection instead of
  // concluding "no-provider" permanently from a single synchronous check.
  useEffect(() => {
    let cancelled = false;
    if (getInjectedProvider()) {
      Promise.resolve().then(() => {
        if (!cancelled) setProviderReady(true);
      });
      return () => {
        cancelled = true;
      };
    }
    Promise.resolve().then(() => {
      if (!cancelled) setStatus("no-provider");
    });
    let attempts = 0;
    const maxAttempts = 20; // ~10s at 500ms
    const timer = setInterval(() => {
      attempts += 1;
      if (cancelled) return;
      if (getInjectedProvider()) {
        clearInterval(timer);
        setProviderReady(true);
        setStatus("disconnected");
      } else if (attempts >= maxAttempts) {
        clearInterval(timer);
      }
    }, 500);
    const onAnnounce = () => {
      if (getInjectedProvider()) {
        clearInterval(timer);
        setProviderReady(true);
        setStatus("disconnected");
      }
    };
    // EIP-6963 announcement event, and the common `ethereum#initialized`
    // event some injected wallets fire — best-effort, harmless if unused.
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.addEventListener("ethereum#initialized", onAnnounce);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      window.removeEventListener("ethereum#initialized", onAnnounce);
    };
  }, []);

  useEffect(() => {
    if (!providerReady) return;
    const provider = getInjectedProvider();
    if (!provider) return;

    // Recover wallet state after a page reload for a previously authorized
    // account, without prompting — eth_accounts never triggers a wallet
    // popup.
    provider
      .request({ method: "eth_accounts" })
      .then((accounts) => {
        const list = accounts as string[];
        if (list && list.length > 0) {
          void refresh(provider, list[0] as Address);
        } else {
          setStatus("disconnected");
        }
      })
      .catch(() => setStatus("disconnected"));

    const handleAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      if (!accounts || accounts.length === 0) {
        setStatus("disconnected");
        setAddress(null);
        addressRef.current = null;
      } else {
        void refresh(provider, accounts[0] as Address);
      }
    };
    // Reads the current address via the ref (always fresh), not a value
    // captured when this effect ran — a network switch must re-evaluate
    // against whichever account is actually connected right now.
    const handleChainChanged = () => {
      void refresh(provider, addressRef.current);
    };
    provider.on?.("accountsChanged", handleAccountsChanged);
    provider.on?.("chainChanged", handleChainChanged);
    return () => {
      provider.removeListener?.("accountsChanged", handleAccountsChanged);
      provider.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [providerReady, refresh]);

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
      const msg = errMessage(err);
      if (/user rejected|user denied/i.test(msg)) {
        setError("Connection request was rejected.");
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
        try {
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
        } catch (addErr) {
          const addMsg = errMessage(addErr);
          setError(/user rejected|user denied/i.test(addMsg) ? "Add-network request was rejected." : addMsg);
          return;
        }
      } else {
        const msg = errMessage(err);
        setError(/user rejected|user denied/i.test(msg) ? "Network switch was rejected." : msg);
        return;
      }
    }
    await refresh(provider, addressRef.current);
  }, [refresh]);

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
