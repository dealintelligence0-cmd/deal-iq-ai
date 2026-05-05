

import Link from "next/link";
import { BrainCircuit, ArrowLeft } from "lucide-react";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <nav className="mx-auto flex max-w-4xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600">
            <BrainCircuit className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-semibold">Deal IQ AI</span>
        </Link>
        <Link href="/" className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to home
        </Link>
      </nav>

      <div className="mx-auto max-w-3xl px-6 pb-20 pt-8">
        <h1 className="text-3xl font-bold">Privacy Policy</h1>
        <p className="mt-2 text-sm text-slate-400">Last updated: May 2026</p>

        <section className="mt-10 space-y-8 text-sm leading-relaxed text-slate-300">
          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-base font-semibold text-white">Data We Collect</h2>
            <p className="mt-2">We collect: account information you provide (email, profile details), deal data you upload or input, platform usage telemetry (pages visited, actions taken, AI calls made), and optional file uploads (CSV / XLSX / JSON).</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-base font-semibold text-white">Purpose of Collection</h2>
            <p className="mt-2">Data is used solely to provide the platform&apos;s features, improve output quality, and ensure operational security. We do not use your data for unrelated purposes, advertising, or profiling.</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-base font-semibold text-white">No Sale of Data</h2>
            <p className="mt-2">We do not sell, rent, or trade user data to third parties under any circumstances.</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-base font-semibold text-white">Data Storage &amp; Security</h2>
            <p className="mt-2">Deal data and account information are stored in Supabase (PostgreSQL) with row-level security (RLS) — every query is scoped to your user ID, making your data invisible to other accounts. API keys are encrypted at rest using pgcrypto. All data in transit is protected by HTTPS / TLS.</p>
            <p className="mt-2 text-slate-400">No method of transmission or storage is 100% secure. We apply industry-standard controls but cannot guarantee absolute security.</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-base font-semibold text-white">Third-Party AI Providers</h2>
            <p className="mt-2">When you use AI features (enrichment, research, proposals, synergy modeling, PMI, TSA), your prompt content — which may include deal names, sector information, and financial parameters — is transmitted to your selected AI provider (OpenAI, Anthropic, Google, Groq, Mistral, etc.) under their respective privacy policies.</p>
            <p className="mt-2">You control which provider is used by saving API keys in Settings. Enterprise tiers of Anthropic and Google do not train on API traffic by default; refer to each provider&apos;s terms for details.</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-base font-semibold text-white">Third-Party Research Providers</h2>
            <p className="mt-2">When Live Web Research is enabled, search queries (buyer name, target name, sector, deal context) are sent to your configured research provider (Tavily, Brave Search, or Serper). These are governed by each provider&apos;s privacy policy. You control which provider is used via Settings.</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-base font-semibold text-white">Data Retention</h2>
            <p className="mt-2">Your data is retained for as long as your account is active. History records (proposals, synergy models, PMI outputs, TSA frameworks) are capped at 20 items per type — older entries are automatically removed as new ones are saved.</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-base font-semibold text-white">Data Deletion</h2>
            <p className="mt-2">You may delete specific data at any time via Settings → Danger Zone (clear deals, proposals, or all data). For full account deletion, contact the platform owner directly.</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-base font-semibold text-white">Contact</h2>
            <p className="mt-2">For privacy questions, data requests, or account deletion, contact the platform owner directly via the registered account email.</p>
          </div>
        </section>

        <div className="mt-12 flex items-center gap-6 border-t border-white/10 pt-8 text-xs text-slate-500">
          <Link href="/terms" className="hover:text-white">Terms of Use</Link>
          <Link href="/" className="hover:text-white">Back to home</Link>
        </div>
      </div>
    </div>
  );
}
