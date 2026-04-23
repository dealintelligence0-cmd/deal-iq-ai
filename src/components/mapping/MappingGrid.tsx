"use client";

import { CheckCircle2, AlertCircle } from "lucide-react";
import { FIELD_DEFS, type FieldMapping } from "@/lib/mapping";

type Props = {
  headers: string[];
  mapping: FieldMapping;
  onChange: (m: FieldMapping) => void;
};

export default function MappingGrid({ headers, mapping, onChange }: Props) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3">Standard Field</th>
            <th className="px-4 py-3">Source Column</th>
            <th className="px-4 py-3 w-20">Status</th>
          </tr>
        </thead>
        <tbody>
          {FIELD_DEFS.map((def) => {
            const val = mapping[def.key];
            const mapped = Boolean(val);
            const missing = def.required && !mapped;
            return (
              <tr key={def.key} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{def.label}</div>
                  {def.required && (
                    <div className="text-xs text-red-600">Required</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <select
                    value={val ?? ""}
                    onChange={(e) =>
                      onChange({
                        ...mapping,
                        [def.key]: e.target.value || null,
                      })
                    }
                    className={`w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 ${
                      missing ? "border-red-300" : "border-slate-200"
                    }`}
                  >
                    <option value="">— Not mapped —</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  {mapped ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  ) : missing ? (
                    <AlertCircle className="h-5 w-5 text-red-500" />
                  ) : (
                    <span className="text-xs text-slate-400">Optional</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
