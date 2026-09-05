// Write-transaction progress state machine, kept framework-free so it can be
// unit tested without React or a real wallet. Models the GenLayer write
// lifecycle as discrete stages:
//
//   SUBMITTING -> LEADER_EXECUTION -> VALIDATOR_REVIEW -> CONSENSUS
//   -> FINALISED -> EXECUTION_VERIFIED -> CANONICAL_READBACK -> UPDATED
//
// CRITICAL, hard-won lesson (see HANDOFF.md sessions 2-3): consensus
// acceptance (`MAJORITY_AGREE` / `ACCEPTED` / `FINALIZED`) is NOT proof of a
// successful write. This project has repeatedly observed transactions reach
// `FINALIZED` while every validator's `execution_result` was actually
// `FINISHED_WITH_ERROR` (a revert) — a "MAJORITY_AGREE" here can mean "all
// validators agree the call reverts". So after finality this flow ALWAYS
// fetches the real execution result (via genlayer-js's `getTransaction` /
// `txExecutionResultName`, mirroring the CLI's `execution_result` field) and
// requires it to be a successful outcome (`FINISHED_WITH_RETURN`) BEFORE
// doing the canonical readback. Only after both (a) execution success and
// (b) a canonical, final-state readback confirms the intended mutation do we
// report `UPDATED`.

export type TxStep =
  | "IDLE"
  | "WALLET_REQUEST"
  | "SUBMITTING"
  | "SUBMITTED"
  | "LEADER_EXECUTION"
  | "VALIDATOR_REVIEW"
  | "CONSENSUS"
  | "FINALIZING"
  | "FINALISED"
  | "EXECUTION_VERIFIED"
  | "CANONICAL_READBACK"
  | "UPDATED"
  | "ERROR"
  | "WALLET_REJECTED"
  | "EXECUTION_REVERTED"
  | "CONSENSUS_NON_CONVERGENCE"
  | "RPC_ERROR"
  | "FINALITY_TIMEOUT"
  | "READBACK_MISMATCH";

export const TX_STEPS_ORDER: TxStep[] = [
  "WALLET_REQUEST",
  "SUBMITTING",
  "SUBMITTED",
  "LEADER_EXECUTION",
  "VALIDATOR_REVIEW",
  "CONSENSUS",
  "FINALISED",
  "EXECUTION_VERIFIED",
  "CANONICAL_READBACK",
  "UPDATED",
];

export const TX_FAILURE_STEPS: TxStep[] = [
  "ERROR",
  "WALLET_REJECTED",
  "EXECUTION_REVERTED",
  "CONSENSUS_NON_CONVERGENCE",
  "RPC_ERROR",
  "FINALITY_TIMEOUT",
  "READBACK_MISMATCH",
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

// Mirrors the real execution-outcome values genlayer-js/the GenLayer RPC
// actually use. There are two vocabularies depending on network shape:
// the mainnet-path `txExecutionResultName` enum (NOT_VOTED /
// FINISHED_WITH_RETURN / FINISHED_WITH_ERROR), and the Studionet/localnet
// `leader_receipt[].execution_result` string ("SUCCESS" / "ERROR"), which
// is what this project's live transactions actually return (confirmed via
// `genlayer receipt` — see HANDOFF.md). Both are handled since which one is
// present depends on `client.chain.isStudio` (see contract.ts's
// extractExecutionResult). This is the ONLY thing that tells us whether the
// contract call itself succeeded or reverted — consensus status alone
// (ACCEPTED/FINALIZED) does not.
export type RawExecutionResult =
  | "NOT_VOTED"
  | "FINISHED_WITH_RETURN"
  | "FINISHED_WITH_ERROR"
  | "SUCCESS"
  | "ERROR"
  | string // tolerate unknown/future values defensively
  | undefined
  | null;

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

/** True only for a genuinely successful contract execution. Anything else
 * (including "NOT_VOTED", "ERROR", unknown values, or missing data) is
 * treated as NOT proven successful — fail closed. Accepts both the
 * mainnet-path and Studionet-path success values (see RawExecutionResult). */
export function isExecutionSuccessful(result: RawExecutionResult): boolean {
  return result === "FINISHED_WITH_RETURN" || result === "SUCCESS";
}

export class TxFlowError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "TxFlowError";
  }
}

export class ExecutionRevertedError extends TxFlowError {
  constructor(message: string, public readonly executionResult?: RawExecutionResult, cause?: unknown) {
    super(message, cause);
    this.name = "ExecutionRevertedError";
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
  /** Fetches the real execution outcome for this tx (post-finality). Must
   * reflect the underlying validator execution result, not just the
   * consensus status. */
  getExecutionResult: () => Promise<RawExecutionResult>;
}

export interface RunWriteFlowArgs<T> {
  functionName: string;
  /** Submits the transaction and returns a pollable handle. */
  submit: () => Promise<TxHandle>;
  /** Polls until a terminal (FINALIZED or error) status is reached. */
  pollIntervalMs?: number;
  maxPolls?: number;
  /** Called after execution is verified successful — performs the canonical
   * final-state view-method readback. */
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

  emit("WALLET_REQUEST");
  emit("SUBMITTING");
  let handle: TxHandle;
  try {
    handle = await submit();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/user rejected|user denied|rejected the request/i.test(msg)) {
      emit("WALLET_REJECTED");
      throw new TxFlowError("Signature request was rejected.", err);
    }
    emit("ERROR");
    throw normalizeSubmitError(functionName, err);
  }
  emit("SUBMITTED", { hash: handle.hash });

  let lastStep: TxStep = "SUBMITTED";
  for (let i = 0; i < maxPolls; i++) {
    let status: RawTxStatus;
    try {
      status = await handle.getStatus();
    } catch (err) {
      emit("RPC_ERROR", { hash: handle.hash });
      throw new TxFlowError("Lost track of the transaction while polling (RPC error).", err);
    }

    if (TERMINAL_ERROR_STATUSES.includes(status)) {
      emit("CONSENSUS_NON_CONVERGENCE", { hash: handle.hash });
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
      // Finality alone is NOT success — verify the real execution result
      // before doing anything else. This is the single most important
      // check in this flow (see module docstring / HANDOFF.md history).
      let executionResult: RawExecutionResult;
      try {
        executionResult = await handle.getExecutionResult();
      } catch (err) {
        emit("RPC_ERROR", { hash: handle.hash });
        throw new TxFlowError("Failed to read the transaction's execution result.", err);
      }

      if (!isExecutionSuccessful(executionResult)) {
        emit("EXECUTION_REVERTED", { hash: handle.hash });
        throw new ExecutionRevertedError(
          KNOWN_FAILURE_MESSAGES[functionName] ??
            `Transaction finalized but execution did not succeed (${executionResult ?? "unknown"}).`,
          executionResult
        );
      }
      emit("EXECUTION_VERIFIED", { hash: handle.hash });

      // Never report success before the canonical final-state readback below.
      emit("CANONICAL_READBACK", { hash: handle.hash });
      let result: T;
      try {
        result = await readback();
      } catch (err) {
        emit("RPC_ERROR", { hash: handle.hash });
        throw new TxFlowError("Canonical readback failed after a verified successful execution.", err);
      }
      if (!verifyReadback(result)) {
        emit("READBACK_MISMATCH", { hash: handle.hash });
        throw new ReadbackMismatchError();
      }
      emit("UPDATED", { hash: handle.hash });
      return result;
    }

    await sleep(pollIntervalMs);
  }

  emit("FINALITY_TIMEOUT", { hash: handle.hash });
  throw new TxFlowError(
    "Timed out waiting for transaction finality. The transaction hash is preserved — check the explorer rather than resubmitting."
  );
}

function normalizeSubmitError(functionName: string, err: unknown): TxFlowError {
  const msg = err instanceof Error ? err.message : String(err);
  return new TxFlowError(
    KNOWN_FAILURE_MESSAGES[functionName] ?? msg,
    err
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
