import { describe, expect, it } from 'vitest';
import { FcType, fcstdDocumentXml } from './fcstd';
import { sampleDocument } from './fixtures';
import { exportFCStd, toFCStd, type InteropDocument } from './index';
import { crc32, zipStore } from './zip';

/** Entries of a stored (method 0) ZIP, read through the central directory. */
function unzip(zip: Uint8Array): Map<string, Uint8Array> {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.length - 22;
  expect(v.getUint32(end, true)).toBe(0x06054b50);
  const count = v.getUint16(end + 10, true);
  let at = v.getUint32(end + 16, true);
  const out = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    expect(v.getUint32(at, true)).toBe(0x02014b50);
    expect(v.getUint16(at + 10, true)).toBe(0); // stored
    const crc = v.getUint32(at + 16, true);
    const size = v.getUint32(at + 24, true);
    const nameLen = v.getUint16(at + 28, true);
    const local = v.getUint32(at + 42, true);
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLen));
    expect(v.getUint32(local, true)).toBe(0x04034b50);
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const data = zip.subarray(start, start + size);
    expect(crc32(data)).toBe(crc);
    out.set(name, data);
    at += 46 + nameLen;
  }
  return out;
}

/** Tags balance (enough to catch a broken template; FreeCAD itself is the real check). */
function wellFormed(xml: string): boolean {
  const stack: string[] = [];
  for (const m of xml.replace(/<\?[\s\S]*?\?>|<!--[\s\S]*?-->/g, '').matchAll(/<(\/?)([\w:]+)[^>]*?(\/?)>/g)) {
    if (m[3]) continue;
    if (m[1]) {
      if (stack.pop() !== m[2]) return false;
    } else stack.push(m[2]!);
  }
  return stack.length === 0;
}

const attrs = (tag: string) => Object.fromEntries([...tag.matchAll(/(\w+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));

describe('zip', () => {
  it('CRC-32 check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('stores entries readable through the central directory', () => {
    const a = new TextEncoder().encode('hello');
    const files = unzip(
      zipStore([
        { name: 'a.txt', data: a },
        { name: 'dir/b.bin', data: new Uint8Array([0, 255]) },
      ]),
    );
    expect([...files.keys()]).toEqual(['a.txt', 'dir/b.bin']);
    expect(new TextDecoder().decode(files.get('a.txt'))).toBe('hello');
  });
});

describe('toFCStd', () => {
  const doc = sampleDocument();
  const { xml, warnings } = fcstdDocumentXml(doc);
  const geometry = [...xml.matchAll(/<Geometry type="([^"]+)"/g)].map((m) => m[1]);
  const cons = [...xml.matchAll(/<Constrain [^>]*\/>/g)].map((m) => attrs(m[0]));

  it('is a ZIP with Document.xml, well-formed', () => {
    const files = unzip(toFCStd(doc));
    expect([...files.keys()]).toEqual(['Document.xml']);
    expect(new TextDecoder().decode(files.get('Document.xml'))).toBe(xml);
    expect(wellFormed(xml)).toBe(true);
    expect(xml).toContain('<Object type="Sketcher::SketchObject" name="Sketch" id="1" Touched="1"/>');
  });

  it('has a GeomPoint per point, then the lines, then helper construction lines', () => {
    expect(geometry.slice(0, 11).every((t) => t === 'Part::GeomPoint')).toBe(true);
    expect(geometry.slice(11)).toEqual(Array(8).fill('Part::GeomLineSegment')); // 5 lines + A–F, A–G (angles), B–H (equal)
    expect(xml).toContain(
      `<GeoExtension type="Sketcher::SketchGeometryExtension" id="16" internalGeometryType="0" geometryModeFlags="${'0'.repeat(30)}10"`,
    );
    expect(xml).toContain(`<ConstraintList count="${cons.length}">`);
  });

  it('maps constraints to Sketcher types, values in mm and radians', () => {
    const t = (i: number) => Number(cons[i]!.Type);
    // fix → DistanceX + DistanceY from the root point (GeoId −1, vertex 1)
    expect(cons.slice(0, 2).map((c) => [c.Type, c.First, c.FirstPos, c.Second, c.SecondPos, c.Value])).toEqual([
      ['7', '-1', '1', '0', '1', '0'],
      ['8', '-1', '1', '0', '1', '0'],
    ]);
    expect([t(2), t(3), t(4), t(5), t(6), t(7), t(8), t(9)]).toEqual([
      FcType.DistanceX,
      FcType.Horizontal,
      FcType.Vertical,
      FcType.DistanceY,
      FcType.Parallel,
      FcType.Perpendicular,
      FcType.Symmetric,
      FcType.PointOnObject,
    ]);
    expect(cons[8]).toMatchObject({ First: '0', Second: '1', Third: '4', ThirdPos: '1' }); // M symmetric between A and B
    const angles = cons.filter((c) => Number(c.Type) === FcType.Angle).map((c) => Number(c.Value));
    expect(angles[0]).toBeCloseTo(Math.PI / 4);
    // A→G from the line D→A (reversed: +180°): 30° − 180° = −150°
    expect(angles[1]).toBeCloseTo((-150 * Math.PI) / 180);
    const ends = cons.filter((c) => Number(c.Type) === FcType.Coincident && Number(c.First) >= 11);
    expect(ends).toHaveLength(16); // two per segment
  });

  it('reports the approximated ratio, labels and pile sizes', () => {
    expect(warnings).toEqual([
      'constraint "c11" (ratio 0.25) exported as point-on-line + fixed distance 1500 mm — no ratio constraint in Sketcher',
      '10 label(s) dropped — Sketcher points have no names',
      '5 pile(s) exported as plain points (head, diameter and depth dropped)',
    ]);
  });

  it('writes negative ΔX as a positive DistanceX with the points swapped', () => {
    const d: InteropDocument = {
      units: 'mm',
      points: [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: -5, y: 0 },
      ],
      lines: [],
      constraints: [{ id: '1', kind: 'dx', a: 'a', b: 'b', d: -5 }],
      piles: [],
    };
    const c = attrs(/<Constrain [^>]*\/>/.exec(fcstdDocumentXml(d).xml)![0]);
    expect([c.Type, c.First, c.Second, c.Value]).toEqual(['7', '1', '0', '5']);
    expect(exportFCStd(d).warnings).toEqual([]);
  });

  it('escapes the document name', () => {
    expect(fcstdDocumentXml({ ...sampleDocument(), name: 'A & "B" <C>' }).xml).toContain(
      '<String value="A &amp; &quot;B&quot; &lt;C&gt;"/>',
    );
  });
});
