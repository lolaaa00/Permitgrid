"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/lib/wallet";
import { contractWrites } from "@/lib/contract";
import { SOURCE_ROLES } from "@/lib/types";
import type { RegSource } from "@/lib/types";
import type { TxStep } from "@/lib/txFlow";
import SourceListEditor from "@/components/SourceListEditor";
import TxProgress from "@/components/TxProgress";

const CATEGORY_PLACEHOLDER = "e.g. High-voltage electrical maintenance";

export default function NewWorkOrderPage() {
  const router = useRouter();
  const { status, address, writeClient } = useWallet();
  const [workOrderId, setWorkOrderId] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [exactScope, setExactScope] = useState("");
  const [environment, setEnvironment] = useState("");
  const [role, setRole] = useState("");
  const [sources, setSources] = useState<RegSource[]>([{ url: "", role: SOURCE_ROLES[0] }]);

  const [step, setStep] = useState<TxStep>("IDLE");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit =
    status === "connected" &&
    !!writeClient &&
    !!address &&
    workOrderId.trim() &&
    title.trim() &&
    category.trim() &&
    jurisdiction.trim() &&
    exactScope.trim() &&
    environment.trim() &&
    role.trim() &&
    sources.length > 0 &&
    sources.every((s) => s.url.trim());

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!writeClient || !address) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const wo = await contractWrites.registerWorkOrder(
        writeClient,
        address,
        {
          work_order_id: workOrderId.trim(),
          title: title.trim(),
          category: category.trim(),
          jurisdiction: jurisdiction.trim(),
          exact_scope: exactScope.trim(),
          environment: environment.trim(),
          role: role.trim(),
          sources,
        },
        (s, detail) => {
          setStep(s);
          if (detail?.hash) setTxHash(detail.hash);
        }
      );
      router.push(`/work-order/${wo.work_order_id}`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="font-ident text-xl font-bold uppercase mb-4">New Work Order</h1>

      {status !== "connected" && (
        <p className="pg-card px-4 py-3 text-sm text-amber mb-4" role="status">
          Connect a wallet on GenLayer (chain 61999) to register a work order.
        </p>
      )}

      <form onSubmit={onSubmit} className="space-y-4" data-testid="new-work-order-form">
        <div>
          <label className="pg-label" htmlFor="work_order_id">
            Work order ID (unique key)
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
          <label className="pg-label" htmlFor="title">
            Title
          </label>
          <input id="title" className="pg-input" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>

        <div>
          <label className="pg-label" htmlFor="category">
            Category
          </label>
          <input
            id="category"
            className="pg-input"
            placeholder={CATEGORY_PLACEHOLDER}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="pg-label" htmlFor="jurisdiction">
            Jurisdiction
          </label>
          <input
            id="jurisdiction"
            className="pg-input"
            placeholder="e.g. Lagos / NG"
            value={jurisdiction}
            onChange={(e) => setJurisdiction(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="pg-label" htmlFor="exact_scope">
            Exact scope
          </label>
          <textarea
            id="exact_scope"
            className="pg-textarea"
            value={exactScope}
            onChange={(e) => setExactScope(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="pg-label" htmlFor="environment">
            Environment
          </label>
          <input
            id="environment"
            className="pg-input"
            value={environment}
            onChange={(e) => setEnvironment(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="pg-label" htmlFor="role">
            Required role
          </label>
          <input id="role" className="pg-input" value={role} onChange={(e) => setRole(e.target.value)} required />
        </div>

        <div>
          <span className="pg-label">Regulatory sources</span>
          <SourceListEditor sources={sources} roles={SOURCE_ROLES} onChange={setSources} />
        </div>

        <button type="submit" className="pg-btn" disabled={!canSubmit || submitting}>
          {submitting ? "Submitting…" : "Register work order"}
        </button>
      </form>

      <TxProgress step={step} hash={txHash} errorMessage={errorMessage} />
    </div>
  );
}
