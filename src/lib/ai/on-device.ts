// src/lib/ai/on-device.ts
//
// On-device (browser) AI adapter layer — the T1 tier of the Intelligence Packet
// pipeline. T1 is ADVISORY pre-processing only; its output is untrusted and re-validated
// downstream (see evidence-packet.ts three-flag model). This file is the ONLY place that
// touches a browser AI API.
//
// Structure (rule 6):
//   OnDeviceAI
//   ├─ ChromeAdapter  (Summarizer / Rewriter / Prompt API — primary)
//   ├─ EdgeAdapter    (Prompt API only — EXPERIMENTAL, do not rely on it being stable)
//   └─ NullAdapter    (always available; every method resolves to null / false)
//
// Every consumer must behave IDENTICALLY across Chrome / Edge / Null — the only branching
// on capability lives inside the adapters. Callers just await a method and handle `null`.
//
// API preference (rule 5): prefer Chrome's TASK-SPECIFIC APIs (Summarizer for compression,
// Rewriter for rewriting) over the generic Prompt API; fall back to the Prompt API only
// when no task-specific API fits (relevance filtering, semantic grouping). Each method
// documents its choice in a one-line comment.
//
// NOTE: these globals only exist in a browser. Imported on the server (API routes), every
// detection returns false → NullAdapter, so server-side packet builds are cleanly T0-only.

import { assertOnDeviceTaskAllowed, type OnDeviceTask } from "@/lib/ai/on-device-policy";

export type OnDeviceKind = "chrome" | "edge" | "null";

export type SummarizeOpts = { context?: string; length?: "short" | "medium" | "long" };
export type RewriteOpts = { context?: string; tone?: "as-is" | "more-formal" | "more-casual" };
export type PromptOpts = { system?: string };

export interface OnDeviceAI {
  readonly kind: OnDeviceKind;
  // Whether this adapter can actually run a model right now.
  isAvailable(): boolean;
  // Compress/summarize source text. Returns null on any failure or unavailability.
  summarize(task: OnDeviceTask, text: string, opts?: SummarizeOpts): Promise<string | null>;
  // Rewrite/condense text. Returns null on any failure or unavailability.
  rewrite(task: OnDeviceTask, text: string, opts?: RewriteOpts): Promise<string | null>;
  // Generic instruction → text (relevance/grouping/extraction). Returns null on failure.
  prompt(task: OnDeviceTask, instruction: string, opts?: PromptOpts): Promise<string | null>;
}

// ─── Minimal ambient shapes for Chrome/Edge built-in AI (no `any`) ──────────
type Availability = "unavailable" | "downloadable" | "downloading" | "available";
interface Session {
  summarize?(input: string, opts?: Record<string, unknown>): Promise<string>;
  rewrite?(input: string, opts?: Record<string, unknown>): Promise<string>;
  prompt?(input: string, opts?: Record<string, unknown>): Promise<string>;
  destroy?(): void;
}
interface AiFactory {
  availability?(): Promise<Availability>;
  create(opts?: Record<string, unknown>): Promise<Session>;
}

function readGlobal<T>(name: string): T | undefined {
  const g = globalThis as unknown as Record<string, unknown>;
  const v = g[name];
  return v ? (v as T) : undefined;
}

async function isFactoryReady(f: AiFactory | undefined): Promise<boolean> {
  if (!f) return false;
  try {
    if (!f.availability) return true; // older builds expose create() without availability()
    const a = await f.availability();
    return a === "available" || a === "downloadable" || a === "downloading";
  } catch {
    return false;
  }
}

// ─── Null adapter (always available fallback) ───────────────────────────────
class NullAdapter implements OnDeviceAI {
  readonly kind = "null" as const;
  isAvailable(): boolean { return false; }
  async summarize(task: OnDeviceTask): Promise<string | null> { assertOnDeviceTaskAllowed(task); return null; }
  async rewrite(task: OnDeviceTask): Promise<string | null> { assertOnDeviceTaskAllowed(task); return null; }
  async prompt(task: OnDeviceTask): Promise<string | null> { assertOnDeviceTaskAllowed(task); return null; }
}

// ─── Chrome adapter (primary) ───────────────────────────────────────────────
class ChromeAdapter implements OnDeviceAI {
  readonly kind = "chrome" as const;
  isAvailable(): boolean {
    // Cheap synchronous presence check; per-call availability() is the real gate.
    return !!(readGlobal("Summarizer") || readGlobal("Rewriter") || readGlobal("LanguageModel"));
  }

  // Compression → task-specific Summarizer API (rule 5), never the generic Prompt API.
  async summarize(task: OnDeviceTask, text: string, opts?: SummarizeOpts): Promise<string | null> {
    assertOnDeviceTaskAllowed(task);
    const factory = readGlobal<AiFactory>("Summarizer");
    if (!(await isFactoryReady(factory)) || !factory) return null;
    let session: Session | undefined;
    try {
      session = await factory.create({ type: "tldr", format: "plain-text", length: opts?.length ?? "short" });
      if (!session.summarize) return null;
      const out = await session.summarize(text, opts?.context ? { context: opts.context } : undefined);
      return typeof out === "string" && out.trim() ? out : null;
    } catch {
      return null;
    } finally {
      try { session?.destroy?.(); } catch { /* ignore */ }
    }
  }

  // Rewriting/condensing → task-specific Rewriter API (rule 5), never the Prompt API.
  async rewrite(task: OnDeviceTask, text: string, opts?: RewriteOpts): Promise<string | null> {
    assertOnDeviceTaskAllowed(task);
    const factory = readGlobal<AiFactory>("Rewriter");
    if (!(await isFactoryReady(factory)) || !factory) return null;
    let session: Session | undefined;
    try {
      session = await factory.create({ tone: opts?.tone ?? "as-is", format: "plain-text", length: "shorter" });
      if (!session.rewrite) return null;
      const out = await session.rewrite(text, opts?.context ? { context: opts.context } : undefined);
      return typeof out === "string" && out.trim() ? out : null;
    } catch {
      return null;
    } finally {
      try { session?.destroy?.(); } catch { /* ignore */ }
    }
  }

  // No task-specific API fits relevance/grouping/extraction → fall back to Prompt API (rule 5).
  async prompt(task: OnDeviceTask, instruction: string, opts?: PromptOpts): Promise<string | null> {
    assertOnDeviceTaskAllowed(task);
    const factory = readGlobal<AiFactory>("LanguageModel");
    if (!(await isFactoryReady(factory)) || !factory) return null;
    let session: Session | undefined;
    try {
      session = await factory.create(opts?.system ? { initialPrompts: [{ role: "system", content: opts.system }] } : undefined);
      if (!session.prompt) return null;
      const out = await session.prompt(instruction);
      return typeof out === "string" && out.trim() ? out : null;
    } catch {
      return null;
    } finally {
      try { session?.destroy?.(); } catch { /* ignore */ }
    }
  }
}

// ─── Edge adapter (EXPERIMENTAL — Prompt API only) ──────────────────────────
// Edge exposes an on-device Prompt-style API but no stable Summarizer/Rewriter. Treat as
// experimental: summarize/rewrite have no task-specific path here, so they route through
// the Prompt API with an explicit instruction. Do NOT assume this is tested or stable.
class EdgeAdapter implements OnDeviceAI {
  readonly kind = "edge" as const;
  private factory(): AiFactory | undefined {
    return readGlobal<AiFactory>("LanguageModel") ?? readGlobal<{ languageModel?: AiFactory }>("ai")?.languageModel;
  }
  isAvailable(): boolean { return !!this.factory(); }

  private async run(instruction: string, system?: string): Promise<string | null> {
    const factory = this.factory();
    if (!(await isFactoryReady(factory)) || !factory) return null;
    let session: Session | undefined;
    try {
      session = await factory.create(system ? { initialPrompts: [{ role: "system", content: system }] } : undefined);
      if (!session.prompt) return null;
      const out = await session.prompt(instruction);
      return typeof out === "string" && out.trim() ? out : null;
    } catch {
      return null;
    } finally {
      try { session?.destroy?.(); } catch { /* ignore */ }
    }
  }

  // No Summarizer API on Edge → emulate via Prompt API (experimental, rule 5 fallback).
  async summarize(task: OnDeviceTask, text: string, opts?: SummarizeOpts): Promise<string | null> {
    assertOnDeviceTaskAllowed(task);
    return this.run(`Summarize the following as concise ${opts?.length ?? "short"} plain text. Do not add facts:\n\n${text}`, opts?.context);
  }
  // No Rewriter API on Edge → emulate via Prompt API (experimental).
  async rewrite(task: OnDeviceTask, text: string, opts?: RewriteOpts): Promise<string | null> {
    assertOnDeviceTaskAllowed(task);
    return this.run(`Rewrite the following more concisely, preserving meaning and inventing nothing:\n\n${text}`, opts?.context);
  }
  async prompt(task: OnDeviceTask, instruction: string, opts?: PromptOpts): Promise<string | null> {
    assertOnDeviceTaskAllowed(task);
    return this.run(instruction, opts?.system);
  }
}

// ─── Selection ──────────────────────────────────────────────────────────────
const nullAdapter = new NullAdapter();

function detectAdapter(): OnDeviceAI {
  // Chrome's task-specific APIs are the primary, best-tested path.
  if (readGlobal("Summarizer") || readGlobal("Rewriter")) return new ChromeAdapter();
  // A bare LanguageModel (Prompt API) could be Chrome or Edge; prefer Chrome semantics.
  if (readGlobal("LanguageModel")) return new ChromeAdapter();
  // Edge's window.ai.languageModel shape (experimental).
  if (readGlobal<{ languageModel?: unknown }>("ai")?.languageModel) return new EdgeAdapter();
  return nullAdapter;
}

export type GetOnDeviceOpts = {
  // Phase 4 uses force:"null" to verify graceful fallback without a browser.
  force?: OnDeviceKind;
};

export function getOnDeviceAI(opts?: GetOnDeviceOpts): OnDeviceAI {
  if (opts?.force === "null") return nullAdapter;
  if (opts?.force === "chrome") return new ChromeAdapter();
  if (opts?.force === "edge") return new EdgeAdapter();
  return detectAdapter();
}

// True when some real on-device model is reachable. Consumers should still handle null
// from any individual method — availability can change between this check and a call.
export function isOnDeviceAvailable(opts?: GetOnDeviceOpts): boolean {
  return getOnDeviceAI(opts).isAvailable();
}
