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
import { runWriteFlow, type RawTxStatus, type TxStep } from "./txFlow";

type ReadClient = ReturnType<typeof getReadClient>;
type WriteClient = ReturnType<typeof getWriteClient>;

async function view<T>(client: ReadClient, functionName: string, args: unknown[] = []): Promise<T> {
  return client.readContract({
    address: contractAddress(),
    functionName,
    args: args as never,
  }) as Promise<T>;
}

export const contractReads = {
  listWorkOrders: (client: ReadClient, page = 0, pageSize = 20) =>
    view<WorkOrder[]>(client, "list_work_orders", [page, pageSize]),
  getWorkOrder: (client: ReadClient, workOrderId: string) =>
    view<WorkOrder>(client, "get_work_order", [workOrderId]),
  getRequirementSet: (client: ReadClient, workOrderId: string, version = 0) =>
    view<RequirementSet>(client, "get_requirement_set", [workOrderId, version]),
  getRequirementHistory: (client: ReadClient, workOrderId: string) =>
    view<RequirementSet[]>(client, "get_requirement_history", [workOrderId]),
  listProviders: (client: ReadClient, page = 0, pageSize = 20) =>
    view<Provider[]>(client, "list_providers", [page, pageSize]),
  getProvider: (client: ReadClient, providerId: string) =>
    view<Provider>(client, "get_provider", [providerId]),
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
    assessmentId = 0
  ) => view<ClearanceAssessment>(client, "get_clearance_assessment", [workOrderId, providerId, assessmentId]),
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
      const hash = (await writeClient.writeContract({
        account: account as never,
        address: contractAddress(),
        functionName,
        args: args as never,
        value: BigInt(0),
      })) as string;
      return {
        hash,
        getStatus: async () => {
          const tx = await writeClient.getTransaction({ hash: hash as never });
          return (tx as unknown as { status: RawTxStatus }).status;
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
      readback: () => contractReads.getWorkOrder(getReadClient(), input.work_order_id),
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
      readback: () => contractReads.getWorkOrder(getReadClient(), workOrderId),
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
      readback: () => contractReads.getRequirementSet(getReadClient(), workOrderId, 0),
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
      readback: () => contractReads.getProvider(getReadClient(), providerId),
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
      readback: () => contractReads.getProvider(getReadClient(), providerId),
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
      readback: () => contractReads.getProvider(getReadClient(), providerId),
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
      readback: () => contractReads.getClearanceAssessment(getReadClient(), workOrderId, providerId, 0),
      verifyReadback: (c) => c.assessment_id > expectedAssessmentId,
      onStep,
    }),
};

export type { Eip1193Provider };
