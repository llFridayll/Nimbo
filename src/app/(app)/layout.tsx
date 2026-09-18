import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { getCurrentUser } from "@/lib/dal";
import { roleLabel } from "@/lib/labels";
import { getOpenProblemsCount, getLastSyncedLabel } from "@/lib/dashboardStats";
import { UserRole } from "@prisma/client";

// Every real app page lives under this (app) route group so this layout can
// both gate them behind login (getCurrentUser() redirects to /login if
// there's no valid, still-active account) and render the shared sidebar shell
// — /login itself sits outside the group with its own minimal layout.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, openProblemsCount, lastUpdatedLabel] = await Promise.all([
    getCurrentUser(),
    getOpenProblemsCount(),
    getLastSyncedLabel(),
  ]);

  return (
    <div className="md:h-screen md:overflow-hidden md:bg-slate-300 md:p-8 md:dark:bg-slate-950">
      <div className="flex min-h-full bg-slate-50 dark:bg-slate-900 md:h-full md:overflow-hidden md:rounded-[2rem] md:border-2 md:border-gray-300 md:shadow-2xl md:dark:border-gray-700">
        <Sidebar user={user} />
        <div className="flex min-w-0 flex-1 flex-col md:overflow-hidden">
          <TopBar
            displayName={user.displayName}
            roleLabel={roleLabel(user.role === UserRole.ADMIN)}
            openProblemsCount={openProblemsCount}
            lastUpdatedLabel={lastUpdatedLabel}
          />
          <main className="mx-auto w-full min-w-0 max-w-7xl flex-1 px-6 pb-10 pt-20 md:overflow-y-auto md:px-8 md:pt-10 md:pb-10">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
