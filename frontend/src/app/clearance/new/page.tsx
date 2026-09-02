"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/lib/wallet";
import { contractReads, contractWrites } from "@/lib/contract";
import { isContractConfigured } from "@/lib/config";
import type { TxStep } from "@/lib/txFlow";
import TxProgress from "@/components/TxProgress";

export default function NewClearancePage() {
  const router = useRouter();
  const { status, address, writeClient, readClient } = useWallet();
  const [workOrderId, setWorkOrderId] = useState("");
  const [providerId, setProviderId] = useState("");

  const [step, setStep] = useState<TxStep>("IDLE");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = status === "connected" && !!writeClient && !!address && workOrderId.trim() && providerId.trim();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!writeClient || !address) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const wo = isContractConfigured()
        ? await contractReads.getWorkOrder(readClient, workOrderId.trim())
        : null;
      const currentAssessment = isContractConfigured()
        ? await contractReads
            .getClearanceAssessment(readClient, workOrderId.trim(), providerId.trim(), 0)
            .catch(() => null)
        : null;
      const expectedAssessmentId = currentAssessment?.assessment_id ?? 0;

      await contractWrites.assessProvider(
        writeClient,
        address,
        workOrderId.trim(),
        providerId.trim(),
        expectedAssessmentId,
        (s, detail) => {
          setStep(s);
          if (detail?.hash) setTxHash(detail.hash);
        }
      );

      void wo;
      router.push(`/provider/${providerId.trim()}/work/${workOrderId.trim()}`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="font-ident text-xl font-bold uppercase mb-4">New Clearance Assessment</h1>
      <p className="text-sm text-ink-muted mb-4">
        Runs provider scope assessment (consensus stage B) against a work order&apos;s frozen requirement
        set and the provider&apos;s current credential evidence.
      </p>

      {status !== "connected" && (
        <p className="pg-card px-4 py-3 text-sm text-amber mb-4" role="status">
          Connect a wallet on GenLayer (chain 61999) to run an assessment.
        </p>
      )}

      <form onSubmit={onSubmit} className="space-y-4" data-testid="new-clearance-form">
        <div>
          <label className="pg-label" htmlFor="work_order_id">
            Work order ID
          </label>
          <input
            id="work_order_id"
            className="pg-input font-ident"
            value={workOrderId}
            onChange={(e) => setWorkOrderId(e.target.value)}
            required
            data-testid="input-work-order-id"
          />
        </div>

        <div>
          <label className="pg-label" htmlFor="provider_id">
            Provider ID
          </label>
          <input
            id="provider_id"
            className="pg-input font-ident"
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
            required
            data-testid="input-provider-id"
          />
        </div>

        <button type="submit" className="pg-btn" disabled={!canSubmit || submitting}>
          {submitting ? "Assessing…" : "Run assessment"}
        </button>
      </form>

      <TxProgress step={step} hash={txHash} errorMessage={errorMessage} />
    </div>
  );
}
