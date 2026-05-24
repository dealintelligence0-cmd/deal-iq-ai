/**
 * Phase 8 — PMI Playbook generator.
 * Seeds a default integration plan for any account (overrideable manually).
 */

import type { RouteConfig } from "@/lib/ai/router";
import { routedCall } from "@/lib/ai/router";

export type SeededTask = {
  title: string;
  workstream: "IMO" | "HR" | "IT" | "Finance" | "GTM" | "Legal" | "Ops";
  start_week: number;
  end_week: number;
  dependencies: string[];
};
export type SeededChecklist = {
  phase: "pre_close" | "day_1_core" | "day_30_stabilize" | "day_100_integrate" | "post_close";
  title: string;
  owner_role: string;
};

// Deterministic default playbook — works without AI
export function defaultPMI(): { tasks: SeededTask[]; checklist: SeededChecklist[] } {
  const tasks: SeededTask[] = [
    { title: "Joint Integration IMO Setup",        workstream: "IMO", start_week: 1, end_week: 4,  dependencies: [] },
    { title: "Day 1 Communications & Announcement",workstream: "IMO", start_week: 1, end_week: 2,  dependencies: [] },
    { title: "HR Payroll Migration & Comp Alignment", workstream: "HR", start_week: 3, end_week: 8, dependencies: ["IMO Setup"] },
    { title: "IT Stack Audit & Network Bridging",  workstream: "IT", start_week: 2, end_week: 7,  dependencies: ["T1"] },
    { title: "Financial Reporting Consolidation",  workstream: "Finance", start_week: 5, end_week: 12, dependencies: ["T3"] },
    { title: "GTM Channel Launch & Sales Pairing", workstream: "GTM", start_week: 8, end_week: 16, dependencies: ["T3"] },
    { title: "ERP Systems & Cloud Stack Cutover",  workstream: "IT", start_week: 10, end_week: 20, dependencies: ["T4","T5"] },
    { title: "Legal Entity Rationalization",       workstream: "Legal", start_week: 4, end_week: 14, dependencies: [] },
    { title: "Cultural Integration Workshops",     workstream: "HR", start_week: 6, end_week: 18, dependencies: ["IMO Setup"] },
    { title: "Procurement Vendor Consolidation",   workstream: "Ops", start_week: 7, end_week: 16, dependencies: [] },
  ];
  const checklist: SeededChecklist[] = [
    { phase: "pre_close", title: "Regulatory antitrust approvals secured", owner_role: "Legal Counsel" },
    { phase: "pre_close", title: "SLA approvals and antitrust checks", owner_role: "Legal Counsel" },
    { phase: "pre_close", title: "Customer/partner communication plan finalized", owner_role: "Communications Lead" },
    { phase: "day_1_core", title: "Synchronize Global Public Announcements", owner_role: "Communications Lead" },
    { phase: "day_1_core", title: "Enforce Technology Code & Database Freeze", owner_role: "IT & Engineering Lead" },
    { phase: "day_1_core", title: "Corporate notifications and tech freezes", owner_role: "CFO" },
    { phase: "day_1_core", title: "Welcome packets dispatched to all employees", owner_role: "HR Lead" },
    { phase: "day_30_stabilize", title: "Payroll cutover verified, zero errors", owner_role: "HR Lead" },
    { phase: "day_30_stabilize", title: "Customer retention metrics baseline established", owner_role: "GTM Lead" },
    { phase: "day_30_stabilize", title: "IT helpdesk merged, ticket SLAs aligned", owner_role: "IT Lead" },
    { phase: "day_100_integrate", title: "Financial reporting on single ERP", owner_role: "CFO" },
    { phase: "day_100_integrate", title: "Sales territories rationalized + commission plans live", owner_role: "GTM Lead" },
    { phase: "day_100_integrate", title: "Brand consolidation decision finalized", owner_role: "CMO" },
    { phase: "post_close", title: "Quarterly synergy realization review", owner_role: "IMO" },
    { phase: "post_close", title: "Integration close-out & lessons learned", owner_role: "IMO" },
  ];
  return { tasks, checklist };
}

const AI_PROMPT = `You are an MBB partner customizing a post-merger integration plan.

Given account context (industry, size, geography), tailor a 20-week PMI playbook.
Return up to 10 workstream tasks + 12 checklist items covering pre-close → post-close phases.

OUTPUT — strict JSON:
{
  "tasks": [
    { "title": "...", "workstream": "IMO|HR|IT|Finance|GTM|Legal|Ops", "start_week": 1-20, "end_week": 1-20, "dependencies": ["task ref"] }
  ],
  "checklist": [
    { "phase": "pre_close|day_1_core|day_30_stabilize|day_100_integrate|post_close", "title": "...", "owner_role": "..." }
  ]
}

RULES: Output MUST be valid JSON. Tasks must have end_week ≥ start_week. No markdown.`;

export async function generatePMI(routeCfg: RouteConfig, accountName: string, buyerName: string | null, sector: string | null, geography: string | null) {
  const userPrompt = `Account: ${accountName}${buyerName ? ` (acquirer: ${buyerName})` : ""}
Sector: ${sector ?? "unknown"} · Geography: ${geography ?? "unknown"}
Tailor the 20-week integration plan.`;
  try {
    const res = await routedCall(routeCfg, [
      { role: "system", content: AI_PROMPT, stable: true },
      { role: "user", content: userPrompt },
    ], 2500);
    const cost = ((res.inputTokens / 1000) * 0.0015) + ((res.outputTokens / 1000) * 0.006);
    if (res.model === "rules-v1" || res.text.startsWith("[rule-based]")) {
      return { ...defaultPMI(), cost_usd: cost, provider: res.provider, model: res.model, error: "AI rules-v1 fallback; using default plan" };
    }
    const clean = res.text.replace(/```(?:json)?/gi, "").trim();
    const a = clean.indexOf("{"); const b = clean.lastIndexOf("}");
    if (a < 0 || b <= a) return { ...defaultPMI(), cost_usd: cost, provider: res.provider, model: res.model, error: "Unparseable AI response; default plan used" };
    try {
      const parsed = JSON.parse(clean.slice(a, b + 1));
      const tasks: SeededTask[] = Array.isArray(parsed.tasks) ? parsed.tasks.slice(0, 10).filter((t: any) => t.title && t.start_week && t.end_week >= t.start_week).map((t: any) => ({
        title: String(t.title).slice(0, 100),
        workstream: ["IMO","HR","IT","Finance","GTM","Legal","Ops"].includes(t.workstream) ? t.workstream : "Ops",
        start_week: Math.max(1, Math.min(20, Number(t.start_week))),
        end_week: Math.max(1, Math.min(20, Number(t.end_week))),
        dependencies: Array.isArray(t.dependencies) ? t.dependencies.slice(0, 4).map(String) : [],
      })) : [];
      const checklist: SeededChecklist[] = Array.isArray(parsed.checklist) ? parsed.checklist.slice(0, 15).filter((c: any) => c.title && c.phase).map((c: any) => ({
        phase: ["pre_close","day_1_core","day_30_stabilize","day_100_integrate","post_close"].includes(c.phase) ? c.phase : "post_close",
        title: String(c.title).slice(0, 200),
        owner_role: String(c.owner_role ?? "").slice(0, 80),
      })) : [];
      if (tasks.length === 0) return { ...defaultPMI(), cost_usd: cost, provider: res.provider, model: res.model, error: null };
      return { tasks, checklist, cost_usd: cost, provider: res.provider, model: res.model, error: null };
    } catch {
      return { ...defaultPMI(), cost_usd: cost, provider: res.provider, model: res.model, error: "Parse failed; default plan used" };
    }
  } catch (e: any) {
    return { ...defaultPMI(), cost_usd: 0, provider: null, model: null, error: e?.message ?? String(e) };
  }
}
