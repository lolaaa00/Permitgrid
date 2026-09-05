// Thin, typed wrapper around the deployed PermitGrid contract's view/write
// methods, matching contracts/permitgrid.py exactly.

import type { Address } from "genlayer-js/types";
import { getReadClient, getWriteClient, contractAddress, type Eip1193Provider } from "./genlayerClient";
import type {
  WorkOrder,
  RequirementSet,
  Provider,
  CredentialSubmission,
  ClearanceAssessment,
  RegSource,
} from "./types";
import { runWriteFlow, type RawExecutionResult, type RawTxStatus, type TxStep } from "./txFlow";
import { readWithErrorHandling } from "./readClient";

type ReadClient = ReturnType<typeof getReadClient>;
type WriteClient = ReturnType<typeof getWriteClient>;

/** Every read goes through readWithErrorHandling, which distinguishes RPC
 * failure from genuine empty/not-found results and applies bounded
 * timeout+retry (see readClient.ts). `final` requests the canonical
 * final-state variant (TransactionHashVariant.LATEST_FINAL) where the SDK
 * supports it — required for any post-write verification readback. */
async function view<T>(
  client: ReadClient,
  functionName: string,
  args: unknown[] = [],
  opts?: { final?: boolean }
): Promise<T> {
  return readWithErrorHandling(() =>
    client.readContract({
      address: contractAddress(),
      functionName,
      args: args as never,
      ...(opts?.final ? { transactionHashVariant: "latest-final" as never } : {}),
    }) as Promise<T>
  );
}

export const contractReads = {
  listWorkOrders: (client: ReadClient, page = 0, pageSize = 20) =>
    view<WorkOrder[]>(client, "list_work_orders", [page, pageSize]),
  getWorkOrder: (client: ReadClient, workOrderId: string, final = false) =>
    view<WorkOrder>(client, "get_work_order", [workOrderId], { final }),
  getRequirementSet: (client: ReadClient, workOrderId: string, version = 0, final = false) =>
    view<RequirementSet>(client, "get_requirement_set", [workOrderId, version], { final }),
  getRequirementHistory: (client: ReadClient, workOrderId: string) =>
    view<RequirementSet[]>(client, "get_requirement_history", [workOrderId]),
  listProviders: (client: ReadClient, page = 0, pageSize = 20) =>
    view<Provider[]>(client, "list_providers", [page, pageSize]),
  getProvider: (client: ReadClient, providerId: string, final = false) =>
    view<Provider>(client, "get_provider", [providerId], { final }),
  getCredentialSubmission: (client: ReadClient, providerId: string, version = 0) =>
    view<CredentialSubmission>(client, "get_credential_submission", [providerId, version]),
  getClearanceState: (client: ReadClient, workOrderId: string, providerId: string) =>
    view<string>(client, "get_clearance_state", [workOrderId, providerId]),
  isProviderCleared: (
    client: ReadClient,
    workOrderId: string,
    providerId: string,
    expectedRequirementVersion: number,
    expectedCredentialVersion: number
  ) =>
    view<boolean>(client, "is_provider_cleared", [
      workOrderId,
      providerId,
      expectedRequirementVersion,
      expectedCredentialVersion,
    ]),
  getClearanceAssessment: (
    client: ReadClient,
    workOrderId: string,
    providerId: string,
    assessmentId = 0,
    final = false
  ) =>
    view<ClearanceAssessment>(
      client,
      "get_clearance_assessment",
      [workOrderId, providerId, assessmentId],
      { final }
    ),
  getClearanceHistory: (client: ReadClient, workOrderId: string, providerId: string) =>
    view<ClearanceAssessment[]>(client, "get_clearance_history", [workOrderId, providerId]),
};

export interface WriteWorkOrderInput {
  work_order_id: string;
  title: string;
  category: string;
  jurisdiction: string;
  exact_scope: string;
  environment: string;
  role: string;
  sources: RegSource[];
}

// Live-QA finding: genlayer-js@1.1.8's `getTransaction()` returns a
// DIFFERENT shape depending on the target network. For Studionet/localnet
// (`client.chain.isStudio === true`, which is what this project always
// targets), the raw JSON-RPC transaction is returned close to as-is:
// `.status` is a NUMBER (the string name is on the separate `.statusName`
// field), and `.txExecutionResultName` is never populated at all — that
// field is only computed on the non-studio ("mainnet"-shaped) code path.
// The real per-validator execution outcome for a studio transaction lives
// at `consensus_data.leader_receipt[].execution_result`, using the string
// vocabulary `"SUCCESS"` / `"ERROR"` (confirmed directly via `genlayer
// receipt` against this project's own live transactions — see
// HANDOFF.md), NOT the mainnet-path enum names `FINISHED_WITH_RETURN` /
// `FINISHED_WITH_ERROR`. Reading the wrong fields silently treated every
// genuinely successful real browser-wallet write as unverified. These two
// helpers read whichever shape is actually present.
function extractStatus(tx: unknown): RawTxStatus {
  const t = tx as { statusName?: string; status?: unknown };
  return (t.statusName ?? String(t.status)) as RawTxStatus;
}

function extractExecutionResult(tx: unknown): RawExecutionResult {
  const t = tx as {
    txExecutionResultName?: RawExecutionResult;
    consensus_data?: { leader_receipt?: { execution_result?: string } | { execution_result?: string }[] };
  };
  if (t.txExecutionResultName !== undefined) return t.txExecutionResultName;
  const receipt = t.consensus_data?.leader_receipt;
  const first = Array.isArray(receipt) ? receipt[0] : receipt;
  return first?.execution_result;
}

interface RunWriteOptions<T> {
  writeClient: WriteClient;
  account: Address;
  functionName: string;
  args: unknown[];
  readback: () => Promise<T>;
  verifyReadback: (result: T) => boolean;
  onStep?: (step: TxStep, detail?: { hash?: string }) => void;
}

async function runContractWrite<T>(opts: RunWriteOptions<T>): Promise<T> {
  const { writeClient, account, functionName, args, readback, verifyReadback, onStep } = opts;
  return runWriteFlow<T>({
    functionName,
    onStep,
    submit: async () => {
      // IMPORTANT: pass the write client's own (already-normalized) account,
      // not the raw address string again. `getWriteClient` configures the
      // client with `account: <string>`, and viem's `createClient` parses
      // that into `{ address, type: "json-rpc" }` at construction time. If a
      // raw string is passed a second time here, genlayer-js's
      // `writeContract` (`senderAccount = account || client.account`) takes
      // this unnormalized string over the properly-parsed `client.account`,
      // and its `senderAccount.address` access on a plain string is
      // `undefined` — producing exactly the confirmed live bug
      // (`Address "undefined" is invalid`) on every real browser-wallet
      // write, independent of wallet choice or rejection. Confirmed by
      // reading genlayer-js@1.1.8's actual `writeContract`/`validateAccount`
      // source and reproducing the normalization directly against the
      // installed viem version. `account` is still required in this
      // function's signature (and checked against `writeClient.account`) so
      // a mismatched/stale client can never silently sign as the wrong
      // address.
      if (writeClient.account && (writeClient.account as { address?: string }).address?.toLowerCase() !== account.toLowerCase()) {
        throw new Error("Write client account does not match the connected wallet address.");
      }
      const hash = (await writeClient.writeContract({
        address: contractAddress(),
        functionName,
        args: args as never,
        value: BigInt(0),
      })) as string;
      return {
        hash,
        getStatus: async () => {
          const tx = await writeClient.getTransaction({ hash: hash as never });
          return extractStatus(tx);
        },
        // The real, load-bearing check: genlayer-js exposes the actual
        // per-transaction execution outcome — distinct from, and NOT implied
        // by, consensus status. This is what must be checked before ever
        // showing success (see txFlow.ts and extractExecutionResult below).
        getExecutionResult: async () => {
          const tx = await writeClient.getTransaction({ hash: hash as never });
          return extractExecutionResult(tx);
        },
      };
    },
    readback,
    verifyReadback,
  });
}

export const contractWrites = {
  registerWorkOrder: (
    writeClient: WriteClient,
    account: Address,
    input: WriteWorkOrderInput,
    onStep?: RunWriteOptions<WorkOrder>["onStep"]
  ) =>
    runContractWrite<WorkOrder>({
      writeClient,
      account,
      functionName: "register_work_order",
      args: [
        input.work_order_id,
        input.title,
        input.category,
        input.jurisdiction,
        input.exact_scope,
        input.environment,
        input.role,
        input.sources,
      ],
      readback: () => contractReads.getWorkOrder(getReadClient(), input.work_order_id, true),
      verifyReadback: (wo) => wo.work_order_id === input.work_order_id,
      onStep,
    }),

  updateRegulatorySources: (
    writeClient: WriteClient,
    account: Address,
    workOrderId: string,
    sources: RegSource[],
    expectedSourceVersion: number,
    onStep?: RunWriteOptions<WorkOrder>["onStep"]
  ) =>
    runContractWrite<WorkOrder>({
      writeClient,
      account,
      functionName: "update_regulatory_sources",
      args: [workOrderId, sources],
      readback: () => contractReads.getWorkOrder(getReadClient(), workOrderId, true),
      verifyReadback: (wo) => wo.source_version > expectedSourceVersion,
      onStep,
    }),

  extractRequirements: (
    writeClient: WriteClient,
    account: Address,
    workOrderId: string,
    expectedRequirementVersion: number,
    onStep?: RunWriteOptions<RequirementSet>["onStep"]
  ) =>
    runContractWrite<RequirementSet>({
      writeClient,
      account,
      functionName: "extract_requirements",
      args: [workOrderId],
      readback: () => contractReads.getRequirementSet(getReadClient(), workOrderId, 0, true),
      verifyReadback: (rs) => rs.version > expectedRequirementVersion,
      onStep,
    }),

  registerProvider: (
    writeClient: WriteClient,
    account: Address,
    providerId: string,
    name: string,
    onStep?: RunWriteOptions<Provider>["onStep"]
  ) =>
    runContractWrite<Provider>({
      writeClient,
      account,
      functionName: "register_provider",
      args: [providerId, name],
      readback: () => contractReads.getProvider(getReadClient(), providerId, true),
      verifyReadback: (p) => p.provider_id === providerId,
      onStep,
    }),

  createCredentialSubmission: (
    writeClient: WriteClient,
    account: Address,
    providerId: string,
    sources: RegSource[],
    expectedVersion: number,
    onStep?: RunWriteOptions<Provider>["onStep"]
  ) =>
    runContractWrite<Provider>({
      writeClient,
      account,
      functionName: "create_credential_submission",
      args: [providerId, sources],
      readback: () => contractReads.getProvider(getReadClient(), providerId, true),
      verifyReadback: (p) => p.credential_version > expectedVersion,
      onStep,
    }),

  updateCredentials: (
    writeClient: WriteClient,
    account: Address,
    providerId: string,
    sources: RegSource[],
    expectedVersion: number,
    onStep?: RunWriteOptions<Provider>["onStep"]
  ) =>
    runContractWrite<Provider>({
      writeClient,
      account,
      functionName: "update_credentials",
      args: [providerId, sources],
      readback: () => contractReads.getProvider(getReadClient(), providerId, true),
      verifyReadback: (p) => p.credential_version > expectedVersion,
      onStep,
    }),

  assessProvider: (
    writeClient: WriteClient,
    account: Address,
    workOrderId: string,
    providerId: string,
    expectedAssessmentId: number,
    onStep?: RunWriteOptions<ClearanceAssessment>["onStep"]
  ) =>
    runContractWrite<ClearanceAssessment>({
      writeClient,
      account,
      functionName: "assess_provider",
      args: [workOrderId, providerId],
      readback: () => contractReads.getClearanceAssessment(getReadClient(), workOrderId, providerId, 0, true),
      verifyReadback: (c) => c.assessment_id > expectedAssessmentId,
      onStep,
    }),
};

export type { Eip1193Provider };
