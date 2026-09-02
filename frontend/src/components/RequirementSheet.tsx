import type { AssessmentItem, Requirement } from "@/lib/types";

export interface RequirementSheetRow {
  requirement_id: string;
  label: string;
  mandatory?: boolean;
  result?: string;
}

interface RequirementSheetProps {
  requirements: Requirement[];
  /** Optional per-requirement assessment items, keyed by requirement_id. */
  items?: AssessmentItem[];
}

const RESULT_STYLE: Record<string, string> = {
  PASS: "text-green",
  NOT_APPLICABLE: "text-ink-muted",
  PARTIAL: "text-amber",
  FAIL: "text-red",
  INSUFFICIENT_EVIDENCE: "text-amber",
  CONFLICTING_EVIDENCE: "text-red",
};

/** Signature "requirement sheet" — dense row list, text+colour result state. */
export default function RequirementSheet({ requirements, items }: RequirementSheetProps) {
  const itemsById = new Map((items ?? []).map((it) => [it.requirement_id, it]));

  if (requirements.length === 0) {
    return (
      <p className="text-sm text-ink-muted" data-testid="requirement-sheet-empty">
        No requirements on file for this version.
      </p>
    );
  }

  return (
    <ul className="font-ident text-sm divide-y divide-rule hairline" data-testid="requirement-sheet">
      {requirements.map((req) => {
        const item = itemsById.get(req.requirement_id);
        return (
          <li
            key={req.requirement_id}
            className="flex items-center justify-between gap-4 px-3 py-2"
            data-testid={`req-row-${req.requirement_id}`}
          >
            <span className="flex items-baseline gap-3 min-w-0">
              <span className="text-ink-muted">{req.requirement_id}</span>
              <span className="truncate">
                {req.type.replace(/_/g, " ")}
                {!req.mandatory && <span className="text-ink-muted"> (optional)</span>}
              </span>
            </span>
            <span
              className={`font-bold shrink-0 ${item ? (RESULT_STYLE[item.result] ?? "text-ink") : "text-ink-muted"}`}
            >
              {item ? item.result : "PENDING"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
