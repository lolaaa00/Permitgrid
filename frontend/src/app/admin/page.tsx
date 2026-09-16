"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useWallet } from "@/lib/wallet";
import { contractReads, contractWrites } from "@/lib/contract";
import { isContractConfigured } from "@/lib/config";
import type { TxStep } from "@/lib/txFlow";
import TxProgress from "@/components/TxProgress";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** Admin-key rotation. Not gated client-side on "are you the admin" — the
 * contract has no view exposing the current admin address (only whether a
 * rotation is pending), and this app's convention throughout is to let the
 * wallet submit and let the contract's own authorization check (`_require_admin`
 * / the pending-admin check in `accept_admin`) be the real gate, surfaced via
 * TxProgress on rejection — same pattern as every other write form here. */
export default function AdminPage() {
  const { status, address, writeClient, readClient } = useWallet();
  const configured = isContractConfigured();

  const [pendingAdmin, setPendingAdmin] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => configured);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [newAdmin, setNewAdmin] = useState("");
  const [proposeStep, setProposeStep] = useState<TxStep>("IDLE");
  const [proposeHash, setProposeHash] = useState<string | null>(null);
  const [proposeError, setProposeError] = useState<string | null>(null);
  const [proposing, setProposing] = useState(false);

  const [acceptStep, setAcceptStep] = useState<TxStep>("IDLE");
  const [acceptHash, setAcceptHash] = useState<string | null>(null);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  async function load() {
    if (!configured) return;
    setLoading(true);
    setLoadError(null);
    try {
      const pending = await contractReads.getPendingAdmin(readClient);
      setPendingAdmin(pending || null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    Promise.resolve().then(() => load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canPropose =
    configured &&
    status === "connected" &&
    !!writeClient &&
    !!address &&
    ADDRESS_RE.test(newAdmin.trim());

  async function onPropose(e: FormEvent) {
    e.preventDefault();
    if (!writeClient || !address) return;
    setProposing(true);
    setProposeError(null);
    try {
      await contractWrites.proposeAdmin(writeClient, address, newAdmin.trim(), (s, detail) => {
        setProposeStep(s);
        if (detail?.hash) setProposeHash(detail.hash);
      });
      setNewAdmin("");
      await load();
    } catch (err) {
      setProposeError(err instanceof Error ? err.message : String(err));
    } finally {
      setProposing(false);
    }
  }

  async function onAccept() {
    if (!writeClient || !address) return;
    setAccepting(true);
    setAcceptError(null);
    try {
      await contractWrites.acceptAdmin(writeClient, address, (s, detail) => {
        setAcceptStep(s);
        if (detail?.hash) setAcceptHash(detail.hash);
      });
      await load();
    } catch (err) {
      setAcceptError(err instanceof Error ? err.message : String(err));
    } finally {
      setAccepting(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="font-ident text-xl font-bold uppercase mb-4">Admin — Rotation</h1>
      <p className="text-sm text-ink-muted mb-4">
        Two-step admin-key rotation for the deployed contract: the current admin proposes a new
        address, and only that exact address can accept — avoiding a single-transaction,
        no-recovery mistake. Only the real contract admin/pending admin can successfully submit
        the corresponding action below; anyone else&apos;s attempt is rejected on-chain.
      </p>

      {!configured && (
        <p className="pg-card px-4 py-3 text-sm text-red mb-4" role="alert" data-testid="config-error">
          CONFIGURATION_ERROR — no valid contract address is configured. See the About page for
          the resolved configuration.
        </p>
      )}

      {configured && status !== "connected" && (
        <p className="pg-card px-4 py-3 text-sm text-amber mb-4" role="status">
          Connect a wallet on GenLayer (chain 61999) to propose or accept an admin rotation.
        </p>
      )}

      {configured && (
        <>
          <h2 className="font-ident text-sm font-bold uppercase mb-2 text-ink-muted">
            Pending rotation
          </h2>

          {loading && (
            <p className="text-sm text-ink-muted mb-4" role="status">
              Loading…
            </p>
          )}

          {loadError && (
            <p className="pg-card px-4 py-3 text-sm text-red mb-4" role="alert" data-testid="pending-admin-error">
              Could not read pending-admin state: {loadError}{" "}
              <button type="button" className="underline underline-offset-2" onClick={() => load()}>
                Retry
              </button>
            </p>
          )}

          {!loading && !loadError && (
            <p className="pg-card px-4 py-3 text-sm mb-4" data-testid="pending-admin-status">
              {pendingAdmin ? (
                <>
                  Proposed new admin: <span className="font-ident break-all">{pendingAdmin}</span>
                </>
              ) : (
                "No admin rotation is currently pending."
              )}
            </p>
          )}

          {!loading && !loadError && pendingAdmin && (
            <div className="mb-8">
              <button
                type="button"
                className="pg-btn"
                onClick={onAccept}
                disabled={status !== "connected" || !writeClient || !address || accepting}
                data-testid="accept-admin-button"
              >
                {accepting ? "Accepting…" : "Accept pending rotation"}
              </button>
              <p className="text-xs text-ink-muted mt-2">
                Only succeeds if the connected wallet is exactly the proposed address above.
              </p>
              <TxProgress step={acceptStep} hash={acceptHash} errorMessage={acceptError} />
            </div>
          )}

          <h2 className="font-ident text-sm font-bold uppercase mb-2 text-ink-muted">
            Propose new admin
          </h2>

          <form onSubmit={onPropose} className="space-y-3" data-testid="propose-admin-form">
            <div>
              <label className="pg-label" htmlFor="new_admin">
                New admin address
              </label>
              <input
                id="new_admin"
                className="pg-input font-ident"
                placeholder="0x…"
                value={newAdmin}
                onChange={(e) => setNewAdmin(e.target.value)}
                required
                data-testid="input-new-admin"
              />
            </div>
            <button type="submit" className="pg-btn" disabled={!canPropose || proposing}>
              {proposing ? "Proposing…" : "Propose new admin"}
            </button>
            <p className="text-xs text-ink-muted">
              Only succeeds if the connected wallet is the current contract admin.
            </p>
          </form>

          <TxProgress step={proposeStep} hash={proposeHash} errorMessage={proposeError} />
        </>
      )}
    </div>
  );
}
