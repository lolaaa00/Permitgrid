// Write-transaction progress state machine, kept framework-free so it can be
// unit tested without React or a real wallet. Models the GenLayer write
// lifecycle as discrete stages:
//
//   SUBMITTING -> LEADER_EXECUTION -> VALIDATOR_REVIEW -> CONSENSUS
//   -> FINALISED -> CANONICAL_READBACK -> UPDATED
//
// Success is NEVER reported before the canonical view-method readback
// confirms the new on-chain state. If the readback doesn't match what the
// write intended, we surface READBACK_MISMATCH instead of UPDATED.

export type TxStep =
  | "IDLE"
  | "SUBMITTING"
  | "LEADER_EXECUTION"
  | "VALIDATOR_REVIEW"
  | "CONSENSUS"
  | "FINALISED"
  | "CANONICAL_READBACK"
  | "UPDATED"
  | "ERROR"
  | "READBACK_MISMATCH";

export const TX_STEPS_ORDER: TxStep[] = [
  "SUBMITTING",
  "LEADER_EXECUTION",
  "VALIDATOR_REVIEW",
  "CONSENSUS",
  "FINALISED",
  "CANONICAL_READBACK",
  "UPDATED",
];

// Minimal shape of genlayer-js's TransactionStatus enum values we care about.
export type RawTxStatus =
  | "PENDING"
  | "PROPOSING"
  | "COMMITTING"
  | "REVEALING"
  | "ACCEPTED"
  | "READY_TO_FINALIZE"
  | "FINALIZED"
  | "UNDETERMINED"
  | "CANCELED"
  | "VALIDATORS_TIMEOUT"
  | "LEADER_TIMEOUT"
  | "APPEAL_REVEALING"
  | "APPEAL_COMMITTING"
  | "UNINITIALIZED";

const TERMINAL_ERROR_STATUSES: RawTxStatus[] = [
  "UNDETERMINED",
  "CANCELED",
  "VALIDATORS_TIMEOUT",
  "LEADER_TIMEOUT",
];

export function mapRawStatusToStep(status: RawTxStatus): TxStep {
  switch (status) {
    case "PENDING":
    case "UNINITIALIZED":
      return "SUBMITTING";
    case "PROPOSING":
      return "LEADER_EXECUTION";
    case "COMMITTING":
    case "REVEALING":
    case "APPEAL_COMMITTING":
    case "APPEAL_REVEALING":
      return "VALIDATOR_REVIEW";
    case "ACCEPTED":
    case "READY_TO_FINALIZE":
      return "CONSENSUS";
    case "FINALIZED":
      return "FINALISED";
    default:
      return "ERROR";
  }
}

export class TxFlowError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "TxFlowError";
  }
}

export class ReadbackMismatchError extends Error {
  constructor(message = "Canonical readback did not match the submitted change.") {
    super(message);
    this.name = "ReadbackMismatchError";
  }
}

/** Known spec error copy for specific write methods, used when a write
 * transaction resolves to a non-success outcome. Falls back to the raw
 * revert message when no canonical mapping applies. */
export const KNOWN_FAILURE_MESSAGES: Record<string, string> = {
  extract_requirements:
    "Requirement extraction did not converge. Existing active set was preserved.",
  assess_provider:
    "Provider assessment failed before consensus. Existing clearance was preserved.",
};

export interface TxHandle {
  hash: string;
  getStatus: () => Promise<RawTxStatus>;
}

export interface RunWriteFlowArgs<T> {
  functionName: string;
  /** Submits the transaction and returns a pollable handle. */
  submit: () => Promise<TxHandle>;
  /** Polls until a terminal (FINALIZED or error) status is reached. */
  pollIntervalMs?: number;
  maxPolls?: number;
  /** Called after FINALIZED — performs the canonical view-method readback. */
  readback: () => Promise<T>;
  /** Returns true if the readback reflects the intended change. */
  verifyReadback: (result: T) => boolean;
  onStep?: (step: TxStep, detail?: { hash?: string }) => void;
}

export async function runWriteFlow<T>(args: RunWriteFlowArgs<T>): Promise<T> {
  const {
    functionName,
    submit,
    readback,
    verifyReadback,
    onStep,
    pollIntervalMs = 400,
    maxPolls = 200,
  } = args;

  const emit = (step: TxStep, detail?: { hash?: string }) => onStep?.(step, detail);

  emit("SUBMITTING");
  let handle: TxHandle;
  try {
    handle = await submit();
  } catch (err) {
    emit("ERROR");
    throw normalizeSubmitError(functionName, err);
  }
  emit("SUBMITTING", { hash: handle.hash });

  let lastStep: TxStep = "SUBMITTING";
  for (let i = 0; i < maxPolls; i++) {
    let status: RawTxStatus;
    try {
      status = await handle.getStatus();
    } catch (err) {
      emit("ERROR");
      throw new TxFlowError("Lost track of the transaction while polling.", err);
    }

    if (TERMINAL_ERROR_STATUSES.includes(status)) {
      emit("ERROR");
      throw new TxFlowError(
        KNOWN_FAILURE_MESSAGES[functionName] ??
          `Transaction did not reach consensus (${status}).`
      );
    }

    const step = mapRawStatusToStep(status);
    if (step !== lastStep) {
      lastStep = step;
      emit(step, { hash: handle.hash });
    }

    if (status === "FINALIZED") {
      // Never report success before the readback below.
      emit("CANONICAL_READBACK", { hash: handle.hash });
      const result = await readback();
      if (!verifyReadback(result)) {
        emit("READBACK_MISMATCH", { hash: handle.hash });
        throw new ReadbackMismatchError();
      }
      emit("UPDATED", { hash: handle.hash });
      return result;
    }

    await sleep(pollIntervalMs);
  }

  emit("ERROR");
  throw new TxFlowError("Timed out waiting for transaction finality.");
}

function normalizeSubmitError(functionName: string, err: unknown): TxFlowError {
  const msg = err instanceof Error ? err.message : String(err);
  if (/user rejected|user denied|rejected the request/i.test(msg)) {
    return new TxFlowError("Signature request was rejected.", err);
  }
  return new TxFlowError(
    KNOWN_FAILURE_MESSAGES[functionName] ?? msg,
    err
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
