"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { UserRole } from "@prisma/client";
import {
  MenuIcon,
  CloseIcon,
  HomeIcon,
  ShoppingBagIcon,
  TruckIcon,
  PackageIcon,
  AlertTriangleIcon,
  TrendingUpIcon,
  UploadIcon,
  UsersIcon,
  ClipboardListIcon,
} from "@/components/icons";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserAvatar } from "@/components/UserAvatar";
import { logout } from "@/lib/authActions";
import { roleLabel } from "@/lib/labels";
import type { CurrentUser } from "@/lib/dal";

interface NavItem {
  href: string;
  label: string;
  icon: (props: { className?: string }) => React.JSX.Element;
}
interface NavSection {
  sectionLabel?: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { href: "/", label: "Dashboard", icon: HomeIcon },
      { href: "/orders", label: "ค้นหา / รายการ Order", icon: ShoppingBagIcon },
      { href: "/orders/shipping-summary", label: "สรุปออเดอร์จัดส่ง", icon: TruckIcon },
      { href: "/products", label: "สินค้า", icon: PackageIcon },
      { href: "/problems", label: "Problem Center", icon: AlertTriangleIcon },
    ],
  },
  {
    sectionLabel: "รายงาน",
    items: [{ href: "/sales", label: "ประวัติการขาย", icon: TrendingUpIcon }],
  },
];

const ADMIN_SECTIONS: NavSection[] = [
  {
    sectionLabel: "ระบบ",
    items: [
      { href: "/admin/order-import", label: "นำเข้าออเดอร์ (Shopee/Lazada)", icon: UploadIcon },
      { href: "/admin/employees", label: "จัดการพนักงาน", icon: UsersIcon },
      { href: "/admin/activity-log", label: "ประวัติการใช้งาน", icon: ClipboardListIcon },
    ],
  },
];

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <Image src="/nimbo-logo-icon.png" alt="Nimbo" width={40} height={40} className="h-10 w-10 shrink-0" priority />
      <span className="flex flex-col leading-tight">
        <span className="text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-100">Nimbo</span>
        <span className="text-[11px] text-gray-400 dark:text-gray-500">ระบบจัดการออเดอร์หลายช่องทาง</span>
      </span>
    </Link>
  );
}

function NavLinks({ onNavigate, className = "", isAdmin = false }: { onNavigate?: () => void; className?: string; isAdmin?: boolean }) {
  const pathname = usePathname();
  const sections = isAdmin ? [...NAV_SECTIONS, ...ADMIN_SECTIONS] : NAV_SECTIONS;
  return (
    <nav className={`flex flex-col gap-4 ${className}`}>
      {sections.map((section, i) => (
        <div key={section.sectionLabel ?? `section-${i}`} className="flex flex-col gap-1">
          {section.sectionLabel && (
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{section.sectionLabel}</p>
          )}
          {section.items.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={onNavigate}
                className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  active ? "bg-primary text-white" : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                }`}
              >
                <link.icon className="h-4 w-4 shrink-0" />
                {link.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function Sidebar({ user }: { user: CurrentUser }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isAdmin = user.role === UserRole.ADMIN;

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Desktop: persistent left sidebar — a fixed-height header row, a
          padded nav body, and a bordered footer, like a Linear/Vercel-style
          dashboard sidebar (clearer rhythm than one evenly-padded block). */}
      <aside className="print:hidden hidden h-full w-64 shrink-0 flex-col border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 md:flex">
        <div className="flex h-16 items-center border-b border-gray-100 px-5 dark:border-gray-800">
          <Brand />
        </div>
        <NavLinks className="flex-1 px-3 py-5" isAdmin={isAdmin} />
        <div className="border-t border-gray-100 px-5 py-3 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex min-w-0 items-center gap-2">
              <UserAvatar name={user.displayName} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">{user.displayName}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">{roleLabel(isAdmin)}</p>
              </div>
            </div>
            <ThemeToggle />
          </div>
          <form action={logout} className="mt-2">
            <button
              type="submit"
              className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              ออกจากระบบ
            </button>
          </form>
        </div>
      </aside>

      {/* Mobile: slim top bar + slide-in drawer. `fixed` (not `sticky`) so it
          sits outside the sidebar+main flex row instead of becoming a flex
          item itself and squeezing `main` sideways. */}
      <header className="print:hidden fixed inset-x-0 top-0 z-20 flex h-16 items-center justify-between border-b border-gray-200 bg-white/80 px-4 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/80 md:hidden">
        <Brand />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "ปิดเมนู" : "เปิดเมนู"}
            aria-expanded={open}
            className="flex h-10 w-10 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {open ? <CloseIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {open && (
        <div className="print:hidden fixed inset-0 z-30 md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-900">
            <div className="flex h-16 items-center justify-between border-b border-gray-100 px-5 dark:border-gray-800">
              <Brand />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="ปิดเมนู"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>
            <NavLinks onNavigate={() => setOpen(false)} className="px-3 py-5" isAdmin={isAdmin} />
            <div className="border-t border-gray-100 px-5 py-3 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <UserAvatar name={user.displayName} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-200">{user.displayName}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{roleLabel(isAdmin)}</p>
                </div>
              </div>
              <form action={logout} className="mt-2">
                <button
                  type="submit"
                  className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
                >
                  ออกจากระบบ
                </button>
              </form>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
