"use client";

import { useWallet } from "@/lib/wallet";

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function WalletButton() {
  const { status, address, connect, switchChain, error } = useWallet();

  if (status === "no-provider") {
    return (
      <div className="text-xs font-ident text-red uppercase" role="status">
        No wallet provider found
      </div>
    );
  }

  if (status === "connected" && address) {
    return (
      <div className="flex items-center gap-2 text-xs font-ident">
        <span className="inline-block w-2 h-2 bg-green" aria-hidden />
        <span aria-label="Connected wallet address">{short(address)}</span>
      </div>
    );
  }

  if (status === "wrong-chain") {
    return (
      <button type="button" onClick={() => void switchChain()} className="pg-btn pg-btn-outline text-xs">
        Wrong network — switch
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => void connect()}
        disabled={status === "connecting"}
        className="pg-btn text-xs"
      >
        {status === "connecting" ? "Connecting…" : "Connect wallet"}
      </button>
      {error && (
        <span className="text-xs text-red" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
