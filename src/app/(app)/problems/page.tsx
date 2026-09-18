import Link from "next/link";
import { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PlatformBadge } from "@/components/Badges";
import { problemTypeLabel, priorityLabel, priorityColor, statusLabel } from "@/lib/labels";
import { setProblemResolved, resolveManyProblems } from "@/lib/problemActions";
import { setManyOrdersStatus } from "@/lib/orderActions";
import { getRecentOrderEvents, NOTABLE_EVENT_STATUSES } from "@/lib/events";
import { EventsFeed } from "@/components/EventsFeed";
import { SelectAllCheckbox } from "@/components/SelectAllCheckbox";
import { ResolveSelectedButton } from "@/components/ResolveSelectedButton";

export const dynamic = "force-dynamic";

interface ProblemsPageProps {
  searchParams: Promise<{ resolved?: string }>;
}

const FEED_INITIAL_LIMIT = 50;

export default async function ProblemsPage({ searchParams }: ProblemsPageProps) {
  const params = await searchParams;
  const showResolved = params.resolved === "true";

  // The ticket list only renders on the "ยังไม่แก้ไข" tab (see below) — no
  // point fetching resolved tickets we're not going to show.
  const [tickets, recentEvents] = await Promise.all([
    showResolved
      ? Promise.resolve([])
      : prisma.problemTicket.findMany({
          where: { isResolved: false },
          include: { order: { include: { items: true } } },
          orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
        }),
    getRecentOrderEvents(FEED_INITIAL_LIMIT, NOTABLE_EVENT_STATUSES),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Problem Center</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          ความเคลื่อนไหวของออเดอร์แบบสด และเคสที่ต้องแก้ไข จากทุกช่องทางขายไว้ในที่เดียว
        </p>
      </div>

      <EventsFeed initialEvents={recentEvents} />

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">เคสที่ต้องแก้ไข</h2>
        <div className="flex rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-1 text-sm">
          <Link
            href="/problems"
            className={`rounded px-3 py-1 ${!showResolved ? "bg-primary text-white" : "text-gray-600 dark:text-gray-400"}`}
          >
            ยังไม่แก้ไข
          </Link>
          <Link
            href="/problems?resolved=true"
            className={`rounded px-3 py-1 ${showResolved ? "bg-primary text-white" : "text-gray-600 dark:text-gray-400"}`}
          >
            แก้ไขแล้ว
          </Link>
        </div>
      </div>

      {!showResolved &&
        (tickets.length === 0 ? (
          <p className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 text-center text-sm text-gray-400 dark:text-gray-500">
            ไม่มีปัญหาค้างอยู่ 🎉
          </p>
        ) : (
          <form id="problems-select-form" action={resolveManyProblems.bind(null, true)} className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2">
              <SelectAllCheckbox />
              <span className="text-xs text-gray-500 dark:text-gray-400">เลือกทั้งหมด</span>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <select
                  name="status"
                  defaultValue=""
                  aria-label="เปลี่ยนสถานะออเดอร์ที่เลือกเป็น"
                  className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-700 dark:text-gray-200"
                >
                  {/* Not `disabled` — some browsers skip a disabled first option
                      when picking the select's default, which would silently
                      submit a real status (e.g. "NEW") instead of this no-op
                      placeholder if the user forgets to actually pick one. */}
                  <option value="">เปลี่ยนสถานะเป็น...</option>
                  {Object.values(OrderStatus).map((s) => (
                    <option key={s} value={s}>
                      {statusLabel[s]}
                    </option>
                  ))}
                </select>
                <ResolveSelectedButton label="เปลี่ยนสถานะที่เลือก" formAction={setManyOrdersStatus} variant="secondary" />
                <ResolveSelectedButton label="แก้ไขที่เลือก" />
              </div>
            </div>

            {tickets.map((ticket) => (
              <div key={ticket.id} className="flex items-start gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                <label className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center">
                  <input
                    type="checkbox"
                    name="ids"
                    value={ticket.id}
                    aria-label="เลือกเคสนี้"
                    suppressHydrationWarning
                    className="h-4 w-4 rounded border-gray-300 dark:border-gray-600"
                  />
                </label>
                <div className="flex flex-1 flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <PlatformBadge platform={ticket.order.platform} />
                      <Link href={`/orders/${ticket.order.id}`} className="text-sm font-semibold text-gray-900 dark:text-gray-100 hover:underline">
                        #{ticket.order.platformOrderId}
                      </Link>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${priorityColor[ticket.priority]}`}>
                        {priorityLabel[ticket.priority]}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{problemTypeLabel[ticket.type]}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{ticket.description}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      ลูกค้า: {ticket.order.buyerName ?? "-"} · ยอด {Number(ticket.order.totalAmount).toLocaleString()}{" "}
                      {ticket.order.currency} · เปิดเมื่อ {new Date(ticket.createdAt).toLocaleString("th-TH")}
                    </p>
                  </div>
                  <button
                    type="submit"
                    formAction={setProblemResolved.bind(null, ticket.id, true)}
                    className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover"
                  >
                    แก้ไขแล้ว
                  </button>
                </div>
              </div>
            ))}
          </form>
        ))}
    </div>
  );
}
