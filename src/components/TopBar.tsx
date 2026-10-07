// No "use client": the account menu that needed useState lived here and is
// gone — the sidebar footer already carries the avatar, role and log-out
// button. What's left is a plain GET form and links, so this stays on the
// server and out of the client bundle. SyncButton brings its own boundary.
import Link from "next/link";
import { SyncButton } from "@/components/SyncButton";
import { SearchIcon, BellIcon } from "@/components/icons";

interface TopBarProps {
  openProblemsCount: number;
  lastUpdatedLabel: string;
}

export function TopBar({ openProblemsCount, lastUpdatedLabel }: TopBarProps) {
  return (
    <header className="print:hidden hidden h-16 shrink-0 items-center justify-between gap-4 border-b border-gray-200 bg-white/80 px-6 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/80 md:flex">
      <form action="/orders" method="GET" className="relative w-full max-w-md">
        <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          name="q"
          placeholder="ค้นหาเลขคำสั่งซื้อ, ชื่อลูกค้า, เบอร์โทร, Tracking..."
          className="w-full rounded-full border border-gray-200 bg-gray-50 py-2 pl-10 pr-3 text-sm text-gray-700 transition-colors focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/15 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:bg-gray-900"
        />
      </form>

      <div className="flex shrink-0 items-center gap-4">
        <SyncButton lastUpdatedLabel={lastUpdatedLabel} />

        <Link
          href="/problems"
          aria-label="Problem Center"
          className="relative flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
        >
          <BellIcon className="h-5 w-5" />
          {openProblemsCount > 0 && (
            <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-white bg-red-600 px-1 text-[10px] font-semibold text-white dark:border-gray-900">
              {openProblemsCount > 99 ? "99+" : openProblemsCount}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}
