-- Performance indexes for the hot read paths. Generated with
--   npx prisma migrate diff --from-url "$DIRECT_URL" \
--     --to-schema-datamodel prisma/schema.prisma --script
-- and made idempotent with IF NOT EXISTS. These are already declared in
-- prisma/schema.prisma; this file exists only so they can be applied by hand
-- (Supabase SQL editor, or psql) without a full `prisma db push`.
--
-- Additive only: no table, column or row is created, altered or dropped.
-- Safe to run on a live database and safe to re-run.
--
-- Apply with EITHER:
--   npx prisma db push          (reads prisma/schema.prisma — preferred)
--   or paste this file into the Supabase SQL editor.

-- The shipping summary (src/lib/shippingSummary.ts) and the dashboard's
-- "shipped today by channel" donut both bucket orders by printedAt. With no
-- index this was a full scan of Order on every one of those page loads.
CREATE INDEX IF NOT EXISTS "Order_printedAt_idx" ON "Order"("printedAt");

-- The orders page builds its Shopee/Lazada shop dropdowns with a
-- platform-only filter, and getChannelStatuses() does a per-platform
-- max(createdAt). The composite additionally serves the very common
-- "one channel, recent orders" filter used by the orders and sales pages.
CREATE INDEX IF NOT EXISTS "Order_platform_orderDate_idx" ON "Order"("platform", "orderDate");

-- getLastSyncedLabel() feeds the top bar, so it runs on EVERY page: find the
-- newest successful sync. getChannelStatuses() runs the same query narrowed
-- to one platform. The scheduler appends a row per platform every 5 minutes,
-- so SyncLog only ever grows (5,200+ rows already) and both queries were
-- unindexed scans.
CREATE INDEX IF NOT EXISTS "SyncLog_success_finishedAt_idx" ON "SyncLog"("success", "finishedAt");
CREATE INDEX IF NOT EXISTS "SyncLog_platform_success_finishedAt_idx" ON "SyncLog"("platform", "success", "finishedAt");

-- Let the planner see the new indexes immediately.
ANALYZE "Order";
ANALYZE "SyncLog";
