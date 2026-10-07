import "server-only";
import { ConversationKind } from "@prisma/client";
import { prisma } from "./db";

/** The shared room is a singleton, so it gets a fixed primary key instead of
 * a generated one — that makes "get or create the team room" a plain upsert
 * with no lookup-then-insert race. */
export const TEAM_CONVERSATION_ID = "team";

export const MAX_MESSAGE_LENGTH = 2000;
/** One page of history, and the cap on how much a single poll can return. */
export const MESSAGE_PAGE_SIZE = 50;

/** Both ids sorted, so the pair maps to one key whichever way round it's
 * looked up. */
function dmKeyFor(a: string, b: string): string {
  return [a, b].sort().join("|");
}

export interface ConversationSummary {
  id: string;
  kind: ConversationKind;
  /** Room name for TEAM, the other person's name for DIRECT. */
  title: string;
  /** DIRECT only — drives the avatar in the conversation list. */
  otherUserId: string | null;
  otherAvatarUpdatedAt: Date | null;
  lastMessageAt: Date | null;
  lastMessagePreview: string | null;
  unreadCount: number;
}

/** Creates the team room and this user's membership of it. New membership
 * rows start with lastReadAt = now: without it, someone logging in for the
 * first time would open the app to every message the team has ever sent
 * marked unread. Only called when the membership is actually missing — it is
 * two writes, and this must not sit in the polling path. */
async function ensureTeamMembership(userId: string) {
  await prisma.conversation.upsert({
    where: { id: TEAM_CONVERSATION_ID },
    update: {},
    create: { id: TEAM_CONVERSATION_ID, kind: ConversationKind.TEAM },
  });
  await prisma.conversationParticipant.upsert({
    where: { conversationId_userId: { conversationId: TEAM_CONVERSATION_ID, userId } },
    update: {},
    create: { conversationId: TEAM_CONVERSATION_ID, userId, lastReadAt: new Date() },
  });
}

function loadMemberships(userId: string) {
  return prisma.conversationParticipant.findMany({
    where: { userId },
    select: {
      conversation: {
        select: {
          id: true,
          kind: true,
          lastMessageAt: true,
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { body: true, senderName: true },
          },
          participants: {
            where: { userId: { not: userId } },
            select: { user: { select: { id: true, displayName: true, avatarUpdatedAt: true } } },
          },
        },
      },
    },
  });
}

/** Every thread this user is in — the team room first, then DMs by recency.
 *
 * Every open tab calls this on a timer, so it is deliberately two round trips
 * and no writes in the steady state: one query for the threads, one grouped
 * query for the unread counts. The counts have a per-thread cut-off
 * (each participant's own lastReadAt), which no single Prisma groupBy can
 * express — hence the raw join, same reasoning as getDashboardKpis(). */
export async function listConversations(userId: string): Promise<ConversationSummary[]> {
  let memberships = await loadMemberships(userId);
  if (!memberships.some((m) => m.conversation.id === TEAM_CONVERSATION_ID)) {
    await ensureTeamMembership(userId);
    memberships = await loadMemberships(userId);
  }

  const unreadRows = await prisma.$queryRaw<{ conversationId: string; n: number }[]>`
    SELECT m."conversationId", COUNT(*)::int AS n
    FROM "Message" m
    JOIN "ConversationParticipant" p
      ON p."conversationId" = m."conversationId" AND p."userId" = ${userId}
    WHERE m."senderId" IS DISTINCT FROM ${userId}
      AND (p."lastReadAt" IS NULL OR m."createdAt" > p."lastReadAt")
    GROUP BY m."conversationId"
  `;
  const unreadByConversation = new Map(unreadRows.map((r) => [r.conversationId, r.n]));

  return memberships
    .map((m) => {
      const c = m.conversation;
      const other = c.participants[0]?.user ?? null;
      const last = c.messages[0];
      return {
        id: c.id,
        kind: c.kind,
        title: c.kind === ConversationKind.TEAM ? "ห้องรวมทีม" : (other?.displayName ?? "(บัญชีถูกลบแล้ว)"),
        otherUserId: c.kind === ConversationKind.TEAM ? null : (other?.id ?? null),
        otherAvatarUpdatedAt: c.kind === ConversationKind.TEAM ? null : (other?.avatarUpdatedAt ?? null),
        lastMessageAt: c.lastMessageAt,
        lastMessagePreview: last ? `${last.senderName}: ${last.body}` : null,
        unreadCount: unreadByConversation.get(c.id) ?? 0,
      };
    })
    .sort((a, b) => {
      // Team room pinned to the top; everything else newest-first, and
      // never-used threads last.
      if (a.kind !== b.kind) return a.kind === ConversationKind.TEAM ? -1 : 1;
      return (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0);
    });
}

/** True when this user is allowed to read/post in this thread. The team room
 * is open to everyone signed in; a DM only to its two participants. */
export async function canAccess(userId: string, conversationId: string): Promise<boolean> {
  if (conversationId === TEAM_CONVERSATION_ID) return true;
  const membership = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { id: true },
  });
  return membership !== null;
}

export interface ChatMessage {
  id: string;
  body: string;
  senderId: string | null;
  senderName: string;
  senderAvatarUpdatedAt: Date | null;
  createdAt: Date;
}

/** Newest page of a thread, or — when `since` is given — only what arrived
 * after it. Both come back oldest-first, which is the order they're rendered
 * in, so the caller never has to reverse anything. */
export async function getMessages(conversationId: string, since?: Date): Promise<ChatMessage[]> {
  const rows = await prisma.message.findMany({
    where: { conversationId, ...(since ? { createdAt: { gt: since } } : {}) },
    // Without `since` we want the LAST page, so take from the end and flip.
    orderBy: { createdAt: since ? "asc" : "desc" },
    take: MESSAGE_PAGE_SIZE,
    select: {
      id: true,
      body: true,
      senderId: true,
      senderName: true,
      createdAt: true,
      sender: { select: { avatarUpdatedAt: true } },
    },
  });
  const ordered = since ? rows : rows.reverse();
  return ordered.map((r) => ({
    id: r.id,
    body: r.body,
    senderId: r.senderId,
    senderName: r.senderName,
    senderAvatarUpdatedAt: r.sender?.avatarUpdatedAt ?? null,
    createdAt: r.createdAt,
  }));
}

export async function sendMessage(params: {
  conversationId: string;
  senderId: string;
  senderName: string;
  body: string;
}): Promise<ChatMessage> {
  const body = params.body.trim();
  if (!body) throw new Error("ข้อความว่าง");
  if (body.length > MAX_MESSAGE_LENGTH) throw new Error(`ข้อความยาวเกิน ${MAX_MESSAGE_LENGTH} ตัวอักษร`);

  const now = new Date();
  const [message] = await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId: params.conversationId,
        senderId: params.senderId,
        senderName: params.senderName,
        body,
        createdAt: now,
      },
      select: { id: true, body: true, senderId: true, senderName: true, createdAt: true },
    }),
    prisma.conversation.update({ where: { id: params.conversationId }, data: { lastMessageAt: now } }),
    // Sending is also reading: otherwise your own message comes back on the
    // next poll and shows up as an unread you have to click away.
    prisma.conversationParticipant.updateMany({
      where: { conversationId: params.conversationId, userId: params.senderId },
      data: { lastReadAt: now },
    }),
  ]);
  return { ...message, senderAvatarUpdatedAt: null };
}

export async function markRead(conversationId: string, userId: string) {
  await prisma.conversationParticipant.updateMany({
    where: { conversationId, userId },
    data: { lastReadAt: new Date() },
  });
}

/** Finds the DM between these two, creating it the first time. Returns the
 * conversation id. */
export async function openDirectConversation(userId: string, otherUserId: string): Promise<string> {
  if (userId === otherUserId) throw new Error("เริ่มแชทกับตัวเองไม่ได้");

  const other = await prisma.user.findUnique({ where: { id: otherUserId }, select: { isActive: true } });
  if (!other?.isActive) throw new Error("ไม่พบผู้ใช้นี้");

  const key = dmKeyFor(userId, otherUserId);
  const existing = await prisma.conversation.findUnique({ where: { dmKey: key }, select: { id: true } });
  if (existing) return existing.id;

  const created = await prisma.conversation.create({
    data: {
      kind: ConversationKind.DIRECT,
      dmKey: key,
      participants: { create: [{ userId }, { userId: otherUserId }] },
    },
    select: { id: true },
  });
  return created.id;
}

/** Everyone else who could be messaged. */
export async function listChatPartners(userId: string) {
  return prisma.user.findMany({
    where: { isActive: true, id: { not: userId } },
    select: { id: true, displayName: true, avatarUpdatedAt: true },
    orderBy: { displayName: "asc" },
  });
}
