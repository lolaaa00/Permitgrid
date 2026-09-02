import type { ClearanceState } from "@/lib/types";

const STAMP_COPY: Record<string, string> = {
  CLEARED: "CLEARED FOR ASSIGNMENT",
  SUPERVISION_REQUIRED: "SUPERVISION REQUIRED",
  ADDITIONAL_CREDENTIAL_REQUIRED: "ADDITIONAL CREDENTIAL REQUIRED",
  OUT_OF_SCOPE: "OUT OF SCOPE",
  EXPIRED_OR_INACTIVE: "LICENCE EXPIRED OR INACTIVE",
  INSUFFICIENT_EVIDENCE: "INSUFFICIENT EVIDENCE",
  REGULATORY_CONFLICT: "REGULATORY CONFLICT",
  STALE: "ASSESSMENT STALE",
  UNASSESSED: "NOT YET ASSESSED",
  SUBMITTED: "SUBMITTED",
};

const STAMP_STYLE: Record<string, string> = {
  CLEARED: "border-green text-green",
  SUPERVISION_REQUIRED: "border-amber text-amber",
  ADDITIONAL_CREDENTIAL_REQUIRED: "border-amber text-amber",
  OUT_OF_SCOPE: "border-red text-red",
  EXPIRED_OR_INACTIVE: "border-red text-red",
  INSUFFICIENT_EVIDENCE: "border-amber text-amber",
  REGULATORY_CONFLICT: "border-red text-red",
  STALE: "border-ink-muted text-ink-muted",
  UNASSESSED: "border-ink-muted text-ink-muted",
  SUBMITTED: "border-blue text-blue",
};

const GATE_OPEN_STATES: (ClearanceState | string)[] = ["CLEARED"];

interface ClearanceStampProps {
  clearance: ClearanceState | string;
}

/** Signature "clearance stamp" block, with the ASSIGNMENT GATE line. */
export default function ClearanceStamp({ clearance }: ClearanceStampProps) {
  const gateOpen = GATE_OPEN_STATES.includes(clearance);
  const style = STAMP_STYLE[clearance] ?? "border-ink-muted text-ink-muted";
  const copy = STAMP_COPY[clearance] ?? clearance;

  return (
    <div data-testid="clearance-stamp" data-clearance={clearance} className={`pg-card border-2 ${style} px-4 py-3`}>
      <div className="font-ident text-xs uppercase tracking-wide text-ink-muted">WORK CLEARANCE</div>
      <div className="hairline-t my-2" />
      <div className="font-ident text-lg font-bold uppercase">{copy}</div>
      <div className="font-ident text-xs mt-3 uppercase tracking-wide text-ink-muted">ASSIGNMENT GATE</div>
      <div
        className={`font-ident text-base font-bold uppercase ${gateOpen ? "text-green" : "text-red"}`}
        data-testid="assignment-gate"
      >
        {gateOpen ? "OPEN" : "CLOSED"}
      </div>
    </div>
  );
}
