import Link from "next/link";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
          <FileQuestion className="h-8 w-8 text-slate-500" />
        </div>
        <h1 className="mt-4 text-3xl font-bold text-slate-900">404</h1>
        <p className="mt-2 text-slate-600">Page not found</p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
