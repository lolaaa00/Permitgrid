"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/lib/wallet";
import { contractReads, contractWrites } from "@/lib/contract";
import { isContractConfigured } from "@/lib/config";
import { ReadError } from "@/lib/readClient";
import { evaluateRequirementSet, type RequirementSetStatus } from "@/lib/requirementSetValidity";
import type { WorkOrder, RequirementSet } from "@/lib/types";
import type { TxStep } from "@/lib/txFlow";
import PermitHeader from "@/components/PermitHeader";
import RequirementSheet from "@/components/RequirementSheet";
import TxProgress from "@/components/TxProgress";

/** All actual page logic, taking `id` directly rather than the route's
 * params Promise — kept separate purely so it can be rendered/tested
 * without needing a Suspense boundary around `use()`, and so `page.tsx`
 * only exports the names Next.js allows from an app-router page module. */
export function WorkOrderDetailView({ id }: { id: string }) {
  const { status, address, writeClient, readClient } = useWallet();

  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  // The raw fetched entry (may be stale) is kept separately from what's
  // actually rendered — `requirementSet` is only ever set to a non-null
  // value when `rsStatus === "CURRENT"`, so a stale/invalidated set is
  // never visually retained after a source update or failed extraction.
  const [requirementSet, setRequirementSet] = useState<RequirementSet | null>(null);
  const [rsStatus, setRsStatus] = useState<RequirementSetStatus>("NONE");
  const [rsReadError, setRsReadError] = useState<ReadError | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => isContractConfigured());

  const [step, setStep] = useState<TxStep>("IDLE");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);

  async function load() {
    if (!isContractConfigured()) {
      return;
    }
    setLoading(true);
    setLoadError(null);
    setRsReadError(null);
    try {
      // Final-state reads: this page's job is to show what's actually
      // canonical, never a possibly-stale non-final snapshot.
      const wo = await contractReads.getWorkOrder(readClient, id, true);
      setWorkOrder(wo);

      if (wo.requirement_version === 0) {
        setRequirementSet(null);
        setRsStatus("NONE");
        return;
      }

      try {
        const rs = await contractReads.getRequirementSet(readClient, id, 0, true);
        const evaluated = evaluateRequirementSet(wo, rs);
        setRsStatus(evaluated);
        // Only ever render a requirement set proven current — a stale one
        // (source update or otherwise-invalidated) is never displayed as
        // if it were still in effect, even though the read itself
        // succeeded.
        setRequirementSet(evaluated === "CURRENT" ? rs : null);
      } catch (err) {
        // A genuine read failure (RPC/timeout/malformed) is distinct from
        // "no requirements" — must never collapse into the NONE state.
        setRequirementSet(null);
        setRsStatus("NONE");
        setRsReadError(err instanceof ReadError ? err : new ReadError(String(err), "UNKNOWN", true, err));
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    Promise.resolve().then(() => load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function onExtract() {
    if (!writeClient || !address || !workOrder) return;
    setExtracting(true);
    setTxError(null);
    try {
      await contractWrites.extractRequirements(
        writeClient,
        address,
        id,
        workOrder.requirement_version,
        workOrder.source_version,
        (s, detail) => {
          setStep(s);
          if (detail?.hash) setTxHash(detail.hash);
        }
      );
      await load();
    } catch (err) {
      // On any extraction failure (non-convergence, reverted execution,
      // failed readback, timeout, malformed output) `load()` below still
      // re-reads canonical state, which will correctly show NONE/STALE —
      // never a partial or disputed set, since the contract itself never
      // committed one. The error itself is surfaced via TxProgress.
      setTxError(err instanceof Error ? err.message : String(err));
      await load();
    } finally {
      setExtracting(false);
    }
  }

  if (!isContractConfigured()) {
    return (
      <p className="pg-card px-4 py-3 text-sm text-amber" role="status">
        Contract not configured. Set NEXT_PUBLIC_CONTRACT_ADDRESS to load work order detail.
      </p>
    );
  }

  if (loading) {
    return (
      <p className="text-sm text-ink-muted" role="status">
        Loading work order…
      </p>
    );
  }

  if (loadError || !workOrder) {
    return (
      <p className="pg-card px-4 py-3 text-sm text-red" role="alert" data-testid="work-order-error">
        Failed to load work order: {loadError ?? "not found"}
      </p>
    );
  }

  const hasEverHadRequirements = workOrder.requirement_version > 0;
  const canRunAssessment = rsStatus === "CURRENT";

  return (
    <div>
      <PermitHeader workOrderRef={workOrder.ref} requirementVersion={workOrder.requirement_version} />

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mb-6 text-sm">
        <Field label="Title" value={workOrder.title} />
        <Field label="Jurisdiction" value={workOrder.jurisdiction} />
        <Field label="Category" value={workOrder.category} />
        <Field label="Environment" value={workOrder.environment} />
        <Field label="Exact scope" value={workOrder.exact_scope} span />
        <Field label="Required role" value={workOrder.role} />
        <Field label="Status" value={workOrder.status} mono />
        <Field label="Source version" value={`V${String(workOrder.source_version).padStart(2, "0")}`} mono />
      </dl>

      <h2 className="font-ident text-sm font-bold uppercase mb-2 text-ink-muted">Regulatory sources</h2>
      <ul className="mb-6 text-sm space-y-1" data-testid="work-order-sources">
        {workOrder.sources.map((s, i) => (
          <li key={i} className="flex gap-3 items-baseline">
            <span className="font-ident text-xs text-ink-muted">{s.role.replace(/_/g, " ")}</span>
            <span className="truncate">{s.url}</span>
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-3 mb-4">
        <h2 className="font-ident text-sm font-bold uppercase text-ink-muted">Requirement matrix</h2>
        {status === "connected" ? (
          <button type="button" className="pg-btn pg-btn-outline text-xs" onClick={onExtract} disabled={extracting}>
            {extracting ? "Extracting…" : "Extract / rebuild requirements"}
          </button>
        ) : (
          <span className="text-xs text-ink-muted">
            {hasEverHadRequirements
              ? "Connect wallet to rebuild requirements."
              : "Connect a wallet to extract requirements."}
          </span>
        )}
      </div>

      {rsReadError && (
        <p className="pg-card px-4 py-3 text-sm text-red mb-4" role="alert" data-testid="requirement-read-error">
          Could not read the requirement set: {rsReadError.message}{" "}
          <button type="button" className="underline underline-offset-2" onClick={() => load()}>
            Retry
          </button>
        </p>
      )}

      {!rsReadError && rsStatus === "STALE" && (
        <p className="pg-card px-4 py-3 text-sm text-amber mb-4" role="status" data-testid="requirement-set-stale">
          The previously extracted requirements are no longer current (regulatory sources changed, or
          the last extraction did not complete) — no current requirement set exists. Extract to
          establish a new one.
        </p>
      )}

      {!rsReadError && rsStatus === "NONE" && (
        <p className="pg-card px-4 py-3 text-sm text-ink-muted mb-4" data-testid="requirement-set-none">
          No requirements extracted yet.
        </p>
      )}

      {rsStatus === "CURRENT" && <RequirementSheet requirements={requirementSet?.requirements ?? []} />}

      <TxProgress step={step} hash={txHash} errorMessage={txError} />

      <p className="text-sm mt-6">
        {canRunAssessment ? (
          <Link href="/clearance/new" className="underline underline-offset-2">
            Run a provider clearance assessment against this work order →
          </Link>
        ) : (
          <span className="text-ink-muted" data-testid="assessment-unavailable">
            A provider clearance assessment cannot be run until a current requirement set exists.
          </span>
        )}
      </p>
    </div>
  );
}

function Field({ label, value, mono, span }: { label: string; value: string | number; mono?: boolean; span?: boolean }) {
  return (
    <div className={span ? "sm:col-span-2" : undefined}>
      <dt className="pg-label mb-0.5">{label}</dt>
      <dd className={mono ? "font-ident" : ""}>{value}</dd>
    </div>
  );
}
