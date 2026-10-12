import "server-only";
import { prisma } from "./db";

export interface AnnouncementView {
  id: string;
  message: string;
  level: "INFO" | "WARNING" | "URGENT";
  authorName: string;
  createdAt: string;
  closedByName: string | null;
  closedAt: string | null;
}

const LEVEL_ORDER = { URGENT: 0, WARNING: 1, INFO: 2 } as const;

type Row = {
  id: string;
  message: string;
  level: AnnouncementView["level"];
  createdAt: Date;
  closedAt: Date | null;
  createdBy: { displayName: string } | null;
  closedBy: { displayName: string } | null;
};

function toView(row: Row): AnnouncementView {
  return {
    id: row.id,
    message: row.message,
    level: row.level,
    // An author whose account was deleted leaves createdById null.
    authorName: row.createdBy?.displayName ?? "ผู้ใช้ที่ถูกลบ",
    createdAt: row.createdAt.toISOString(),
    closedByName: row.closedBy?.displayName ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
  };
}

const SELECT = {
  id: true,
  message: true,
  level: true,
  createdAt: true,
  closedAt: true,
  createdBy: { select: { displayName: true } },
  closedBy: { select: { displayName: true } },
} as const;

/** What the strip under the top bar shows: still-open notices, most urgent
 * first, then newest first within a level. */
export async function getOpenAnnouncements(): Promise<AnnouncementView[]> {
  const rows = await prisma.announcement.findMany({
    where: { closedAt: null },
    orderBy: { createdAt: "desc" },
    select: SELECT,
  });
  return rows.map(toView).sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}

export async function getRecentlyClosedAnnouncements(limit = 50): Promise<AnnouncementView[]> {
  const rows = await prisma.announcement.findMany({
    where: { closedAt: { not: null } },
    orderBy: { closedAt: "desc" },
    take: limit,
    select: SELECT,
  });
  return rows.map(toView);
}
