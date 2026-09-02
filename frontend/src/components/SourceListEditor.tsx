"use client";

import type { RegSource } from "@/lib/types";

interface SourceListEditorProps {
  sources: RegSource[];
  roles: readonly string[];
  onChange: (sources: RegSource[]) => void;
  max?: number;
}

export default function SourceListEditor({ sources, roles, onChange, max = 8 }: SourceListEditorProps) {
  const update = (idx: number, patch: Partial<RegSource>) => {
    const next = sources.slice();
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };
  const remove = (idx: number) => {
    onChange(sources.filter((_, i) => i !== idx));
  };
  const add = () => {
    if (sources.length >= max) return;
    onChange([...sources, { url: "", role: roles[0] }]);
  };

  return (
    <div className="space-y-2">
      {sources.map((s, idx) => (
        <div key={idx} className="flex flex-col sm:flex-row gap-2 items-stretch" data-testid={`source-row-${idx}`}>
          <input
            type="url"
            required
            placeholder="https://…"
            className="pg-input flex-1"
            aria-label={`Source URL ${idx + 1}`}
            value={s.url}
            onChange={(e) => update(idx, { url: e.target.value })}
          />
          <select
            className="pg-select sm:w-64"
            aria-label={`Source role ${idx + 1}`}
            value={s.role}
            onChange={(e) => update(idx, { role: e.target.value })}
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {r.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="pg-btn pg-btn-outline text-xs shrink-0"
            onClick={() => remove(idx)}
            aria-label={`Remove source ${idx + 1}`}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="pg-btn pg-btn-outline text-xs"
        onClick={add}
        disabled={sources.length >= max}
      >
        Add source ({sources.length}/{max})
      </button>
    </div>
  );
}
