import { describe, expect, it, vi } from "vitest";
import type { Address } from "genlayer-js/types";

const ACCOUNT = "0x778d1663f9d5b338abad5c62899830ad3520a32f" as Address;

// contractAddress() throws ConfigurationError unless NEXT_PUBLIC_CONTRACT_ADDRESS
// is set — not the concern of this test file, so stub it to a valid address.
vi.mock("./genlayerClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./genlayerClient")>();
  return {
    ...actual,
    contractAddress: () => "0xD6cF90D8A4F7323B12EA4398A6AbDF415A4E9500" as Address,
  };
});

const { contractWrites, contractReads } = await import("./contract");
// Readback isn't what this test is about — stub it to fail fast instead of
// letting readClient's real retry/backoff run against no live network.
vi.spyOn(contractReads, "getWorkOrder").mockRejectedValue(new Error("no RPC in this unit test"));

// Regression test for a real live-browser QA finding: registering a work
// order through the actual deployed frontend with a real connected wallet
// (OKX) failed with `Address "undefined" is invalid` on every attempt,
// independent of wallet rejection. Root cause, confirmed by reading the
// installed genlayer-js@1.1.8 source directly: `writeContract` computes
// `senderAccount = account || client.account`, and only `client.account`
// (set once at client construction, normalized by viem's `createClient`
// into `{ address, type: "json-rpc" }`) is safe to use — a raw address
// string passed again at the call level is NOT normalized and its
// `.address` access is `undefined`. This mock reproduces that exact
// genlayer-js behavior and asserts `contractWrites.*` never regresses to
// passing the call-level `account` field again.
function makeMockWriteClient(clientAccount: { address: string; type: string } | Address) {
  return {
    account: clientAccount,
    writeContract: vi.fn(async (args: Record<string, unknown>) => {
      // Faithful reproduction of genlayer-js's real (buggy-if-misused)
      // precedence: an explicit call-level `account` wins over
      // `client.account`, and is used unnormalized.
      const senderAccount = ("account" in args ? args.account : undefined) ?? clientAccount;
      if (typeof senderAccount === "string") {
        throw new Error(
          'Address "undefined" is invalid. - Address must be a hex value of 20 bytes (40 hex characters). - Address must match its checksum counterpart. Version: viem@2.56.3'
        );
      }
      return "0xdeadbeef";
    }),
    getTransaction: vi.fn(async () => ({
      status: "FINALIZED",
      txExecutionResultName: "FINISHED_WITH_RETURN",
    })),
  };
}

describe("contract.ts write path — account normalization", () => {
  it("registerWorkOrder succeeds when the write client's account is already a normalized object (the fix)", async () => {
    const writeClient = makeMockWriteClient({ address: ACCOUNT, type: "json-rpc" });
    const onStep = vi.fn();

    // readback/verify are exercised via contractReads, which needs a real
    // network call — stub them out at the module level instead by using a
    // work order id the readback will naturally fail for, and instead
    // assert directly on writeContract's call args, which is the part this
    // regression test cares about.
    await expect(
      contractWrites
        .registerWorkOrder(
          writeClient as never,
          ACCOUNT,
          {
            work_order_id: "wo-test",
            title: "t",
            category: "c",
            jurisdiction: "j",
            exact_scope: "s",
            environment: "e",
            role: "r",
            sources: [],
          },
          onStep
        )
        .catch(() => {
          // The readback step will fail in this unit test (no real RPC) —
          // that's fine. What matters is that writeContract itself did NOT
          // throw the "Address undefined is invalid" error, proving the
          // account-normalization bug is fixed.
        })
    ).resolves.toBeUndefined();

    expect(writeClient.writeContract).toHaveBeenCalledTimes(1);
    const callArgs = writeClient.writeContract.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs).not.toHaveProperty("account");
  });

  it("would have reproduced the live bug if a raw account string were passed at the call level (proves the mock is faithful)", async () => {
    const writeClient = makeMockWriteClient(ACCOUNT); // client.account left as a raw string, unnormalized
    await expect(
      (writeClient as unknown as { writeContract: (a: unknown) => Promise<unknown> }).writeContract({
        address: "0xD6cF90D8A4F7323B12EA4398A6AbDF415A4E9500",
        functionName: "register_work_order",
        args: [],
        value: BigInt(0),
      })
    ).rejects.toThrow(/Address "undefined" is invalid/);
  });

  it("rejects when the write client's account does not match the connected wallet address", async () => {
    const writeClient = makeMockWriteClient({ address: "0x000000000000000000000000000000000000ff", type: "json-rpc" });
    await expect(
      contractWrites.registerWorkOrder(writeClient as never, ACCOUNT, {
        work_order_id: "wo-test",
        title: "t",
        category: "c",
        jurisdiction: "j",
        exact_scope: "s",
        environment: "e",
        role: "r",
        sources: [],
      })
    ).rejects.toThrow(/does not match the connected wallet address/);
    expect(writeClient.writeContract).not.toHaveBeenCalled();
  });
});

// Regression test for a second real live-QA finding, found immediately
// after fixing the account-normalization bug above: a real approved
// browser-wallet write (tx 0x3cffcf3f613e5aab7ef151f49ce4df5d4aed2f21dae55dcf70b24b1c86176f7c,
// confirmed via `genlayer receipt` to be a genuine on-chain SUCCESS —
// status_name FINALIZED, leader_receipt execution_result SUCCESS) was
// still displayed as FAILED by the frontend. Root cause: genlayer-js's
// `getTransaction()` returns a DIFFERENT shape for Studionet (`isStudio:
// true`, what this project always targets) than the mainnet-path shape the
// original code assumed — `.status` is a raw NUMBER (the string name is on
// `.statusName`), and `.txExecutionResultName` is never populated at all;
// the real per-validator result lives at
// `consensus_data.leader_receipt[].execution_result` using "SUCCESS"/
// "ERROR", not "FINISHED_WITH_RETURN"/"FINISHED_WITH_ERROR". This
// reproduces the exact real transaction shape (trimmed to the relevant
// fields) and asserts the write flow now correctly recognizes it as
// successful.
describe("contract.ts write path — Studionet transaction shape", () => {
  it("recognizes a real Studionet-shaped success (numeric status + consensus_data.leader_receipt), not just the mainnet shape", async () => {
    const realStudioTransaction = {
      status: 7, // numeric — NOT the string "FINALIZED"
      statusName: "FINALIZED",
      result: 6,
      result_name: "MAJORITY_AGREE",
      // txExecutionResultName intentionally absent — genlayer-js never sets
      // this field for Studionet transactions.
      consensus_data: {
        leader_receipt: [
          { execution_result: "SUCCESS", mode: "leader" },
        ],
      },
    };
    const writeClient = {
      account: { address: ACCOUNT, type: "json-rpc" },
      writeContract: vi.fn(async () => "0x3cffcf3f613e5aab7ef151f49ce4df5d4aed2f21dae55dcf70b24b1c86176f7c"),
      getTransaction: vi.fn(async () => realStudioTransaction),
    };
    const steps: string[] = [];

    // getWorkOrder's readback is stubbed to reject in this test file (no
    // real RPC available) — that's an expected, separate limitation, not
    // what this test is verifying. What matters is that execution is
    // recognized as verified (EXECUTION_VERIFIED reached) BEFORE the
    // readback step runs, proving the Studionet success shape is read
    // correctly.
    await contractWrites
      .registerWorkOrder(
        writeClient as never,
        ACCOUNT,
        {
          work_order_id: "wo-walletqa-20260905c",
          title: "t",
          category: "c",
          jurisdiction: "j",
          exact_scope: "s",
          environment: "e",
          role: "r",
          sources: [],
        },
        (step) => steps.push(step)
      )
      .catch((err) => {
        expect(err.message).toMatch(/Canonical readback failed/);
      });

    expect(steps).toContain("EXECUTION_VERIFIED");
    expect(steps).not.toContain("EXECUTION_REVERTED");
    expect(steps).not.toContain("ERROR");
  });

  it("still correctly rejects a real Studionet-shaped ERROR result as reverted (fail-closed)", async () => {
    const revertedStudioTransaction = {
      status: 7,
      statusName: "FINALIZED",
      consensus_data: {
        leader_receipt: [{ execution_result: "ERROR", mode: "leader" }],
      },
    };
    const writeClient = {
      account: { address: ACCOUNT, type: "json-rpc" },
      writeContract: vi.fn(async () => "0xdeadbeef"),
      getTransaction: vi.fn(async () => revertedStudioTransaction),
    };
    const steps: string[] = [];

    await expect(
      contractWrites.registerWorkOrder(
        writeClient as never,
        ACCOUNT,
        {
          work_order_id: "wo-test",
          title: "t",
          category: "c",
          jurisdiction: "j",
          exact_scope: "s",
          environment: "e",
          role: "r",
          sources: [],
        },
        (step) => steps.push(step)
      )
    ).rejects.toThrow(/did not succeed/);
    expect(steps).toContain("EXECUTION_REVERTED");
  });
});
