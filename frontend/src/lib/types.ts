// Data shapes mirroring contracts/permitgrid.py view/write return values.
// Kept intentionally close to the on-chain dict shapes so the UI layer does
// no silent re-interpretation of contract state.

export type SourceRole =
  | "LICENSING_AUTHORITY"
  | "PROFESSIONAL_REGULATOR"
  | "COMPANY_REGISTRY_RULES"
  | "TECHNICAL_REGULATION"
  | "SAFETY_AUTHORITY"
  | "JURISDICTION_RULE"
  | "OTHER";

export const SOURCE_ROLES: SourceRole[] = [
  "LICENSING_AUTHORITY",
  "PROFESSIONAL_REGULATOR",
  "COMPANY_REGISTRY_RULES",
  "TECHNICAL_REGULATION",
  "SAFETY_AUTHORITY",
  "JURISDICTION_RULE",
  "OTHER",
];

export type CredentialRole =
  | "LICENCE_REGISTRY"
  | "PROFESSIONAL_REGISTER"
  | "COMPANY_REGISTER"
  | "ENDORSEMENT_REGISTER"
  | "CERTIFICATION_REGISTER"
  | "PUBLIC_PROVIDER_PROFILE"
  | "OTHER";

export const CREDENTIAL_ROLES: CredentialRole[] = [
  "LICENCE_REGISTRY",
  "PROFESSIONAL_REGISTER",
  "COMPANY_REGISTER",
  "ENDORSEMENT_REGISTER",
  "CERTIFICATION_REGISTER",
  "PUBLIC_PROVIDER_PROFILE",
  "OTHER",
];

export type RequirementType =
  | "LICENCE_CLASS"
  | "LICENCE_STATUS"
  | "PROFESSIONAL_REGISTRATION"
  | "COMPANY_REGISTRATION"
  | "SPECIAL_ENDORSEMENT"
  | "JURISDICTION_MATCH"
  | "SUPERVISION"
  | "EQUIPMENT_CAPACITY_CLASS"
  | "OTHER";

export type AssessmentResult =
  | "PASS"
  | "PARTIAL"
  | "FAIL"
  | "INSUFFICIENT_EVIDENCE"
  | "NOT_APPLICABLE"
  | "CONFLICTING_EVIDENCE";

export type ClearanceState =
  | "SUBMITTED"
  | "UNASSESSED"
  | "CLEARED"
  | "SUPERVISION_REQUIRED"
  | "ADDITIONAL_CREDENTIAL_REQUIRED"
  | "OUT_OF_SCOPE"
  | "EXPIRED_OR_INACTIVE"
  | "INSUFFICIENT_EVIDENCE"
  | "REGULATORY_CONFLICT"
  | "STALE";

export type WorkOrderStatus =
  | "REGISTERED"
  | "NEEDS_REQUIREMENTS"
  | "REQUIREMENTS_ACTIVE";

export interface RegSource {
  url: string;
  role: string;
}

export interface WorkOrder {
  work_order_id: string;
  ref: string;
  title: string;
  category: string;
  jurisdiction: string;
  exact_scope: string;
  environment: string;
  role: string;
  creator: string;
  status: WorkOrderStatus | string;
  source_version: number;
  requirement_version: number;
  created_at: string;
  sources: RegSource[];
}

export interface Requirement {
  requirement_id: string;
  type: RequirementType | string;
  mandatory: boolean;
  target_value: string;
  scope_summary: string;
  verification_target: string;
}

export interface RequirementSet {
  version: number;
  source_version: number;
  created_at: string;
  requirements: Requirement[];
}

export interface Provider {
  provider_id: string;
  name: string;
  creator: string;
  credential_version: number;
  created_at: string;
  credential_sources: RegSource[];
}

export interface CredentialSubmission {
  version: number;
  created_at: string;
  sources: RegSource[];
}

export interface AssessmentItem {
  requirement_id: string;
  result: AssessmentResult | string;
  reason_code: string;
  evidence_state: string;
  evidence_reference: string;
}

export interface ClearanceAssessment {
  assessment_id: number;
  work_order_id: string;
  provider_id: string;
  requirement_version: number;
  source_version: number;
  credential_version: number;
  clearance: ClearanceState | string;
  created_at: string;
  items: AssessmentItem[];
}
