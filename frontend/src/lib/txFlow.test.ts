import { describe, expect, it, vi } from "vitest";
import {
  mapRawStatusToStep,
  isExecutionSuccessful,
  runWriteFlow,
  ExecutionRevertedError,
  ReadbackMismatchError,
  TxFlowError,
  TX_STEPS_ORDER,
  type RawExecutionResult,
  type RawTxStatus,
  type TxStep,
} from "./txFlow";

describe("mapRawStatusToStep", () => {
  it("maps every known raw status to a UI step", () => {
    const cases: [RawTxStatus, TxStep][] = [
      ["PENDING", "SUBMITTING"],
      ["UNINITIALIZED", "SUBMITTING"],
      ["PROPOSING", "LEADER_EXECUTION"],
      ["COMMITTING", "VALIDATOR_REVIEW"],
      ["REVEALING", "VALIDATOR_REVIEW"],
      ["APPEAL_COMMITTING", "VALIDATOR_REVIEW"],
      ["APPEAL_REVEALING", "VALIDATOR_REVIEW"],
      ["ACCEPTED", "CONSENSUS"],
      ["READY_TO_FINALIZE", "CONSENSUS"],
      ["FINALIZED", "FINALISED"],
    ];
    for (const [raw, step] of cases) {
      expect(mapRawStatusToStep(raw)).toBe(step);
    }
  });

  it("maps unknown terminal-error statuses to ERROR", () => {
    expect(mapRawStatusToStep("CANCELED")).toBe("ERROR");
    expect(mapRawStatusToStep("UNDETERMINED")).toBe("ERROR");
  });
});

describe("isExecutionSuccessful", () => {
  it("is true only for FINISHED_WITH_RETURN", () => {
    expect(isExecutionSuccessful("FINISHED_WITH_RETURN")).toBe(true);
  });

  it("fails closed for a revert, NOT_VOTED, unknown, or missing values", () => {
    const cases: RawExecutionResult[] = ["FINISHED_WITH_ERROR", "NOT_VOTED", "something_else", undefined, null];
    for (const c of cases) {
      expect(isExecutionSuccessful(c)).toBe(false);
    }
  });
});

function handleWith(statuses: RawTxStatus[], executionResult: RawExecutionResult = "FINISHED_WITH_RETURN") {
  let call = 0;
  return {
    hash: "0xabc",
    getStatus: async () => statuses[Math.min(call++, statuses.length - 1)],
    getExecutionResult: async () => executionResult,
  };
}

describe("runWriteFlow", () => {
  it("never emits UPDATED before a verified canonical readback (happy path)", async () => {
    const steps: TxStep[] = [];
    const statuses: RawTxStatus[] = ["PENDING", "PROPOSING", "ACCEPTED", "FINALIZED"];

    const result = await runWriteFlow<{ ok: boolean }>({
      functionName: "register_work_order",
      submit: async () => handleWith(statuses),
      readback: async () => ({ ok: true }),
      verifyReadback: (r) => r.ok === true,
      pollIntervalMs: 0,
      onStep: (s) => steps.push(s),
    });

    expect(result).toEqual({ ok: true });
    // UPDATED must be the last step emitted, EXECUTION_VERIFIED and
    // CANONICAL_READBACK must precede it in that order.
    expect(steps[steps.length - 1]).toBe("UPDATED");
    expect(steps.indexOf("EXECUTION_VERIFIED")).toBeLessThan(steps.indexOf("CANONICAL_READBACK"));
    expect(steps.indexOf("CANONICAL_READBACK")).toBeLessThan(steps.indexOf("UPDATED"));
    expect(steps.indexOf("FINALISED")).toBeLessThan(steps.indexOf("EXECUTION_VERIFIED"));
  });

  it("REGRESSION: rejects a FINALIZED/ACCEPTED tx whose execution actually reverted (the project's own documented failure mode)", async () => {
    // This is the exact real-world failure recorded in HANDOFF.md: consensus
    // reaches MAJORITY_AGREE/ACCEPTED/FINALIZED, but every validator's
    // execution_result was actually FINISHED_WITH_ERROR. runWriteFlow must
    // NEVER report success in this case.
    const steps: TxStep[] = [];
    await expect(
      runWriteFlow<{ ok: boolean }>({
        functionName: "register_work_order",
        submit: async () => handleWith(["ACCEPTED", "FINALIZED"], "FINISHED_WITH_ERROR"),
        readback: async () => ({ ok: true }),
        verifyReadback: () => true,
        pollIntervalMs: 0,
        onStep: (s) => steps.push(s),
      })
    ).rejects.toBeInstanceOf(ExecutionRevertedError);
    expect(steps).toContain("EXECUTION_REVERTED");
    expect(steps).not.toContain("UPDATED");
    expect(steps).not.toContain("CANONICAL_READBACK");
  });

  it("treats a missing/NOT_VOTED execution result as unproven, not success", async () => {
    await expect(
      runWriteFlow<unknown>({
        functionName: "register_provider",
        submit: async () => handleWith(["FINALIZED"], "NOT_VOTED"),
        readback: async () => ({}),
        verifyReadback: () => true,
        pollIntervalMs: 0,
      })
    ).rejects.toBeInstanceOf(ExecutionRevertedError);
  });

  it("throws ReadbackMismatchError and never resolves when readback disagrees, after execution is verified", async () => {
    await expect(
      runWriteFlow<{ ok: boolean }>({
        functionName: "extract_requirements",
        submit: async () => handleWith(["FINALIZED"]),
        readback: async () => ({ ok: false }),
        verifyReadback: (r) => r.ok === true,
        pollIntervalMs: 0,
      })
    ).rejects.toBeInstanceOf(ReadbackMismatchError);
  });

  it("surfaces the known spec failure message on a terminal consensus-non-convergence status", async () => {
    const steps: TxStep[] = [];
    await expect(
      runWriteFlow<unknown>({
        functionName: "extract_requirements",
        submit: async () => handleWith(["UNDETERMINED"]),
        readback: async () => ({}),
        verifyReadback: () => true,
        pollIntervalMs: 0,
        onStep: (s) => steps.push(s),
      })
    ).rejects.toThrow("Requirement extraction did not converge. Existing active set was preserved.");
    expect(steps).toContain("CONSENSUS_NON_CONVERGENCE");
  });

  it("surfaces the known spec failure message for assess_provider", async () => {
    await expect(
      runWriteFlow<unknown>({
        functionName: "assess_provider",
        submit: async () => handleWith(["VALIDATORS_TIMEOUT"]),
        readback: async () => ({}),
        verifyReadback: () => true,
        pollIntervalMs: 0,
      })
    ).rejects.toThrow("Provider assessment failed before consensus. Existing clearance was preserved.");
  });

  it("normalizes a rejected signature request into WALLET_REJECTED", async () => {
    const steps: TxStep[] = [];
    const submit = vi.fn().mockRejectedValue(new Error("User rejected the request."));
    await expect(
      runWriteFlow<unknown>({
        functionName: "register_provider",
        submit,
        readback: async () => ({}),
        verifyReadback: () => true,
        pollIntervalMs: 0,
        onStep: (s) => steps.push(s),
      })
    ).rejects.toMatchObject({
      message: "Signature request was rejected.",
    });
    expect(submit).toHaveBeenCalledOnce();
    expect(steps).toContain("WALLET_REJECTED");
  });

  it("preserves the tx hash and reports FINALITY_TIMEOUT (not a resubmission) if finality is never reached", async () => {
    const steps: TxStep[] = [];
    const hashes: (string | undefined)[] = [];
    await expect(
      runWriteFlow<unknown>({
        functionName: "register_work_order",
        submit: async () => handleWith(["PENDING"]),
        readback: async () => ({}),
        verifyReadback: () => true,
        pollIntervalMs: 0,
        maxPolls: 3,
        onStep: (s, d) => {
          steps.push(s);
          hashes.push(d?.hash);
        },
      })
    ).rejects.toBeInstanceOf(TxFlowError);
    expect(steps).toContain("FINALITY_TIMEOUT");
    expect(hashes[hashes.length - 1]).toBe("0xabc");
  });

  it("keeps the canonical happy-path step order stable", () => {
    expect(TX_STEPS_ORDER).toEqual([
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
    ]);
  });
});
