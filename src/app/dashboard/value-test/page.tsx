"use client";

import { useState } from "react";
import {
  FlaskConical,
  CheckCircle2,
  XCircle,
  Play,
} from "lucide-react";
import {
  parseValueIntelligence,
  formatUsd,
} from "@/lib/cleansing/value";
import { VALUE_TEST_CASES } from "@/lib/cleansing/value.fixtures";

type Result = {
  input: string;
  description: string;
  passed: boolean;
  reasons: string[];
  parsed: ReturnType<typeof parseValueIntelligence>;
};

export default function ValueTestPage() {
  const [results, setResults] = useState<Result[]>([]);
  const [custom, setCustom] = useState("₹800 Cr for 49%");

  function runAll() {
    const out: Result[] = VALUE_TEST_CASES.map((tc) => {
      const parsed = parseValueIntelligence(tc.input);
      const reasons: string[] = [];
      let passed = true;
      if (parsed.currency !== tc.expectedCurrency) {
        passed = false;
        reasons.push(`Currency: got ${parsed.currency} expected ${tc.expectedCurrency}`);
      }
      if (
        tc.expectedNativeMin !== undefined &&
        (parsed.nativeValue === null ||
          parsed.nativeValue < tc.expectedNativeMin ||
          parsed.nativeValue > (tc.expectedNativeMax ?? tc.expectedNativeMin))
      ) {
        passed = false;
        reasons.push(`Value: got ${parsed.nativeValue} expected ~${tc.expectedNativeMin}`);
      }
      if (tc.expectedStake !== undefined && parsed.stakeDetected !== tc.expectedStake) {
        passed = false;
        reasons.push(`Stake: got ${parsed.stakeDetected} expected ${tc.expectedStake}`);
      }
      return { input: tc.input, description: tc.description, passed, reasons, parsed };
    });
    setResults(out);
  }

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const customParsed = custom ? parseValueIntelligence(custom) : null;

  return (
    <div>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <FlaskConical className="h-6 w-6 text-indigo-600" />
            Value Intelligence Test Runner
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Run the full parser test suite in your browser. No terminal required.
          </p>
        </div>
        <button
          onClick={runAll}
          className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-500/20 hover:from-indigo-400 hover:to-purple-500"
        >
          <Play className="h-4 w-4" />
          Run {VALUE_TEST_CASES.length} tests
        </button>
      </div>

      {/* Custom playground */}
      <section className="mb-8 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Try your own string</h2>
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder='e.g. "₹800 Cr for 49%"'
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        />
        {customParsed && customParsed.nativeValue !== null && (
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <Metric label="Currency" value={customParsed.currency ?? "—"} />
            <Metric label="Native" value={customParsed.nativeValue.toLocaleString()} />
            <Metric label="USD EV" value={formatUsd(customParsed.normalizedUsd)} />
            <Metric
              label={customParsed.stakeDetected ? `Implied 100% (${customParsed.stakeDetected}%)` : "Implied 100%"}
              value={formatUsd(customParsed.impliedHundredPctUsd)}
            />
          </div>
        )}
        {customParsed && customParsed.reasoning.length > 0 && (
          <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs font-mono text-slate-600">
            {customParsed.reasoning.map((r, i) => (
              <div key={i}>· {r}</div>
            ))}
          </div>
        )}
      </section>

      {/* Test results */}
      {results.length > 0 && (
        <>
          <div className="mb-4 flex items-center gap-3">
            <span
              className={`rounded-md px-3 py-1 text-sm font-semibold ${
                passed === total
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-amber-50 text-amber-700"
              }`}
            >
              {passed} / {total} passed
            </span>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 w-8"></th>
                  <th className="px-4 py-3">Input</th>
                  <th className="px-4 py-3">Parsed</th>
                  <th className="px-4 py-3">USD EV</th>
                  <th className="px-4 py-3">Implied 100%</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-4 py-3">
                      {r.passed ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-600" />
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-900">
                      {r.input}
                      <div className="mt-0.5 text-[11px] font-normal text-slate-500">
                        {r.description}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="text-slate-900">
                        {r.parsed.currency} {r.parsed.nativeValue?.toLocaleString() ?? "—"}
                      </div>
                      <div className="text-slate-500">
                        conf {Math.round(r.parsed.confidence * 100)}%
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">
                      {formatUsd(r.parsed.normalizedUsd)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">
                      {r.parsed.stakeDetected
                        ? `${formatUsd(r.parsed.impliedHundredPctUsd)} @ ${r.parsed.stakeDetected}%`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {r.reasons.length > 0 ? (
                        <ul className="text-red-600">
                          {r.reasons.map((x, j) => (
                            <li key={j}>· {x}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-emerald-600">OK</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}
