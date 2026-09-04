"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/lib/wallet";
import { contractReads, contractWrites } from "@/lib/contract";
import { isContractConfigured } from "@/lib/config";
import type { WorkOrder, RequirementSet } from "@/lib/types";
import type { TxStep } from "@/lib/txFlow";
import PermitHeader from "@/components/PermitHeader";
import RequirementSheet from "@/components/RequirementSheet";
import TxProgress from "@/components/TxProgress";

export default function WorkOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { status, address, writeClient, readClient } = useWallet();

  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [requirementSet, setRequirementSet] = useState<RequirementSet | null>(null);
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
    try {
      const wo = await contractReads.getWorkOrder(readClient, id);
      setWorkOrder(wo);
      if (wo.requirement_version > 0) {
        const rs = await contractReads.getRequirementSet(readClient, id, 0);
        setRequirementSet(rs);
      } else {
        setRequirementSet(null);
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
        (s, detail) => {
          setStep(s);
          if (detail?.hash) setTxHash(detail.hash);
        }
      );
      await load();
    } catch (err) {
      setTxError(err instanceof Error ? err.message : String(err));
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
            {requirementSet
              ? "Connect wallet to rebuild requirements."
              : "Connect a wallet to extract requirements."}
          </span>
        )}
      </div>

      <RequirementSheet requirements={requirementSet?.requirements ?? []} />

      <TxProgress step={step} hash={txHash} errorMessage={txError} />

      <p className="text-sm mt-6">
        <Link href="/clearance/new" className="underline underline-offset-2">
          Run a provider clearance assessment against this work order →
        </Link>
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
