// Shared read-error-handling layer used by every contractReads.* call
// (see contract.ts). One consistent policy for every page — no per-page ad
// hoc try/catch that silently converts an RPC failure into "empty state".
//
// Key rule this module exists to enforce: a genuine "this record does not
// exist" result and a "the read itself failed" result must never be
// conflated. `getClearanceAssessment(...).catch(() => null)` (the bug this
// module fixes) turned RPC-unreachable, timeout, and malformed-response
// failures into the same "no assessment" UI state as a legitimate empty
// result — silently hiding real infrastructure failures as data.

export type ReadErrorKind =
  | "RPC_UNREACHABLE"
  | "TIMEOUT"
  | "MALFORMED_RESPONSE"
  | "NOT_FOUND"
  | "CONTRACT_MISMATCH"
  | "UNKNOWN";

export class ReadError extends Error {
  constructor(
    message: string,
    public readonly kind: ReadErrorKind,
    public readonly retryable: boolean,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "ReadError";
  }
}

/** True "not found" — distinct from a failed read. Callers that want to
 * render a neutral empty state (as opposed to a retryable error banner)
 * should catch specifically this class, never every ReadError. */
export class NotFoundError extends ReadError {
  constructor(message = "No record exists for this id.", cause?: unknown) {
    super(message, "NOT_FOUND", false, cause);
    this.name = "NotFoundError";
  }
}

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 600;

function classify(err: unknown): ReadError {
  if (err instanceof ReadError) return err;
  const msg = err instanceof Error ? err.message : String(err);

  // Contract "not found" reverts come back as a normal RPC/contract error
  // whose message names the missing entity — this is a real, legitimate
  // empty result and must be surfaced distinctly from an actual failure.
  if (/not found|does not exist|no such|unknown (work order|provider|assessment|requirement)/i.test(msg)) {
    return new NotFoundError(msg, err);
  }
  if (/timed out|timeout/i.test(msg)) {
    return new ReadError("The request to Studionet timed out.", "TIMEOUT", true, err);
  }
  if (/network|fetch failed|ECONNREFUSED|ENOTFOUND|failed to fetch|NetworkError/i.test(msg)) {
    return new ReadError("Studionet RPC is unreachable right now.", "RPC_UNREACHABLE", true, err);
  }
  if (/unexpected token|json|parse/i.test(msg)) {
    return new ReadError("Studionet returned a malformed response.", "MALFORMED_RESPONSE", true, err);
  }
  if (/invalid_contract|contract mismatch|no code at address/i.test(msg)) {
    return new ReadError(
      "The configured contract address does not match a deployed PermitGrid contract.",
      "CONTRACT_MISMATCH",
      false,
      err
    );
  }
  return new ReadError(msg || "Read failed for an unknown reason.", "UNKNOWN", true, err);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new ReadError("Read timed out.", "TIMEOUT", true));
    }, timeoutMs);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ReadOptions {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
}

/** Wraps a single contract read (or any async operation) with a bounded
 * timeout and controlled retry/backoff for genuinely retryable failures
 * (RPC unreachable, timeout, malformed response, unknown transient). Never
 * retries a NOT_FOUND or CONTRACT_MISMATCH result — those are terminal.
 * Always throws a typed ReadError/NotFoundError on failure — never
 * swallows a failure into a falsy/empty return value. */
export async function readWithErrorHandling<T>(
  fn: () => Promise<T>,
  opts: ReadOptions = {}
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, retries = DEFAULT_RETRIES, retryDelayMs = DEFAULT_RETRY_DELAY_MS } = opts;

  let lastError: ReadError | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await withTimeout(fn(), timeoutMs);
    } catch (err) {
      const classified = classify(err);
      lastError = classified;
      if (!classified.retryable || attempt === retries) {
        throw classified;
      }
      await sleep(retryDelayMs * (attempt + 1));
    }
  }
  // Unreachable, but keeps TypeScript happy.
  throw lastError ?? new ReadError("Read failed.", "UNKNOWN", false);
}
