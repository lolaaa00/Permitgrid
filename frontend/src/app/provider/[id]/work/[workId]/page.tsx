"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/lib/wallet";
import { contractReads } from "@/lib/contract";
import { isContractConfigured } from "@/lib/config";
import type { WorkOrder, Provider, RequirementSet, ClearanceAssessment } from "@/lib/types";
import PermitHeader from "@/components/PermitHeader";
import RequirementSheet from "@/components/RequirementSheet";
import ClearanceStamp from "@/components/ClearanceStamp";

export default function ProviderWorkDetailPage({
  params,
}: {
  params: Promise<{ id: string; workId: string }>;
}) {
  const { id: providerId, workId } = use(params);
  const { readClient } = useWallet();

  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [requirementSet, setRequirementSet] = useState<RequirementSet | null>(null);
  const [assessment, setAssessment] = useState<ClearanceAssessment | null>(null);
  const [staleReason, setStaleReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => isContractConfigured());
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!isContractConfigured()) {
      return;
    }
    let cancelled = false;

    Promise.resolve()
      .then(() => {
        if (cancelled) return null;
        setLoading(true);
        setLoadError(null);
        return Promise.all([
          contractReads.getWorkOrder(readClient, workId),
          contractReads.getProvider(readClient, providerId),
        ]);
      })
      .then(async (pair) => {
        if (cancelled || !pair) return;
        const [wo, prov] = pair;
        if (cancelled) return;
        setWorkOrder(wo);
        setProvider(prov);

        const rs =
          wo.requirement_version > 0 ? await contractReads.getRequirementSet(readClient, workId, 0) : null;
        if (cancelled) return;
        setRequirementSet(rs);

        const a = await contractReads.getClearanceAssessment(readClient, workId, providerId, 0).catch(() => null);
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

  if (!isContractConfigured()) {
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

      {!assessment && (
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
