import { describe, expect, it, vi } from "vitest";
import {
  mapRawStatusToStep,
  runWriteFlow,
  ReadbackMismatchError,
  TxFlowError,
  TX_STEPS_ORDER,
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

describe("runWriteFlow", () => {
  it("never emits UPDATED before a verified canonical readback (happy path)", async () => {
    const steps: TxStep[] = [];
    const statuses: RawTxStatus[] = ["PENDING", "PROPOSING", "ACCEPTED", "FINALIZED"];
    let call = 0;

    const result = await runWriteFlow<{ ok: boolean }>({
      functionName: "register_work_order",
      submit: async () => ({
        hash: "0xabc",
        getStatus: async () => statuses[Math.min(call++, statuses.length - 1)],
      }),
      readback: async () => ({ ok: true }),
      verifyReadback: (r) => r.ok === true,
      pollIntervalMs: 0,
      onStep: (s) => steps.push(s),
    });

    expect(result).toEqual({ ok: true });
    // UPDATED must be the last step emitted, and CANONICAL_READBACK must precede it.
    expect(steps[steps.length - 1]).toBe("UPDATED");
    expect(steps.indexOf("CANONICAL_READBACK")).toBeLessThan(steps.indexOf("UPDATED"));
    expect(steps.indexOf("FINALISED")).toBeLessThan(steps.indexOf("CANONICAL_READBACK"));
  });

  it("throws ReadbackMismatchError and never resolves when readback disagrees", async () => {
    await expect(
      runWriteFlow<{ ok: boolean }>({
        functionName: "extract_requirements",
        submit: async () => ({
          hash: "0xabc",
          getStatus: async () => "FINALIZED" as RawTxStatus,
        }),
        readback: async () => ({ ok: false }),
        verifyReadback: (r) => r.ok === true,
        pollIntervalMs: 0,
      })
    ).rejects.toBeInstanceOf(ReadbackMismatchError);
  });

  it("surfaces the known spec failure message on a terminal error status", async () => {
    await expect(
      runWriteFlow<unknown>({
        functionName: "extract_requirements",
        submit: async () => ({
          hash: "0xabc",
          getStatus: async () => "UNDETERMINED" as RawTxStatus,
        }),
        readback: async () => ({}),
        verifyReadback: () => true,
        pollIntervalMs: 0,
      })
    ).rejects.toThrow("Requirement extraction did not converge. Existing active set was preserved.");
  });

  it("surfaces the known spec failure message for assess_provider", async () => {
    await expect(
      runWriteFlow<unknown>({
        functionName: "assess_provider",
        submit: async () => ({
          hash: "0xabc",
          getStatus: async () => "VALIDATORS_TIMEOUT" as RawTxStatus,
        }),
        readback: async () => ({}),
        verifyReadback: () => true,
        pollIntervalMs: 0,
      })
    ).rejects.toThrow("Provider assessment failed before consensus. Existing clearance was preserved.");
  });

  it("normalizes a rejected signature request into a TxFlowError", async () => {
    const submit = vi.fn().mockRejectedValue(new Error("User rejected the request."));
    await expect(
      runWriteFlow<unknown>({
        functionName: "register_provider",
        submit,
        readback: async () => ({}),
        verifyReadback: () => true,
        pollIntervalMs: 0,
      })
    ).rejects.toMatchObject({
      message: "Signature request was rejected.",
    });
    expect(submit).toHaveBeenCalledOnce();
  });

  it("times out safely (retry-safe) if finality is never reached", async () => {
    await expect(
      runWriteFlow<unknown>({
        functionName: "register_work_order",
        submit: async () => ({
          hash: "0xabc",
          getStatus: async () => "PENDING" as RawTxStatus,
        }),
        readback: async () => ({}),
        verifyReadback: () => true,
        pollIntervalMs: 0,
        maxPolls: 3,
      })
    ).rejects.toBeInstanceOf(TxFlowError);
  });

  it("keeps the canonical step order stable", () => {
    expect(TX_STEPS_ORDER).toEqual([
      "SUBMITTING",
      "LEADER_EXECUTION",
      "VALIDATOR_REVIEW",
      "CONSENSUS",
      "FINALISED",
      "CANONICAL_READBACK",
      "UPDATED",
    ]);
  });
});
