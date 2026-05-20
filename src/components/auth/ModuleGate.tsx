/**
 * Server-side module gate. Wrap any dashboard page with:
 *
 *   import ModuleGate from "@/components/auth/ModuleGate";
 *   <ModuleGate module="boltons">
 *     <YourPage />
 *   </ModuleGate>
 *
 * If the user doesn't have access, renders a "no access" placeholder
 * instead of the children. This is server-side enforcement; the sidebar
 * already hides the link, but a determined user could URL-poke.
 */

import { createClient } from "@/lib/supabase/server";
import { userHasModule, type ModuleKey } from "@/lib/auth/permissions";

export default async function ModuleGate({
  module: moduleKey,
  children,
}: {
  module: ModuleKey;
  children: React.ReactNode;
}) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return (
      <div className="p-8 text-center text-slate-500">
        <p>Please sign in to access this module.</p>
      </div>
    );
  }
  const allowed = await userHasModule(sb, user.id, moduleKey);
  if (!allowed) {
    return (
      <div className="mx-auto mt-12 max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-800 dark:bg-amber-950/30">
        <h2 className="text-base font-bold text-amber-900 dark:text-amber-200">Access not granted</h2>
        <p className="mt-2 text-sm text-amber-800 dark:text-amber-300">
          You don&apos;t have access to <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs dark:bg-amber-900/40">{moduleKey}</code>.
        </p>
        <p className="mt-3 text-xs text-amber-700 dark:text-amber-300/80">
          Request access from your admin. By default, invited users see only the Deal Pipeline module.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
