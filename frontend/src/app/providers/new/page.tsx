"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@/lib/wallet";
import { contractWrites } from "@/lib/contract";
import { isContractConfigured } from "@/lib/config";
import { CREDENTIAL_ROLES } from "@/lib/types";
import type { RegSource } from "@/lib/types";
import type { TxStep } from "@/lib/txFlow";
import SourceListEditor from "@/components/SourceListEditor";
import TxProgress from "@/components/TxProgress";

export default function NewProviderPage() {
  const router = useRouter();
  const { status, address, writeClient } = useWallet();
  const [providerId, setProviderId] = useState("");
  const [name, setName] = useState("");
  const [sources, setSources] = useState<RegSource[]>([{ url: "", role: CREDENTIAL_ROLES[0] }]);

  const [step, setStep] = useState<TxStep>("IDLE");
  const [credentialStep, setCredentialStep] = useState<TxStep>("IDLE");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const configured = isContractConfigured();

  const canSubmit =
    configured &&
    status === "connected" &&
    !!writeClient &&
    !!address &&
    providerId.trim() &&
    name.trim() &&
    sources.length > 0 &&
    sources.every((s) => s.url.trim());

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!configured || !writeClient || !address) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await contractWrites.registerProvider(writeClient, address, providerId.trim(), name.trim(), (s, detail) => {
        setStep(s);
        if (detail?.hash) setTxHash(detail.hash);
      });

      await contractWrites.createCredentialSubmission(writeClient, address, providerId.trim(), sources, 0, (s) => {
        setCredentialStep(s);
      });

      router.push(`/`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="font-ident text-xl font-bold uppercase mb-4">New Provider</h1>

      {!configured && (
        <p className="pg-card px-4 py-3 text-sm text-red mb-4" role="alert" data-testid="config-error">
          CONFIGURATION_ERROR — no valid contract address is configured. Writes are disabled until
          this is fixed. See the About page for the resolved configuration.
        </p>
      )}

      {configured && status !== "connected" && (
        <p className="pg-card px-4 py-3 text-sm text-amber mb-4" role="status">
          Connect a wallet on GenLayer (chain 61999) to register a provider.
        </p>
      )}

      <form onSubmit={onSubmit} className="space-y-4" data-testid="new-provider-form">
        <div>
          <label className="pg-label" htmlFor="provider_id">
            Provider ID (unique key)
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

        <div>
          <label className="pg-label" htmlFor="name">
            Provider name
          </label>
          <input id="name" className="pg-input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>

        <div>
          <span className="pg-label">Initial credential sources</span>
          <SourceListEditor sources={sources} roles={CREDENTIAL_ROLES} onChange={setSources} max={8} />
        </div>

        <button type="submit" className="pg-btn" disabled={!canSubmit || submitting}>
          {submitting ? "Submitting…" : "Register provider"}
        </button>
      </form>

      <TxProgress step={step} hash={txHash} errorMessage={errorMessage} />
      {step === "UPDATED" && <TxProgress step={credentialStep} />}
    </div>
  );
}
