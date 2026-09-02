export type BadgeTone = "green" | "amber" | "red" | "blue" | "neutral";

const TONE_STYLES: Record<BadgeTone, string> = {
  green: "bg-green-bg text-green border-green",
  amber: "bg-amber-bg text-amber border-amber",
  red: "bg-red-bg text-red border-red",
  blue: "bg-blue-bg text-blue border-blue",
  neutral: "bg-paper-raised text-ink-muted border-rule",
};

/** Result -> tone mapping used by both the requirement sheet and clearance stamp. */
export function resultTone(result: string): BadgeTone {
  switch (result) {
    case "PASS":
    case "CLEARED":
      return "green";
    case "FAIL":
    case "EXPIRED_OR_INACTIVE":
    case "OUT_OF_SCOPE":
    case "REGULATORY_CONFLICT":
      return "red";
    case "PARTIAL":
    case "INSUFFICIENT_EVIDENCE":
    case "SUPERVISION_REQUIRED":
    case "ADDITIONAL_CREDENTIAL_REQUIRED":
    case "STALE":
      return "amber";
    case "NOT_APPLICABLE":
    case "CONFLICTING_EVIDENCE":
    case "UNASSESSED":
    case "SUBMITTED":
      return "neutral";
    default:
      return "neutral";
  }
}

export default function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: BadgeTone;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide font-ident ${TONE_STYLES[tone]}`}
    >
      {label}
    </span>
  );
}
