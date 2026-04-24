import Link from "next/link";
import {
  BrainCircuit,
  Sparkles,
  Zap,
  Shield,
  BarChart3,
  FileText,
  ArrowRight,
  Check,
} from "lucide-react";

const features = [
  { icon: BrainCircuit, title: "Deal Intelligence", desc: "Real-time scoring on every opportunity based on 40+ winnability signals." },
  { icon: FileText, title: "AI Proposals", desc: "Generate custom, on-brand proposals from a single prompt in under 60 seconds." },
  { icon: BarChart3, title: "Pipeline Analytics", desc: "See where deals stall, what moves them forward, and what to do next." },
  { icon: Zap, title: "CRM Sync", desc: "Two-way sync with Salesforce, HubSpot, and Pipedrive. No data silos." },
  { icon: Shield, title: "Enterprise Security", desc: "SOC 2 Type II, end-to-end encryption, SSO, and granular permissions." },
  { icon: Sparkles, title: "Negotiation Copilot", desc: "Suggests counter-offers and objection handling during live conversations." },
];

const plans = [
  { name: "Starter", price: "$0", desc: "For individuals testing the waters", cta: "Start free", features: ["5 deals / month", "Basic scoring", "1 proposal template"] },
  { name: "Pro", price: "$49", desc: "For closers who mean business", cta: "Start free trial", featured: true, features: ["Unlimited deals", "Advanced scoring", "AI proposal generator", "CRM sync", "Full analytics"] },
  { name: "Enterprise", price: "Custom", desc: "For teams with scale", cta: "Talk to sales", features: ["Everything in Pro", "SSO + SAML", "Custom integrations", "Dedicated CSM", "SOC 2 report"] },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-[600px] w-[1200px] -translate-x-1/2 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="absolute right-0 top-96 h-[400px] w-[600px] rounded-full bg-purple-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.06)_1px,transparent_0)] [background-size:32px_32px]" />
      </div>

      <nav className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600">
            <BrainCircuit className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-semibold">Deal IQ AI</span>
        </Link>
        <div className="hidden items-center gap-8 md:flex">
          <a href="#features" className="text-sm text-slate-300 hover:text-white">Features</a>
          <a href="#pricing" className="text-sm text-slate-300 hover:text-white">Pricing</a>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm text-slate-300 hover:text-white">Sign in</Link>
          <Link href="/login" className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100">Get started</Link>
        </div>
      </nav>

      <section className="relative mx-auto max-w-7xl px-6 pb-32 pt-20 text-center">
        <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs text-slate-300 backdrop-blur">
          <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
          <span>Powered by advanced deal intelligence</span>
        </div>
        <h1 className="mx-auto max-w-4xl text-5xl font-bold tracking-tight md:text-7xl">
          Win deals before you{" "}
          <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            write them
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">
          Deal IQ AI turns conversations, CRM data, and market signals into winning proposals in minutes. Stop guessing. Start closing.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/login" className="group flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-3 text-sm font-medium shadow-lg shadow-indigo-500/25 hover:from-indigo-400 hover:to-purple-500">
            Deal IQ AI turns conversations, CRM data, and market signals into winning proposals in minutes. Stop guessing. Start closing.
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
          <a href="#features" className="rounded-lg border border-white/10 bg-white/5 px-6 py-3 text-sm font-medium backdrop-blur hover:bg-white/10">
            See how it works
          </a>
        </div>
        <p className="mt-6 text-xs text-slate-500">No credit card required · Free tier forever</p>
      </section>

      <section id="features" className="relative mx-auto max-w-7xl px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium text-indigo-400">Capabilities</p>
          <h2 className="mt-2 text-4xl font-bold tracking-tight">Everything you need to close faster</h2>
          <p className="mt-4 text-slate-400">Built for sales teams who refuse to waste cycles on low-signal deals.</p>
        </div>
        <div className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="group rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur transition hover:border-white/20 hover:bg-white/10">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500/20 to-purple-500/20 ring-1 ring-inset ring-white/10">
                <f.icon className="h-5 w-5 text-indigo-300" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-slate-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="relative mx-auto max-w-7xl px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium text-indigo-400">Pricing</p>
          <h2 className="mt-2 text-4xl font-bold tracking-tight">Simple plans that scale with you</h2>
        </div>
        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {plans.map((p) => (
            <div key={p.name} className={`relative rounded-2xl border p-8 ${p.featured ? "border-indigo-500/50 bg-gradient-to-b from-indigo-500/10 to-purple-500/5" : "border-white/10 bg-white/5"}`}>
              {p.featured && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 px-3 py-1 text-xs font-medium">
                  Most popular
                </div>
              )}
              <h3 className="text-lg font-semibold">{p.name}</h3>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold">{p.price}</span>
                {p.price !== "Custom" && <span className="text-slate-400">/mo</span>}
              </div>
              <p className="mt-2 text-sm text-slate-400">{p.desc}</p>
              <ul className="mt-6 space-y-3">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-slate-300">
                    <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-indigo-400" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link href="/login" className={`mt-8 block rounded-lg py-2.5 text-center text-sm font-medium ${p.featured ? "bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500" : "border border-white/10 bg-white/5 hover:bg-white/10"}`}>
                {p.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="relative mx-auto max-w-5xl px-6 py-24">
        <div className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-indigo-600/30 via-purple-600/20 to-pink-600/10 p-12 text-center backdrop-blur">
          <h2 className="text-4xl font-bold tracking-tight md:text-5xl">Ready to close smarter?</h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-300">
            Join forward-thinking sales teams using Deal IQ AI to hit quota with less effort.
          </p>
          <Link href="/login" className="mt-8 inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-medium text-slate-900 hover:bg-slate-100">
            Start your free trial
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="relative mx-auto max-w-7xl border-t border-white/10 px-6 py-10">
        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-purple-600">
              <BrainCircuit className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm text-slate-400">© 2026 Deal IQ AI. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-slate-400">
            <a href="#" className="hover:text-white">Privacy</a>
            <a href="#" className="hover:text-white">Terms</a>
            <a href="#" className="hover:text-white">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
