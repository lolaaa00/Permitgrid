"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/lib/wallet";
import { contractReads, contractWrites } from "@/lib/contract";
import { isContractConfigured } from "@/lib/config";
import { NotFoundError, ReadError } from "@/lib/readClient";
import { CREDENTIAL_ROLES } from "@/lib/types";
import type { WorkOrder, Provider, RequirementSet, ClearanceAssessment, RegSource } from "@/lib/types";
import type { TxStep } from "@/lib/txFlow";
import PermitHeader from "@/components/PermitHeader";
import RequirementSheet from "@/components/RequirementSheet";
import ClearanceStamp from "@/components/ClearanceStamp";
import SourceListEditor from "@/components/SourceListEditor";
import TxProgress from "@/components/TxProgress";

export default function ProviderWorkDetailPage({
  params,
}: {
  params: Promise<{ id: string; workId: string }>;
}) {
  const { id: providerId, workId } = use(params);
  const { status, address, writeClient, readClient } = useWallet();

  const [credSources, setCredSources] = useState<RegSource[]>([{ url: "", role: CREDENTIAL_ROLES[0] }]);
  const [credStep, setCredStep] = useState<TxStep>("IDLE");
  const [credTxHash, setCredTxHash] = useState<string | null>(null);
  const [credError, setCredError] = useState<string | null>(null);
  const [credSubmitting, setCredSubmitting] = useState(false);

  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [requirementSet, setRequirementSet] = useState<RequirementSet | null>(null);
  const [assessment, setAssessment] = useState<ClearanceAssessment | null>(null);
  // Distinct from "no assessment exists": a genuine RPC/read failure while
  // fetching the assessment. Must never be silently converted into
  // assessmentNotFound=true (the bug this fixes — see HANDOFF.md).
  const [assessmentReadError, setAssessmentReadError] = useState<ReadError | null>(null);
  const [assessmentNotFound, setAssessmentNotFound] = useState(false);
  const [staleReason, setStaleReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => isContractConfigured());
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!isContractConfigured()) {
      return () => undefined;
    }
    let cancelled = false;

    setLoading(true);
    setLoadError(null);
    setAssessmentReadError(null);
    setAssessmentNotFound(false);

    Promise.all([
      contractReads.getWorkOrder(readClient, workId),
      contractReads.getProvider(readClient, providerId),
    ])
      .then(async ([wo, prov]) => {
        if (cancelled) return;
        setWorkOrder(wo);
        setProvider(prov);
        if (prov.credential_sources && prov.credential_sources.length > 0) {
          setCredSources(prov.credential_sources.map((s) => ({ ...s })));
        }

        const rs =
          wo.requirement_version > 0 ? await contractReads.getRequirementSet(readClient, workId, 0) : null;
        if (cancelled) return;
        setRequirementSet(rs);

        let a: ClearanceAssessment | null = null;
        try {
          a = await contractReads.getClearanceAssessment(readClient, workId, providerId, 0);
        } catch (err) {
          if (cancelled) return;
          if (err instanceof NotFoundError) {
            // A genuine, legitimate "no assessment has ever run" — distinct
            // from a failed read. Render the neutral empty state.
            setAssessmentNotFound(true);
          } else {
            // RPC unreachable / timeout / malformed / unknown — a real
            // failure, must be shown as retryable, never as "no assessment".
            setAssessmentReadError(err instanceof ReadError ? err : new ReadError(String(err), "UNKNOWN", true, err));
          }
        }
        if (cancelled) return;
        setAssessment(a);

        if (a) {
          if (rs && a.requirement_version < rs.version) {
            setStaleReason("Requirement version changed. Previous clearance is stale.");
          } else if (a.credential_version < prov.credential_version) {
            setStaleReason("Credential set changed. Reassessment is required.");
          } else {
            setStaleReason(null);
          }
        }
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [providerId, workId, readClient]);

  useEffect(() => {
    let cancel: (() => void) | undefined;
    Promise.resolve().then(() => {
      cancel = load();
    });
    return () => cancel?.();
  }, [load]);

  const configured = isContractConfigured();

  async function onUpdateCredentials(e: React.FormEvent) {
    e.preventDefault();
    if (!writeClient || !address || !provider) return;
    setCredSubmitting(true);
    setCredError(null);
    try {
      await contractWrites.updateCredentials(
        writeClient,
        address,
        providerId,
        credSources,
        provider.credential_version,
        (s, detail) => {
          setCredStep(s);
          if (detail?.hash) setCredTxHash(detail.hash);
        }
      );
      load();
    } catch (err) {
      setCredError(err instanceof Error ? err.message : String(err));
    } finally {
      setCredSubmitting(false);
    }
  }

  if (!configured) {
    return (
      <p className="pg-card px-4 py-3 text-sm text-amber" role="status">
        Contract not configured. Set NEXT_PUBLIC_CONTRACT_ADDRESS to load clearance detail.
      </p>
    );
  }

  if (loading) {
    return (
      <p className="text-sm text-ink-muted" role="status">
        Loading clearance…
      </p>
    );
  }

  if (loadError || !workOrder || !provider) {
    return (
      <p className="pg-card px-4 py-3 text-sm text-red" role="alert" data-testid="clearance-error">
        Failed to load clearance: {loadError ?? "not found"}
      </p>
    );
  }

  return (
    <div>
      <PermitHeader
        workOrderRef={workOrder.ref}
        requirementVersion={requirementSet?.version ?? workOrder.requirement_version}
        extra={`PROVIDER / ${provider.name}`}
      />

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 mb-6 text-sm font-ident">
        <Field label="Work" value={workOrder.title} mono={false} />
        <Field label="Requirements" value={`V${String(requirementSet?.version ?? 0).padStart(2, "0")}`} />
        <Field label="Credentials" value={`V${String(provider.credential_version).padStart(2, "0")}`} />
        <Field label="Assessment" value={assessment ? String(assessment.assessment_id).padStart(3, "0") : "—"} />
      </dl>

      {staleReason && (
        <p className="pg-card px-4 py-3 text-sm text-amber mb-4" role="status" data-testid="stale-banner">
          {staleReason}
        </p>
      )}

      {assessmentReadError && (
        <p className="pg-card px-4 py-3 text-sm text-red mb-6" role="alert" data-testid="assessment-read-error">
          Could not read the clearance assessment: {assessmentReadError.message}
          {" "}
          <button type="button" className="underline underline-offset-2" onClick={() => load()}>
            Retry
          </button>
        </p>
      )}

      {assessmentNotFound && !assessment && (
        <p className="pg-card px-4 py-3 text-sm text-ink-muted mb-6" data-testid="no-assessment">
          No assessment on file for this provider against this work order yet.{" "}
          <Link href="/clearance/new" className="underline underline-offset-2">
            Run one →
          </Link>
        </p>
      )}

      {assessment && (
        <>
          <h2 className="font-ident text-sm font-bold uppercase mb-2 text-ink-muted">Requirement matrix</h2>
          <RequirementSheet requirements={requirementSet?.requirements ?? []} items={assessment.items} />

          <div className="mt-6 max-w-sm">
            <ClearanceStamp clearance={staleReason ? "STALE" : assessment.clearance} />
          </div>
        </>
      )}

      <div className="mt-8 pt-6 border-t border-line">
        <h2 className="font-ident text-sm font-bold uppercase mb-2 text-ink-muted">Update credentials</h2>
        <p className="text-sm text-ink-muted mb-3">
          Submitting new credential evidence bumps this provider&apos;s credential version, which
          immediately invalidates any existing assessment for this pair — it must be reassessed
          before the assignment gate can open again.
        </p>

        {configured && status !== "connected" && (
          <p className="pg-card px-4 py-3 text-sm text-amber mb-4" role="status">
            Connect a wallet on GenLayer (chain 61999) to update credentials.
          </p>
        )}

        <form onSubmit={onUpdateCredentials} className="space-y-3" data-testid="update-credentials-form">
          <SourceListEditor sources={credSources} roles={CREDENTIAL_ROLES} onChange={setCredSources} max={8} />
          <button
            type="submit"
            className="pg-btn"
            disabled={
              !configured ||
              status !== "connected" ||
              !writeClient ||
              !address ||
              credSubmitting ||
              credSources.length === 0 ||
              !credSources.every((s) => s.url.trim())
            }
          >
            {credSubmitting ? "Submitting…" : "Update credentials"}
          </button>
        </form>

        <TxProgress step={credStep} hash={credTxHash} errorMessage={credError} />
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="pg-label mb-0.5">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
