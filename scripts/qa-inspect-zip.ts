import * as XLSX from "xlsx";
import * as zlib from "zlib";

// Minimal ZIP central-directory reader (read-only, for inspection).
function listZipEntries(buf: Buffer): { name: string; data: Buffer }[] {
  // Find End Of Central Directory record (EOCD signature 0x06054b50), scanning from the end.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("EOCD not found");
  const cdOffset = buf.readUInt32LE(eocd + 16);
  const cdCount = buf.readUInt16LE(eocd + 10);
  const entries: { name: string; data: Buffer }[] = [];
  let p = cdOffset;
  for (let i = 0; i < cdCount; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("bad central dir header at " + p);
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localHeaderOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    // Read local file header to find actual data start (extra field length may differ).
    const lfhExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
    const lfhNameLen = buf.readUInt16LE(localHeaderOffset + 26);
    const dataStart = localHeaderOffset + 30 + lfhNameLen + lfhExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);
    const data = method === 0 ? Buffer.from(raw) : zlib.inflateRawSync(raw);
    entries.push({ name, data });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

const rows = [["Flash Express", "", "", "", "Flash Express", "", "", "", ""], ["TRK123", "SS16-150-15-30M x1", "", "", "รับสินค้าจำนวน_______", "", "ชิ้น", "ผู้รับสินค้า_____________", ""]];
const sheet = XLSX.utils.aoa_to_sheet(rows);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, sheet, "ใบเตรียมสินค้า");
const buf = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

const entries = listZipEntries(buf);
for (const e of entries) console.log(e.name);
console.log("\n--- xl/styles.xml ---");
console.log(entries.find(e => e.name === "xl/styles.xml")?.data.toString("utf8"));
console.log("\n--- xl/worksheets/sheet1.xml ---");
console.log(entries.find(e => e.name === "xl/worksheets/sheet1.xml")?.data.toString("utf8"));
