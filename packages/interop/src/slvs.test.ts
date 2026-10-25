import { readFileSync } from 'node:fs';
import { solveSketch, type Constraint } from '@buildkit/sketch';
import { describe, expect, it } from 'vitest';
import { canonical, sampleDocument } from './fixtures';
import { InteropError, exportSLVS, fromSLVS, toSLVS, toSLVSBytes, type InteropDocument } from './index';
import { ConstraintType as CT, X_AXIS, Y_AXIS, hex8, parseRecords, slvsText } from './slvs-format';
import { angleOf } from './slvs-read';

const fixture = (name: string) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url));

const twoPoints = (constraints: Constraint[] = []): InteropDocument => ({
  units: 'mm',
  points: [
    { id: 'a', x: 0, y: 0 },
    { id: 'b', x: 1000, y: 0 },
  ],
  lines: [],
  constraints,
  piles: [],
});

/** SolveSpace constraint records of an export (type, handles, value). */
const records = (text: string, kind: string) => parseRecords(text).filter((r) => r.kind === kind);

describe('toSLVS — file structure (SolveSpace src/file.cpp)', () => {
  it('starts with the version line, then groups, params, requests, entities, constraints in order', () => {
    const text = toSLVS(twoPoints([{ id: 'd', kind: 'distance', a: 'a', b: 'b', d: 1000 }]));
    expect(text.startsWith('\u00b1\u00b2\u00b3SolveSpaceREVa\n\n\nGroup.h.v=00000001\n')).toBe(true);
    const kinds = parseRecords(text).map((r) => r.kind);
    const firstOf = (k: string) => kinds.indexOf(k);
    expect(firstOf('AddGroup')).toBeLessThan(firstOf('AddParam'));
    expect(firstOf('AddParam')).toBeLessThan(firstOf('AddRequest'));
    expect(firstOf('AddRequest')).toBeLessThan(firstOf('AddEntity'));
    expect(firstOf('AddEntity')).toBeLessThan(firstOf('AddConstraint'));
    expect(kinds.filter((k) => k === 'AddGroup')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'AddRequest')).toHaveLength(5); // 3 reference planes + 2 datum points
  });

  it('writes a point and a distance exactly like SolveSpace (zero values omitted, %.20f reals)', () => {
    const text = toSLVS(twoPoints([{ id: 'd', kind: 'distance', a: 'a', b: 'b', d: 1000 }]));
    expect(text).toContain('Param.h.v.=00050010\nParam.val=1000.00000000000000000000\nAddParam\n\nParam.h.v.=00050011\nAddParam\n\n');
    expect(text).toContain(
      'Request.h.v=00000004\nRequest.type=101\nRequest.workplane.v=80020000\nRequest.group.v=00000002\nRequest.construction=0\nAddRequest\n\n',
    );
    expect(text).toContain(
      'Entity.h.v=00050000\nEntity.type=2001\nEntity.construction=0\nEntity.workplane.v=80020000\n' +
        'Entity.actPoint.x=1000.00000000000000000000\nEntity.actVisible=1\nAddEntity\n\n',
    );
    expect(text).toContain(
      'Constraint.h.v=00000001\nConstraint.type=30\nConstraint.group.v=00000002\nConstraint.workplane.v=80020000\n' +
        'Constraint.valA=1000.00000000000000000000\nConstraint.ptA.v=00040000\nConstraint.ptB.v=00050000\n' +
        'Constraint.other=0\nConstraint.other2=0\nConstraint.reference=0\nAddConstraint\n\n',
    );
  });

  it('joins a segment to its datum points with POINTS_COINCIDENT on the segment ends', () => {
    const doc = { ...twoPoints(), lines: [{ id: 'l', a: 'a', b: 'b' }] };
    const cons = records(toSLVS(doc), 'AddConstraint');
    expect(cons.map((c) => [c.fields.get('Constraint.type'), c.fields.get('Constraint.ptA.v'), c.fields.get('Constraint.ptB.v')])).toEqual([
      ['20', '00060001', '00040000'],
      ['20', '00060002', '00050000'],
    ]);
  });

  it('writes the version line as bytes B1 B2 B3 and the rest as UTF-8', () => {
    const doc = twoPoints();
    doc.points[0]!.label = 'Свая 1';
    const bytes = toSLVSBytes(doc);
    expect([...bytes.subarray(0, 4)]).toEqual([0xb1, 0xb2, 0xb3, 0x53]);
    expect(slvsText(bytes)).toBe(toSLVS(doc));
    expect(new TextDecoder().decode(bytes)).toContain('Constraint.comment=Свая 1');
  });
});

describe('toSLVS — constraint mapping', () => {
  const doc = sampleDocument();
  const { output, warnings } = exportSLVS(doc);
  const cons = records(output, 'AddConstraint');
  const field = (i: number, k: string) => cons[i]?.fields.get(`Constraint.${k}`);
  const type = (i: number) => Number(field(i, 'type'));

  it('maps every kind to a native SolveSpace constraint (no warnings)', () => {
    expect(warnings).toEqual([]);
    // c1…c18 in order; ratio 0.25 takes two (PT_ON_LINE + LENGTH_RATIO)
    expect(cons.slice(0, 19).map((_, i) => type(i))).toEqual([
      CT.WHERE_DRAGGED,
      CT.PROJ_PT_DISTANCE,
      CT.HORIZONTAL,
      CT.VERTICAL,
      CT.PROJ_PT_DISTANCE,
      CT.PARALLEL,
      CT.PERPENDICULAR,
      CT.AT_MIDPOINT,
      CT.PT_ON_LINE,
      CT.PROJ_PT_DISTANCE,
      CT.PT_ON_LINE,
      CT.LENGTH_RATIO,
      CT.POINTS_COINCIDENT,
      CT.PT_PT_DISTANCE,
      CT.ANGLE,
      CT.PT_PT_DISTANCE,
      CT.ANGLE,
      CT.VERTICAL,
      CT.EQUAL_LENGTH_LINES,
    ]);
  });

  it('projects ΔX / ΔY onto the YZ / ZX plane normals (+X / +Y)', () => {
    expect(field(1, 'entityA.v')).toBe(hex8(X_AXIS));
    expect(field(4, 'entityA.v')).toBe(hex8(Y_AXIS));
    expect(Number(field(1, 'valA'))).toBe(6000);
  });

  it('gives PT_ON_LINE its parameter, seeded with the position along the line', () => {
    const valP = field(8, 'valP.v')!;
    expect(valP).toBe('40000009');
    const param = records(output, 'AddParam').find((p) => p.fields.get('Param.h.v.') === valP);
    expect(Number(param?.fields.get('Param.val'))).toBeCloseTo(0.5); // N in the middle of D–C
  });

  it('adds helper construction lines in the buildkit-helper style only where a line is missing', () => {
    const reqs = records(output, 'AddRequest').filter((r) => r.fields.get('Request.style') === '00000100');
    // A–B, D–C, A–D exist; helpers: A–F, A–G (angles), A–R (ratio length), B–H (equal)
    expect(reqs).toHaveLength(4);
    expect(reqs.every((r) => r.fields.get('Request.construction') === '1')).toBe(true);
    expect(records(output, 'AddStyle')[0]?.fields.get('Style.name')).toBe('buildkit-helper');
  });

  it('writes a fixed point at its fix position', () => {
    const d = twoPoints([{ id: 'f', kind: 'fix', p: 'b', x: 1234.5, y: -50 }]);
    const params = records(toSLVS(d), 'AddParam');
    const val = (h: string) => Number(params.find((p) => p.fields.get('Param.h.v.') === h)?.fields.get('Param.val') ?? 0);
    expect([val('00050010'), val('00050011')]).toEqual([1234.5, -50]);
  });

  it('reports constraint kinds it does not know instead of dropping them silently', () => {
    const odd = { id: 'x', kind: 'tangent', a: 'a', b: 'b' } as unknown as Constraint;
    expect(exportSLVS(twoPoints([odd])).warnings).toEqual(['constraint "x" (tangent) has no SolveSpace equivalent — dropped']);
  });

  it('rejects documents with dangling references', () => {
    expect(() => toSLVS(twoPoints([{ id: 'd', kind: 'distance', a: 'a', b: 'zz', d: 1 }]))).toThrow(InteropError);
  });
});

describe('SolveSpace round trip', () => {
  const doc = sampleDocument();
  const back = fromSLVS(toSLVS(doc));
  const rename = (id: string) => `p${doc.points.findIndex((p) => p.id === id) + 1}`;

  it('keeps points (positions, labels) and lines', () => {
    expect(back.warnings).toEqual([]);
    expect(back.document.points.map((p) => [p.x, p.y, p.label])).toEqual(doc.points.map((p) => [p.x, p.y, p.label]));
    expect(back.document.lines.map((l) => [l.a, l.b, !!l.construction])).toEqual(
      doc.lines.map((l) => [rename(l.a), rename(l.b), !!l.construction]),
    );
  });

  it('keeps every constraint with its value', () => {
    expect(back.document.constraints.map((c) => canonical(c, (id) => id))).toEqual(doc.constraints.map((c) => canonical(c, rename)));
  });

  it('keeps piles (head, diameter, depth) through point comments', () => {
    expect(back.document.piles).toEqual(doc.piles.map((p) => ({ ...p, point: rename(p.point) })));
  });

  it('gives a sketch our solver finds fully determined, at the same positions', () => {
    const s = solveSketch(back.document.points, back.document.constraints);
    expect(s.conflicts).toEqual([]);
    expect(s.dof).toBe(0);
    for (const p of back.document.points) {
      expect(s.positions.get(p.id)!.x).toBeCloseTo(p.x, 6);
      expect(s.positions.get(p.id)!.y).toBeCloseTo(p.y, 6);
    }
  });

  it('keeps negative ΔX, angles below the X axis and ratios beyond the segment', () => {
    const d: InteropDocument = {
      units: 'mm',
      points: [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: -700, y: -700 },
        { id: 'p', x: -1050, y: -1050 },
      ],
      lines: [],
      constraints: [
        { id: '1', kind: 'dx', a: 'a', b: 'b', d: -700 },
        { id: '2', kind: 'angle', a: 'a', b: 'b', angle: -135, ref: null },
        { id: '3', kind: 'ratio', p: 'p', a: 'a', b: 'b', t: 1.5 },
      ],
      piles: [],
    };
    const r = fromSLVS(toSLVS(d));
    expect(r.document.constraints.map((c) => canonical(c, (id) => id))).toEqual(
      d.constraints.map((c) => canonical(c, (id) => `p${'abp'.indexOf(id) + 1}`)),
    );
  });

  it('reads the on-disk bytes as well as text', () => {
    expect(fromSLVS(toSLVSBytes(doc)).document).toEqual(back.document);
  });
});

describe('fromSLVS — a sketch drawn in SolveSpace (fixture regenerated by solvespace-cli)', () => {
  const r = fromSLVS(fixture('solvespace-polyline.slvs'));

  it('joins segment ends held by POINTS_COINCIDENT into shared points', () => {
    expect(r.document.points.map((p) => [p.x, p.y])).toEqual([
      [0, 0],
      [4000, 0],
      [4000, 3000],
      [0, 3000],
    ]);
    expect(r.document.lines.map((l) => [l.a, l.b])).toEqual([
      ['p1', 'p2'],
      ['p2', 'p3'],
      ['p3', 'p4'],
    ]);
  });

  it('maps line constraints, a lock and a point comment', () => {
    expect(r.document.constraints.map((c) => canonical(c, (id) => id))).toEqual([
      ['horizontal', ['p1', 'p2']],
      ['vertical', ['p2', 'p3']],
      ['distance', ['p1', 'p2'], 4000],
      ['angle', 'p3', 'p2', 'p4', 90],
      ['fix', 'p1', 0, 0],
    ]);
    expect(r.document.points[0]!.label).toBe('Origin pile');
  });

  it('reports what it drops', () => {
    expect(r.warnings).toEqual([
      '1 circle request(s) not supported — dropped',
      'constraint 7 (DIAMETER) has no sketch equivalent — dropped',
      'constraint 8 (PT_PT_DISTANCE) is a reference (driven) dimension — dropped',
      'constraint 9 (COMMENT) is free text, not attached to a point — dropped',
      'constraint 12 (PT_ON_LINE) is not a point on a sketch line — dropped',
    ]);
  });

  it('rejects text that is not a SolveSpace file', () => {
    expect(() => fromSLVS('hello')).toThrow(/not a SolveSpace file/);
  });
});

describe('angleOf — SolveSpace ANGLE (unsigned, p0 − p1 vectors) to a signed angle', () => {
  const at: Record<string, { x: number; y: number }> = { o: { x: 0, y: 0 }, e: { x: 10, y: 0 }, n: { x: 0, y: 10 }, s: { x: 0, y: -10 } };
  const pos = (id: string) => at[id]!;

  it('line against the X axis, with and without `other`', () => {
    expect(angleOf({ entityA: 1, entityB: X_AXIS, other: true, valA: 90 }, ['o', 'n'], null, pos)).toEqual({
      a: 'o',
      b: 'n',
      ref: null,
      angle: 90,
    });
    expect(angleOf({ entityA: 1, entityB: X_AXIS, other: false, valA: 90 }, ['o', 's'], null, pos)).toEqual({
      a: 's',
      b: 'o',
      ref: null,
      angle: 90,
    });
    expect(angleOf({ entityA: 1, entityB: X_AXIS, other: true, valA: 90 }, ['o', 's'], null, pos)).toEqual({
      a: 'o',
      b: 's',
      ref: null,
      angle: -90,
    });
  });

  it('two segments sharing an end: supplement when the vectors point opposite ways', () => {
    // o→e and o→n: vectors o−e and o−n both point into o → same sense → 90
    expect(angleOf({ entityA: 1, entityB: 2, other: false, valA: 90 }, ['o', 'e'], ['o', 'n'], pos)).toEqual({
      a: 'o',
      b: 'e',
      ref: 'n',
      angle: -90,
    });
    // e→o and o→n: opposite senses → ∠ = 180 − valA
    expect(angleOf({ entityA: 1, entityB: 2, other: false, valA: 60 }, ['e', 'o'], ['o', 'n'], pos)?.angle).toBe(-120);
  });

  it('gives up on segments without a common end', () => {
    expect(angleOf({ entityA: 1, entityB: 2, other: false, valA: 90 }, ['o', 'e'], ['n', 's'], pos)).toBeNull();
  });
});
