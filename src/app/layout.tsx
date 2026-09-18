import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nimbo · ระบบจัดการออเดอร์หลายช่องทาง",
  description: "แดชบอร์ดรวมออเดอร์จาก Shopee, TikTok Shop และ Lazada ไว้ในที่เดียว",
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f8fafc",
};

// Forced to always start light for now — ignores any stored preference or
// system dark-mode setting, and clears a stale "theme" value so a leftover
// dark preference from earlier testing can't keep bringing dark mode back.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    localStorage.removeItem("theme");
    document.documentElement.classList.remove("dark");
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="th"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full bg-slate-100 antialiased dark:bg-slate-950`}
    >
      {/* The outer gutter/rounded-panel shell (see (app)/layout.tsx) is
          scoped to that route group, not this root layout — /login sits
          outside it and just gets a plain body. */}
      <body className="font-sans text-slate-900 dark:text-slate-100">
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
