"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { BrainCircuit, Loader2, ShieldCheck, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

function SignupInner() {
  const router = useRouter();
  const search = useSearchParams();
  const supabase = createClient();
  const inviteToken = search.get("invite") ?? "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!inviteToken) {
      setError("This sign-up flow requires a valid invite link. Ask the admin for one.");
    }
  }, [inviteToken]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteToken) return;
    setLoading(true);
    setError(null);
    try {
      const { error: signErr } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?invite=${inviteToken}` },
      });
      if (signErr) throw signErr;

      // Try to stamp the user with the invite (if email confirmation isn't required, user is already authed)
      try {
        await fetch("/api/auth/invite-signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: inviteToken }),
        });
      } catch { /* non-fatal — callback also stamps */ }

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-[600px] w-[1200px] -translate-x-1/2 rounded-full bg-emerald-500/20 blur-3xl" />
      </div>
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 self-center">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600">
            <BrainCircuit className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-semibold">Deal IQ AI</span>
        </Link>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur">
          {inviteToken ? (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5" /> Invite verified — you&apos;ll get Deal Pipeline access on signup
            </div>
          ) : (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5" /> No invite token in URL
            </div>
          )}
          <h1 className="text-2xl font-semibold">Create your account</h1>
          <p className="mt-1 text-sm text-slate-400">Access starts with the Deal Pipeline. Other modules unlock once your admin grants them.</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300">Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                disabled={!inviteToken}
                className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none placeholder:text-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
                placeholder="you@company.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300">Password</label>
              <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
                disabled={!inviteToken}
                className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none placeholder:text-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
                placeholder="At least 6 characters" />
            </div>
            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>
            )}
            <button type="submit" disabled={loading || !inviteToken}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 px-4 py-2.5 text-sm font-medium hover:from-emerald-400 hover:to-teal-500 disabled:opacity-60">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Create account
            </button>
          </form>
          <div className="mt-6 text-center text-sm text-slate-400">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-indigo-400 hover:text-indigo-300">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950" />}>
      <SignupInner />
    </Suspense>
  );
}
