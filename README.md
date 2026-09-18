# OMS — ระบบจัดการออเดอร์หลายช่องทาง (Multi-Channel Order Management System)

Dashboard กลางสำหรับดูออเดอร์จาก **Shopee**, **TikTok Shop** และ **Lazada** ในที่เดียว — ค้นหาข้ามทั้ง 3 แพลตฟอร์มด้วยช่องค้นหาเดียว, ดูรายละเอียดออเดอร์แบบรวมศูนย์ และ Problem Center ที่ดักจับปัญหา (คืนเงิน, จัดส่งล่าช้า ฯลฯ) ให้อัตโนมัติ

```
TikTok Shop ──┐
Shopee ───────┼── API / Webhook ── OMS Server (Next.js) ── SQLite/PostgreSQL ── Dashboard
Lazada ───────┘
```

## Stack ที่ใช้

- **Next.js 16** (App Router, TypeScript, Tailwind) — รวม frontend และ API routes ไว้ในโปรเจกต์เดียว
- **Prisma ORM** — ตอนนี้ชี้ไปที่ **SQLite** เพื่อให้รันทดสอบได้ทันทีโดยไม่ต้องตั้งค่าอะไรเพิ่ม (ดูหมายเหตุด้านล่าง)
- Platform adapters อยู่ที่ [src/lib/platforms/](src/lib/platforms/) — ใช้ interface เดียว (`PlatformAdapter`) แล้วแยก implementation ต่อแพลตฟอร์ม

## เริ่มต้นใช้งาน

```bash
npm install
cp .env.example .env
npx prisma migrate dev   # สร้างไฟล์ dev.db และรัน schema
npm run db:seed          # สร้างข้อมูล mock ประมาณ 50 ออเดอร์ ครบทั้ง 3 แพลตฟอร์ม
npm run dev
```

เปิด http://localhost:3000

## เรื่องฐานข้อมูล: ตอนนี้ใช้ SQLite / ตอน production ให้ใช้ PostgreSQL

เครื่องนี้มี PostgreSQL service รันอยู่แล้วแต่ต้องใช้รหัสผ่านที่เราไม่ทราบ จึงตั้งค่า schema ให้ใช้
**SQLite** ไปก่อน (`prisma/schema.prisma` → `datasource db { provider = "sqlite" }`) เพื่อให้มีสภาพแวดล้อม
dev ที่รันได้ทันที เมื่อจะย้ายไปใช้ PostgreSQL จริงตอน staging/production ให้ทำตามนี้:

1. ใน `prisma/schema.prisma` เปลี่ยน `provider = "postgresql"`
2. เปลี่ยน field ที่เป็น `Float` สองตัว (`Order.totalAmount`, `OrderItem.unitPrice`) กลับเป็น `Decimal @db.Decimal(12, 2)` — เพราะ SQLite ไม่รองรับชนิดข้อมูล decimal โดยตรง
3. ตั้งค่า `DATABASE_URL` ให้ชี้ไปที่ PostgreSQL จริง (มี `docker-compose.yml` เตรียม Postgres สำหรับ local ไว้ให้แล้ว รันด้วย `docker compose up -d`)
4. รัน `npx prisma migrate dev` ใหม่อีกครั้งเพื่อสร้าง migration สำหรับ Postgres

## สถานะการเชื่อมต่อแต่ละแพลตฟอร์ม

| แพลตฟอร์ม   | สถานะ | หมายเหตุ |
|-------------|--------|-------|
| TikTok Shop | ทำ adapter จริงแล้ว ([src/lib/platforms/tiktok.ts](src/lib/platforms/tiktok.ts)) พร้อม OAuth flow เต็มรูปแบบ — ถ้ายังไม่มีร้านเชื่อมต่อจะ fallback ไปใช้ mock data อัตโนมัติ | ตั้งค่า `TIKTOK_SHOP_APP_KEY`/`APP_SECRET`/`SERVICE_ID`/`REDIRECT_URI`/`AUTHORIZE_URL`/`TOKEN_URL`/`REFRESH_URL` ใน `.env` แล้วกด "เชื่อมต่อร้าน TikTok Shop" ที่หน้า Dashboard (ดูหัวข้อถัดไป) |
| Shopee      | ยังเป็น mock ([src/lib/platforms/shopee.ts](src/lib/platforms/shopee.ts)) | ยังไม่มี Partner ID / App Key-Secret — มี TODO ระบุจุดที่ต้องต่อ `order/get_order_list` ไว้ชัดเจน |
| Lazada      | ยังเป็น mock ([src/lib/platforms/lazada.ts](src/lib/platforms/lazada.ts)) | ยังไม่มี App Key/Secret — มี TODO ระบุจุดที่ต้องต่อ `/order/get` ไว้ชัดเจน |

เพราะทุก adapter คืนค่าออกมาในรูปแบบเดียวกันหมด (`NormalizedOrder`) การต่อ Shopee/Lazada เข้าจริงในภายหลัง
**ไม่ต้องแก้ไข** ทั้ง Dashboard, หน้าค้นหา, หน้ารายละเอียดออเดอร์, sync service หรือ Problem Center เลย —
แก้แค่ไฟล์ adapter ของแพลตฟอร์มนั้นๆ พอ

### วิธีเชื่อมต่อ TikTok Shop จริง (OAuth)

TikTok Shop ใช้ระบบ "แอปกลาง" ที่ต้องให้ร้านค้ากด Authorize ก่อนถึงจะได้ access token ต่อร้าน (ไม่ใช่ token คงที่ตัวเดียว) flow ที่เตรียมไว้:

1. ตั้งค่า env 7 ตัวใน `.env` ให้ครบ: `TIKTOK_SHOP_APP_KEY`, `TIKTOK_SHOP_APP_SECRET`, `TIKTOK_SHOP_SERVICE_ID`, `TIKTOK_SHOP_REDIRECT_URI`, `TIKTOK_SHOP_AUTHORIZE_URL`, `TIKTOK_SHOP_TOKEN_URL`, `TIKTOK_SHOP_REFRESH_URL`
2. เข้าหน้า Dashboard แล้วกดปุ่ม **"เชื่อมต่อร้าน TikTok Shop"** — จะพาไปหน้า Authorize ของ TikTok
3. ร้านค้ากด Authorize บนฝั่ง TikTok แล้วจะถูก redirect กลับมาที่ `TIKTOK_SHOP_REDIRECT_URI` (`/api/tiktok/callback`)
4. Callback จะแลก `code` เป็น access token + refresh token ผ่าน [tiktokAuth.ts](src/lib/platforms/tiktokAuth.ts) แล้วดึงรายชื่อร้านที่ authorize มา บันทึกลง DB (`TikTokAuthorization`, `TikTokShop`)
5. หลังจากนั้น adapter จะใช้ token จาก DB ดึงออเดอร์จริงอัตโนมัติ และ refresh token ให้เองก่อนหมดอายุ 10 นาที

**ข้อควรรู้:** `TIKTOK_SHOP_REDIRECT_URI` ต้องเป็น URL ที่ TikTok เรียกถึงได้จริง (public HTTPS) และต้องตรงกับที่ลงทะเบียนไว้ใน TikTok Shop Partner Center เป๊ะๆ — จึงทดสอบ flow นี้แบบ end-to-end บนเครื่อง local (`localhost`) ไม่ได้ ต้อง deploy ขึ้นโดเมนจริงก่อน (เช่น `machermes.kgarden.co.th` ตามที่ตั้งไว้)

## ฟีเจอร์หลัก

- **Dashboard** ([src/app/page.tsx](src/app/page.tsx)) — ยอดออเดอร์แยกตามสถานะ (ใหม่ / รอจัดส่ง / จัดส่งแล้ว / ส่งสำเร็จ / ยกเลิก / ขอคืนเงิน / คืนสินค้า / มีปัญหา) และแยกตามแพลตฟอร์ม พร้อมปุ่ม "Sync ตอนนี้"
- **ค้นหาข้ามแพลตฟอร์ม** ([src/app/orders/page.tsx](src/app/orders/page.tsx), [src/app/api/orders/search/route.ts](src/app/api/orders/search/route.ts)) — พิมพ์เลขคำสั่งซื้อ, เลข Tracking, เบอร์โทร หรือชื่อลูกค้า ระบบจะค้นข้ามทั้ง 3 แพลตฟอร์มให้ในคำสั่งเดียว ถ้ายังไม่เคย sync เข้าระบบก็จะลองดึงสดจากแพลตฟอร์มให้อัตโนมัติ
- **หน้ารายละเอียด Order รวมศูนย์** ([src/app/orders/[id]/page.tsx](src/app/orders/[id]/page.tsx)) — สินค้า/SKU/จำนวน/ยอดชำระ, แพลตฟอร์ม, วันที่สั่ง, Tracking + บริษัทขนส่ง, สถานะจัดส่ง และไทม์ไลน์ประวัติสถานะ
- **Problem Center** ([src/app/problems/page.tsx](src/app/problems/page.tsx)) — รวมทุกออเดอร์ที่มีปัญหา (ขอคืนเงิน/คืนสินค้า, ขนส่งแจ้ง exception, รอจัดส่งเกินกำหนด, หรือแพลตฟอร์มแจ้งสถานะผิดปกติ) ไว้ที่เดียว พร้อมระดับความสำคัญและปุ่มแก้ไข/เปิดใหม่

## ออเดอร์เข้าระบบได้อย่างไร

- `POST /api/sync` — ดึงออเดอร์ล่าสุดจากทุกแพลตฟอร์มแล้ว upsert เข้า DB (ปุ่ม "Sync ตอนนี้" บน Dashboard เรียกอันนี้) สำหรับ production ควรตั้งเป็น cron job
- `POST /api/webhooks/tiktok`, `/api/webhooks/shopee`, `/api/webhooks/lazada` — รับ webhook แจ้งเตือนแบบเรียลไทม์จากแต่ละแพลตฟอร์ม ตอนนี้ TikTok แปลง payload ได้แล้ว ส่วน Shopee/Lazada ยังรอ credential และ**ยังไม่ได้ตรวจสอบลายเซ็นของ webhook** (ต้องทำก่อนใช้งานจริง)

การตรวจจับปัญหา ([src/lib/sync.ts](src/lib/sync.ts) → `detectProblem`) ทำงานทุกครั้งที่มีการ upsert ออเดอร์
ดังนั้นออเดอร์ที่เพิ่ง sync เข้ามาหรือมาจาก webhook จะเปิด `ProblemTicket` ให้เองทันที ไม่ต้องรอคนมาสังเกต

## คำสั่งที่ใช้บ่อย

```bash
npm run db:studio     # Prisma Studio — ดู/แก้ข้อมูลผ่านหน้าเว็บ
npm run db:seed       # สร้างข้อมูล mock ใหม่ (รันซ้ำได้ปลอดภัย เพราะ upsert ตาม platform+order id)
npm run build         # build สำหรับ production พร้อม typecheck
```
# Nimbo
