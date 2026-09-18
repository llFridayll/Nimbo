"use client";

// Recharts' <ResponsiveContainer> measures itself against the DOM, which
// doesn't exist during server rendering — `ssr: false` skips that broken
// 0x0 render entirely and shows the skeleton until the client mounts. Next
// (this version) disallows `next/dynamic(..., { ssr: false })` inside a
// Server Component file, so this thin wrapper — itself a Client Component —
// is what page.tsx statically imports instead of calling dynamic() directly.
import dynamic from "next/dynamic";
import { ChartSkeleton } from "@/components/ChartSkeleton";

export const LazyDashboardSalesChart = dynamic(() => import("@/components/DashboardSalesChart").then((m) => m.DashboardSalesChart), {
  ssr: false,
  loading: () => <ChartSkeleton height={288} />,
});

export const LazyOrderChannelDonut = dynamic(() => import("@/components/OrderChannelDonut").then((m) => m.OrderChannelDonut), {
  ssr: false,
  loading: () => <ChartSkeleton height={224} />,
});
