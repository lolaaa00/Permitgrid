import { EXPLORER_URL } from "@/lib/config";
import { TX_FAILURE_STEPS, TX_STEPS_ORDER, type TxStep } from "@/lib/txFlow";

const STEP_LABEL: Record<TxStep, string> = {
  IDLE: "",
  WALLET_REQUEST: "WALLET REQUEST",
  SUBMITTING: "SUBMITTING",
  SUBMITTED: "SUBMITTED",
  LEADER_EXECUTION: "LEADER EXECUTION",
  VALIDATOR_REVIEW: "VALIDATOR REVIEW",
  CONSENSUS: "CONSENSUS",
  FINALIZING: "FINALIZING",
  FINALISED: "FINALISED",
  EXECUTION_VERIFIED: "EXECUTION VERIFIED",
  CANONICAL_READBACK: "CANONICAL READBACK",
  UPDATED: "UPDATED",
  ERROR: "FAILED",
  WALLET_REJECTED: "WALLET REJECTED",
  EXECUTION_REVERTED: "EXECUTION REVERTED",
  CONSENSUS_NON_CONVERGENCE: "CONSENSUS DID NOT CONVERGE",
  RPC_ERROR: "RPC ERROR",
  FINALITY_TIMEOUT: "FINALITY TIMEOUT",
  READBACK_MISMATCH: "READBACK MISMATCH",
};

interface TxProgressProps {
  step: TxStep;
  hash?: string | null;
  errorMessage?: string | null;
}

export default function TxProgress({ step, hash, errorMessage }: TxProgressProps) {
  if (step === "IDLE") return null;
  const isError = (TX_FAILURE_STEPS as readonly TxStep[]).includes(step);
  const currentIdx = TX_STEPS_ORDER.indexOf(step);

  return (
    <div className="pg-card px-4 py-3 my-3" role="status" aria-live="polite" data-testid="tx-progress">
      <ol className="flex flex-wrap gap-x-2 gap-y-1 font-ident text-xs uppercase tracking-wide">
        {TX_STEPS_ORDER.map((s, i) => {
          const done = !isError && currentIdx >= i;
          const active = s === step;
          return (
            <li
              key={s}
              className={
                active
                  ? "text-ink font-bold"
                  : done
                  ? "text-green"
                  : "text-ink-muted"
              }
            >
              {STEP_LABEL[s]}
              {i < TX_STEPS_ORDER.length - 1 ? " →" : ""}
            </li>
          );
        })}
      </ol>
      {hash && (
        <div className="font-ident text-xs text-ink-muted mt-2 break-all">
          TX {hash}
          {" "}
          <a
            className="underline underline-offset-2"
            href={`${EXPLORER_URL}/tx/${hash}`}
            target="_blank"
            rel="noreferrer"
          >
            View on explorer →
          </a>
        </div>
      )}
      {isError && (
        <div className="text-sm text-red mt-2" role="alert" data-testid="tx-error">
          {errorMessage ?? STEP_LABEL[step]}
        </div>
      )}
    </div>
  );
}
