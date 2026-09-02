import { TX_STEPS_ORDER, type TxStep } from "@/lib/txFlow";

const STEP_LABEL: Record<TxStep, string> = {
  IDLE: "",
  SUBMITTING: "SUBMITTING",
  LEADER_EXECUTION: "LEADER EXECUTION",
  VALIDATOR_REVIEW: "VALIDATOR REVIEW",
  CONSENSUS: "CONSENSUS",
  FINALISED: "FINALISED",
  CANONICAL_READBACK: "CANONICAL READBACK",
  UPDATED: "UPDATED",
  ERROR: "FAILED",
  READBACK_MISMATCH: "READBACK MISMATCH",
};

interface TxProgressProps {
  step: TxStep;
  hash?: string | null;
  errorMessage?: string | null;
}

export default function TxProgress({ step, hash, errorMessage }: TxProgressProps) {
  if (step === "IDLE") return null;
  const isError = step === "ERROR" || step === "READBACK_MISMATCH";
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
        <div className="font-ident text-xs text-ink-muted mt-2 break-all">TX {hash}</div>
      )}
      {isError && (
        <div className="text-sm text-red mt-2" role="alert" data-testid="tx-error">
          {errorMessage ?? STEP_LABEL[step]}
        </div>
      )}
    </div>
  );
}
