"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CloseIcon } from "@/components/icons";

/** Shared chrome for the LINE/Excel "review before you send" dialogs —
 * backdrop, header (icon + title + close), an optional segmented tab
 * switcher, a scrollable body, and a footer — so both look and animate the
 * same instead of each hand-rolling its own overlay. */
export function PreviewDialog({
  icon,
  title,
  subtitle,
  headerExtra,
  tabs,
  activeTab,
  onTabChange,
  footer,
  onClose,
  maxWidthClassName = "max-w-xl",
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  headerExtra?: ReactNode;
  tabs?: { key: string; label: string }[];
  activeTab?: string;
  onTabChange?: (key: string) => void;
  footer: ReactNode;
  onClose: () => void;
  maxWidthClassName?: string;
  children: ReactNode;
}) {
  // Mount in the "hidden" state, then flip a frame later so the transition
  // classes actually animate in instead of the dialog just appearing.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div
        className={`absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-200 ${entered ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <div
        className={`relative flex max-h-[85vh] w-full ${maxWidthClassName} flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 transition-all duration-200 dark:bg-gray-800 dark:ring-white/10 ${
          entered ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-[0.97] opacity-0"
        }`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-700">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300">
              {icon}
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerExtra}
            <button
              type="button"
              onClick={onClose}
              aria-label="ปิด"
              className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {tabs && (
          <div className="px-5 pt-3">
            <div className="inline-flex rounded-full bg-gray-100 p-1 dark:bg-gray-900">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => onTabChange?.(t.key)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    activeTab === t.key
                      ? "bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100"
                      : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-4">{children}</div>

        <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-5 py-3 dark:border-gray-700">{footer}</div>
      </div>
    </div>
  );
}

/** Centered spinner + label for the "fetching the preview" gap. */
export function DialogLoadingState({ label = "กำลังโหลด..." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-gray-400 dark:text-gray-500">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-5 w-5 animate-spin">
        <path d="M21 12a9 9 0 1 1-9-9" />
      </svg>
      <p className="text-sm">{label}</p>
    </div>
  );
}
