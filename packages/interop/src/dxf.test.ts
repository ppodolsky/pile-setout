import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeMText, decodeText, squareOf, tokenize } from './dxf-read';
import { dxfString, real } from './dxf-write';
import { sampleDocument } from './fixtures';
import { exportDXF, fromDXF, toDXF, type InteropDocument } from './index';

const fixture = (name: string) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8');

/** Entities of the ENTITIES section as [type, pairs] (codes as numbers). */
function entities(text: string): { type: string; pairs: [number, string][] }[] {
  const pairs = tokenize(text);
  const start = pairs.findIndex((p, i) => p.code === 2 && p.value === 'ENTITIES' && pairs[i - 1]?.value === 'SECTION');
  const out: { type: string; pairs: [number, string][] }[] = [];
  for (const p of pairs.slice(start + 1)) {
    if (p.code === 0 && p.value === 'ENDSEC') break;
    if (p.code === 0) out.push({ type: p.value, pairs: [] });
    else out.at(-1)!.pairs.push([p.code, p.value]);
  }
  return out;
}

const small: InteropDocument = {
  units: 'mm',
  points: [
    { id: 'a', x: 0, y: 0, label: 'P1' },
    { id: 'b', x: 2500.5, y: -100 },
  ],
  lines: [
    { id: 'l', a: 'a', b: 'b' },
    { id: 'k', a: 'b', b: 'a', construction: true },
  ],
  constraints: [{ id: 'd', kind: 'distance', a: 'a', b: 'b', d: 2502.5 }],
  piles: [{ point: 'a', head: 400, diameter: 300, depth: 2000 }],
};

describe('toDXF — R12 structure (AutoCAD DXF reference)', () => {
  const text = toDXF(small);
  const pairs = tokenize(text);

  it('has HEADER, TABLES, ENTITIES and EOF, AC1009, codes right-aligned in three columns', () => {
    const sections = pairs.filter((p, i) => pairs[i - 1]?.value === 'SECTION' && p.code === 2).map((p) => p.value);
    expect(sections).toEqual(['HEADER', 'TABLES', 'ENTITIES']);
    expect(text.split('\n').slice(0, 2)).toEqual(['999', 'Buildkit interop export — units: millimetres']);
    expect(text).toContain('  9\n$ACADVER\n  1\nAC1009\n');
    expect(text.endsWith('  0\nENDSEC\n  0\nEOF\n')).toBe(true);
    expect(
      text
        .split('\n')
        .filter((_, i) => i % 2 === 0 && i > 1)
        .every((c) => c === '' || /^[ \d]{3}$/.test(c)),
    ).toBe(true);
  });

  it('defines the layers, CONSTRUCTION dashed, before the entities use them', () => {
    const layers = pairs.filter((p, i) => p.code === 2 && pairs[i - 1]?.value === 'LAYER').map((p) => p.value);
    expect(layers).toEqual(['0', 'SKETCH', 'CONSTRUCTION', 'PILES', 'LABELS']);
    expect(text).toContain('  0\nLAYER\n  2\nCONSTRUCTION\n 70\n0\n 62\n8\n  6\nDASHED\n');
    expect(text.indexOf('  0\nLTYPE\n  2\nDASHED')).toBeLessThan(text.indexOf('  0\nLAYER'));
  });

  it('writes POINT, LINE, a closed POLYLINE/VERTEX/SEQEND square, CIRCLE and TEXT with their group codes', () => {
    const ents = entities(text);
    expect(ents.map((e) => `${e.type}:${e.pairs.find(([c]) => c === 8)?.[1]}`)).toEqual([
      'POINT:SKETCH',
      'POINT:SKETCH',
      'LINE:SKETCH',
      'LINE:CONSTRUCTION',
      'POLYLINE:PILES',
      'VERTEX:PILES',
      'VERTEX:PILES',
      'VERTEX:PILES',
      'VERTEX:PILES',
      'SEQEND:PILES',
      'CIRCLE:PILES',
      'TEXT:LABELS',
    ]);
    expect(ents[1]!.pairs).toEqual([
      [8, 'SKETCH'],
      [10, '2500.5'],
      [20, '-100.0'],
      [30, '0.0'],
    ]);
    expect(ents[2]!.pairs.map(([c]) => c)).toEqual([8, 10, 20, 30, 11, 21, 31]);
    // vertices-follow flag 66, dummy point, thickness = −depth, closed flag 70 = 1
    expect(ents[4]!.pairs).toEqual([
      [8, 'PILES'],
      [66, '1'],
      [10, '0.0'],
      [20, '0.0'],
      [30, '0.0'],
      [39, '-2000.0'],
      [70, '1'],
    ]);
    expect(ents.slice(5, 9).map((e) => [e.pairs[1]![1], e.pairs[2]![1]])).toEqual([
      ['-200.0', '-200.0'],
      ['200.0', '-200.0'],
      ['200.0', '200.0'],
      ['-200.0', '200.0'],
    ]);
    expect(ents[10]!.pairs).toContainEqual([40, '150.0']);
    expect(ents[11]!.pairs.filter(([c]) => c === 1 || c === 40)).toEqual([
      [40, '50.0'],
      [1, 'P1'],
    ]);
  });

  it('says constraints are dropped', () => {
    expect(exportDXF(small).warnings).toEqual(['1 constraint(s) dropped — DXF stores geometry only']);
  });
});

describe('DXF values', () => {
  it('reals: fixed notation, 1 nm, always a decimal point', () => {
    expect([real(0), real(-0), real(1e-12), real(1e-7), real(12), real(0.1 + 0.2), real(-2500.5)]).toEqual([
      '0.0',
      '0.0',
      '0.0',
      '0.0000001',
      '12.0',
      '0.3',
      '-2500.5',
    ]);
  });

  it('strings: one ASCII line, other characters as \\U+XXXX, and back', () => {
    expect(dxfString('Свая\n1 Ø')).toBe('\\U+0421\\U+0432\\U+0430\\U+044F 1 \\U+00D8');
    expect(decodeText(dxfString('Свая 1 Ø'))).toBe('Свая 1 Ø');
    expect(decodeText('%%c300 %%d %%p5 100%%%')).toBe('Ø300 ° ±5 100%');
  });

  it('MTEXT: formatting codes stripped', () => {
    expect(decodeMText('{\\fArial|b1;P\\U+00F6-1}\\PSecond \\S1^2;')).toBe('Pö-1 Second 1/2');
  });

  it('squares: any orientation, closing vertex optional', () => {
    const rot = [0, 90, 180, 270].map((a) => ({
      x: 10 + 5 * Math.cos(((a + 30) * Math.PI) / 180),
      y: 5 * Math.sin(((a + 30) * Math.PI) / 180),
    }));
    expect(squareOf(rot, 1e-6)?.side).toBeCloseTo(5 * Math.SQRT2);
    expect(squareOf([...rot, rot[0]!], 1e-6)?.c.x).toBeCloseTo(10);
    expect(
      squareOf(
        [
          { x: 0, y: 0 },
          { x: 2, y: 0 },
          { x: 2, y: 1 },
          { x: 0, y: 1 },
        ],
        1e-6,
      ),
    ).toBeNull();
  });
});

describe('DXF round trip', () => {
  const doc = sampleDocument();
  const back = fromDXF(toDXF(doc));

  it('keeps points (coincident ones merged) and lines', () => {
    expect(back.warnings).toEqual([]);
    // E sits on B: one point within 0.01 mm
    const expected = doc.points.filter((p) => p.id !== 'E');
    expect(back.document.points.map((p) => [p.x, p.y])).toEqual(
      expected.map((p) => [Math.round(p.x * 1e9) / 1e9, Math.round(p.y * 1e9) / 1e9]),
    );
    const id = (pid: string) => `p${expected.findIndex((p) => p.id === pid) + 1}`;
    expect(back.document.lines.map((l) => [l.a, l.b, !!l.construction])).toEqual(
      doc.lines.map((l) => [id(l.a), id(l.b), !!l.construction]),
    );
    expect(back.document.constraints).toEqual([]);
  });

  it('keeps piles (head, diameter, depth) and labels', () => {
    const id = (pid: string) => `p${doc.points.findIndex((p) => p.id === pid) + 1}`;
    expect(back.document.piles.map((p) => ({ ...p }))).toEqual(
      doc.piles.map((p) => ({
        point: id(p.point),
        head: p.head,
        ...(p.depth ? { depth: p.depth } : {}),
        ...(p.diameter ? { diameter: p.diameter } : {}),
        label: p.label,
      })),
    );
    expect(back.document.points.filter((p) => p.label).map((p) => p.label)).toEqual(['P1', 'P2', 'P3', 'P4', 'M1']);
  });

  it('survives CRLF line ends and unpadded group codes', () => {
    const crlf = toDXF(doc)
      .split('\n')
      .map((l) => l.trim())
      .join('\r\n');
    expect(fromDXF(crlf).document).toEqual(back.document);
  });
});

describe('fromDXF — third-party R2000 file in metres (fixture written by ezdxf)', () => {
  const r = fromDXF(fixture('ezdxf-r2000-metres.dxf'));
  const at = (x: number, y: number) => r.document.points.find((p) => Math.abs(p.x - x) < 1e-6 && Math.abs(p.y - y) < 1e-6);

  it('converts metres to millimetres and shares polyline corners with the line on them', () => {
    expect(r.warnings).toContain('drawing units are metres — converted to millimetres');
    const corners = [at(0, 0), at(6000, 0), at(6000, 2400), at(0, 2400)];
    expect(corners.every(Boolean)).toBe(true);
    const diag = r.document.lines.find((l) => l.construction);
    expect([diag?.a, diag?.b]).toEqual([corners[0]!.id, corners[2]!.id]);
    expect(r.document.lines.filter((l) => !l.construction)).toHaveLength(5); // 4 outline edges + the bulged one
  });

  it('reads the square + circle on the Piles layer as one pile, MTEXT as its label', () => {
    const p = at(1000, 1000)!;
    expect(r.document.piles).toEqual([{ point: p.id, head: 400, diameter: 300, depth: 2000, label: 'Pö-1' }]);
    expect(p.label).toBe('Pö-1');
    expect(at(6000, 2400)?.label).toBe('Corner');
    expect(at(3000, 0)).toBeDefined(); // POINT
  });

  it('reports bulges, unsupported entities and circles reduced to their centre', () => {
    expect(r.warnings).toEqual([
      'drawing units are metres — converted to millimetres',
      '1 polyline arc segment(s) (bulge) read as straight lines',
      '1 ARC entity not supported — dropped',
      '1 INSERT entity not supported — dropped (blocks are not expanded)',
      '1 circle(s) read as their centre point (radius dropped)',
    ]);
    expect(at(4000, 1000)).toBeDefined();
  });
});

describe('fromDXF — edge cases', () => {
  const wrap = (body: string) => `0\nSECTION\n2\nENTITIES\n${body}0\nENDSEC\n0\nEOF\n`;

  it('uses the second alignment point of justified TEXT', () => {
    const r = fromDXF(wrap('0\nPOINT\n8\n0\n10\n100\n20\n100\n0\nTEXT\n8\n0\n10\n0\n20\n0\n11\n120\n21\n110\n40\n10\n1\nX1\n72\n1\n'));
    expect(r.document.points[0]!.label).toBe('X1');
  });

  it('drops text far from every point', () => {
    const r = fromDXF(wrap('0\nPOINT\n8\n0\n10\n0\n20\n0\n0\nTEXT\n8\n0\n10\n500\n20\n500\n40\n10\n1\nfar\n'));
    expect(r.document.points[0]!.label).toBeUndefined();
    expect(r.warnings).toEqual(['1 text(s) not next to a point (or a second text at one) — dropped']);
  });

  it('mirrors OCS entities with extrusion (0, 0, −1)', () => {
    const r = fromDXF(wrap('0\nCIRCLE\n8\nPILES\n10\n100\n20\n50\n30\n0\n40\n150\n210\n0\n220\n0\n230\n-1\n'));
    expect(r.document.points[0]).toMatchObject({ x: -100, y: 50 });
    expect(r.document.piles[0]).toMatchObject({ diameter: 300 });
  });

  it('merges points closer than the tolerance only', () => {
    const r = fromDXF(wrap('0\nLINE\n8\n0\n10\n0\n20\n0\n11\n10\n21\n0\n0\nLINE\n8\n0\n10\n10.005\n20\n0\n11\n10.02\n21\n5\n'));
    expect(r.document.points.map((p) => p.x)).toEqual([0, 10, 10.02]);
    expect(r.document.lines.map((l) => [l.a, l.b])).toEqual([
      ['p1', 'p2'],
      ['p2', 'p3'],
    ]);
  });

  it('refuses binary DXF with a warning', () => {
    expect(fromDXF('AutoCAD Binary DXF\r\n\u001a\u0000').warnings).toEqual(['binary DXF is not supported — save as ASCII DXF']);
  });
});
