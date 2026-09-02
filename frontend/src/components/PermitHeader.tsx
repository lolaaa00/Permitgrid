interface PermitHeaderProps {
  workOrderRef: string;
  requirementVersion?: number | string;
  extra?: string;
}

/** Stamp-like "permit header" block identifying the work order. */
export default function PermitHeader({ workOrderRef, requirementVersion, extra }: PermitHeaderProps) {
  return (
    <div className="pg-card px-4 py-3 mb-4">
      <div className="font-ident text-xs text-ink-muted uppercase tracking-wide">PERMITGRID</div>
      <div className="font-ident text-lg font-bold">WORK ORDER / {workOrderRef}</div>
      {requirementVersion !== undefined && (
        <div className="font-ident text-sm text-ink-muted">
          REQUIREMENT SET / V{String(requirementVersion).padStart(2, "0")}
        </div>
      )}
      {extra && <div className="font-ident text-sm text-ink-muted">{extra}</div>}
    </div>
  );
}
