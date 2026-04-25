import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-12 border-t border-slate-200 px-6 py-4 text-center text-[10px] text-slate-500 dark:border-white/10 dark:text-slate-400">
      <p>
        © {new Date().getFullYear()} Rahul Yadav. All rights reserved. This platform and its outputs are for informational purposes only and do not constitute financial, legal, or investment advice.
      </p>
      <div className="mt-1 flex justify-center gap-3">
        <Link href="/terms" className="hover:text-indigo-600">Terms of Use</Link>
        <span className="text-slate-300">·</span>
        <Link href="/privacy" className="hover:text-indigo-600">Privacy Policy</Link>
      </div>
      <p className="mt-2 text-slate-400">Unauthorized replication or commercial use of this platform, logic, or outputs is prohibited.</p>
    </footer>
  );
}
