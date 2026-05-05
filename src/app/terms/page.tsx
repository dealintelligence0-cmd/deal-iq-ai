

import Link from "next/link";
import { BrainCircuit, ArrowLeft } from "lucide-react";

export default function TermsPage() {
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
        <h1 className="text-3xl font-bold">Terms of Use</h1>
        <p className="mt-2 text-sm text-slate-400">Last updated: May 2026</p>

        <section className="mt-10 space-y-6 text-sm leading-relaxed text-slate-300">
          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-base font-semibold text-white">1. Ownership</h2>
            <p className="mt-2">All intellectual property, platform code, business logic, models, prompts, and outputs are owned by Rahul Yadav. No transfer of ownership occurs through use of this platform.</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-base font-semibold text-white">2. License</h2>
            <p className="mt-2">Users are granted a limited, non-exclusive, non-transferable, revocable license to access and use the platform for internal evaluation and analysis purposes only. This license does not extend to resale, redistribution, or commercial exploitation of the platform or its outputs.</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-base font-semibold text-white">3. No Reliance on AI Outputs</h2>
            <p className="mt-2">Outputs from this platform — including proposals, synergy models, PMI playbooks, TSA frameworks, deal scores, and research summaries — are AI-generated and may be incomplete, inaccurate, or outdated.</p>
            <p className="mt-2">Users must not rely solely on platform outputs for any financial, legal, regulatory, investment, or strategic decision. Independent professional verification is required before acting on any platform output.</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-base font-semibold text-white">4. No Warranties</h2>
            <p className="mt-2">The platform is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranties of any kind, express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, accuracy, or non-infringement.</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-base font-semibold text-white">5. Limitation of Liability</h2>
            <p className="mt-2">The platform owner shall not be liable for any direct, indirect, incidental, consequential, special, or punitive losses or damages arising from use of, or reliance on, the platform or its outputs — including but not limited to loss of profits, loss of data, or business interruption.</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-base font-semibold text-white">6. Indemnity</h2>
            <p className="mt-2">User agrees to indemnify, defend, and hold harmless the platform owner from any claims, damages, losses, or expenses (including legal fees) arising out of user&apos;s use of the platform, violation of these terms, or reliance on AI-generated outputs for professional decisions.</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-base font-semibold text-white">7. Prohibited Use</h2>
            <p className="mt-2">The following are strictly prohibited:</p>
            <ul className="mt-3 space-y-1.5 text-slate-400">
              <li>— Reverse-engineering, decompiling, or replicating the platform or its logic</li>
              <li>— Redistributing or sublicensing access to third parties</li>
              <li>— Using the platform to train competing AI models or products</li>
              <li>— Commercial resale of platform outputs without prior written consent</li>
              <li>— Attempting to circumvent authentication, rate limits, or access controls</li>
            </ul>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-base font-semibold text-white">8. Third-Party AI Services</h2>
            <p className="mt-2">Users are responsible for compliance with the terms of service of any third-party AI or research provider whose API keys they configure in the platform (OpenAI, Anthropic, Google, Groq, Tavily, etc.). The platform owner is not liable for charges, policy violations, or service interruptions from these providers.</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-base font-semibold text-white">9. Governing Law</h2>
            <p className="mt-2">These terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the courts of India.</p>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-base font-semibold text-white">10. Changes to Terms</h2>
            <p className="mt-2">These terms may be updated at any time. Continued use of the platform after changes are posted constitutes acceptance of the revised terms.</p>
          </div>
        </section>

        <div className="mt-12 flex items-center gap-6 border-t border-white/10 pt-8 text-xs text-slate-500">
          <Link href="/privacy" className="hover:text-white">Privacy Policy</Link>
          <Link href="/" className="hover:text-white">Back to home</Link>
        </div>
      </div>
    </div>
  );
}
