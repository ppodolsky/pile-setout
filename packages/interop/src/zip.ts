/**
 * Minimal ZIP writer (PKWARE APPNOTE 6.3.x, sections 4.3.7 local header, 4.3.12 central directory,
 * 4.3.16 end of central directory): stored entries only (method 0), no ZIP64, fixed DOS timestamp,
 * UTF-8 names (flag bit 11). Enough for a FreeCAD `.FCStd` container; not a general archiver.
 */
export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 (ISO 3309 / ITU-T V.42, as used by ZIP). */
export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of data) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** 2026-01-01 00:00 in MS-DOS date/time (archives are reproducible byte for byte). */
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

/** A store-only ZIP archive of the entries, in order. */
export function zipStore(entries: readonly ZipEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const crc = crc32(e.data);
    const local = header(30 + name.length, (v) => {
      v.setUint32(0, 0x04034b50, true);
      common(v, 4, crc, e.data.length, name.length);
    });
    local.set(name, 30);
    const dir = header(46 + name.length, (v) => {
      v.setUint32(0, 0x02014b50, true);
      v.setUint16(4, 20, true); // version made by: 2.0, MS-DOS attributes
      common(v, 6, crc, e.data.length, name.length);
      v.setUint32(42, offset, true);
    });
    dir.set(name, 46);
    chunks.push(local, e.data);
    central.push(dir);
    offset += local.length + e.data.length;
  }
  const dirSize = central.reduce((s, c) => s + c.length, 0);
  const end = header(22, (v) => {
    v.setUint32(0, 0x06054b50, true);
    v.setUint16(8, entries.length, true);
    v.setUint16(10, entries.length, true);
    v.setUint32(12, dirSize, true);
    v.setUint32(16, offset, true);
  });
  return concat([...chunks, ...central, end]);
}

/** Fields shared by local and central headers, from "version needed" to the name length. */
function common(v: DataView, at: number, crc: number, size: number, nameLength: number): void {
  v.setUint16(at, 20, true); // version needed to extract: 2.0
  v.setUint16(at + 2, 0x0800, true); // general purpose flags: UTF-8 names
  v.setUint16(at + 4, 0, true); // method: stored
  v.setUint16(at + 6, DOS_TIME, true);
  v.setUint16(at + 8, DOS_DATE, true);
  v.setUint32(at + 10, crc, true);
  v.setUint32(at + 14, size, true); // compressed size
  v.setUint32(at + 18, size, true); // uncompressed size
  v.setUint16(at + 22, nameLength, true);
}

function header(size: number, fill: (v: DataView) => void): Uint8Array {
  const b = new Uint8Array(size);
  fill(new DataView(b.buffer));
  return b;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
