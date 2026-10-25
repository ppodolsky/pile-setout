import type { Constraint } from '@buildkit/sketch';
import type { ImportResult, InteropLine, InteropPile, InteropPoint } from './model';
import {
  ConstraintType as CT,
  GroupType,
  RequestType,
  X_AXIS,
  Y_AXIS,
  constraintTypeName,
  hex8,
  parseRecords,
  requestEntity,
  requestParam,
  slvsText,
  type SlvsRecord,
} from './slvs-format';
import { HELPER_STYLE_NAME } from './slvs-write';

/**
 * SolveSpace import (subset): datum points and line segments of the drawing groups, with the
 * constraints that have a `@buildkit/sketch` equivalent.
 *
 * Segment ends joined by POINTS_COINCIDENT become one point (SolveSpace's way of joining lines; a
 * datum point coincident with them becomes that point). POINTS_COINCIDENT between two datum points
 * stays a `coincident` constraint. Mapped back: WHERE_DRAGGED → fix, PT_PT_DISTANCE → distance,
 * PROJ_PT_DISTANCE along X/Y → dx/dy, HORIZONTAL/VERTICAL → horizontal/vertical, ANGLE against the
 * X axis or between two segments sharing an end → angle, AT_MIDPOINT → ratio ½, PT_ON_LINE (+
 * LENGTH_RATIO) → onLine (ratio), PARALLEL/PERPENDICULAR/EQUAL_LENGTH_LINES → parallel/
 * perpendicular/equal; COMMENTs on a point → its label or pile ("pile head=… diameter=… depth=…").
 * Helper construction lines in the "buildkit-helper" style are left out. Everything else — arcs,
 * circles, curves, 3D groups, reference dimensions, other constraints — is listed in `warnings`.
 *
 * Point positions are the stored (solved) ones; ids are generated (p1…, l1…, c<handle>).
 *
 * @param input file text, or the raw file bytes (its first line is Latin-1, the rest UTF-8).
 */
export function fromSLVS(input: string | Uint8Array): ImportResult {
  const text = typeof input === 'string' ? input : slvsText(input);
  const warnings: string[] = [];
  const file = readFile(parseRecords(text), warnings);
  const pts = resolvePoints(file, warnings);
  const { constraints, piles } = mapConstraints(file, pts, warnings);
  const lines = mapLines(file, pts, warnings);
  return { document: { units: 'mm', points: pts.points, lines, constraints, piles }, warnings };
}

interface Req {
  h: number;
  type: number;
  construction: boolean;
  style: number;
}
interface Con {
  h: number;
  type: number;
  valA: number;
  ptA: number;
  ptB: number;
  entityA: number;
  entityB: number;
  other: boolean;
  reference: boolean;
  comment: string;
}
interface SlvsFile {
  requests: Req[];
  constraints: Con[];
  params: Map<number, number>;
  /** actPoint of point entities (global x, y, z). */
  act: Map<number, { x: number; y: number; z: number }>;
  styles: Map<number, string>;
  /** Point entities of datum-point requests. */
  datums: Set<number>;
  /** Line entity → its two point entities. */
  segments: Map<number, [number, number]>;
}

const hx = (r: SlvsRecord, key: string): number => Number.parseInt(r.fields.get(key) ?? '0', 16) >>> 0;
const int = (r: SlvsRecord, key: string): number => Number.parseInt(r.fields.get(key) ?? '0', 10) || 0;
const flt = (r: SlvsRecord, key: string): number => Number.parseFloat(r.fields.get(key) ?? '0') || 0;

function readFile(records: readonly SlvsRecord[], warnings: string[]): SlvsFile {
  const file: SlvsFile = {
    requests: [],
    constraints: [],
    params: new Map(),
    act: new Map(),
    styles: new Map(),
    datums: new Set(),
    segments: new Map(),
  };
  const solids = new Set<string>();
  for (const r of records) {
    switch (r.kind) {
      case 'AddGroup': {
        const type = int(r, 'Group.type');
        if (type !== GroupType.DRAWING_3D && type !== GroupType.DRAWING_WORKPLANE) solids.add(r.fields.get('Group.name') ?? hex8(type));
        break;
      }
      case 'AddParam':
        file.params.set(hx(r, 'Param.h.v.'), flt(r, 'Param.val'));
        break;
      case 'AddRequest':
        file.requests.push({
          h: hx(r, 'Request.h.v'),
          type: int(r, 'Request.type'),
          construction: int(r, 'Request.construction') !== 0,
          style: hx(r, 'Request.style'),
        });
        break;
      case 'AddEntity':
        if (r.fields.has('Entity.actPoint.x') || r.fields.has('Entity.actPoint.y') || [2000, 2001].includes(int(r, 'Entity.type'))) {
          file.act.set(hx(r, 'Entity.h.v'), {
            x: flt(r, 'Entity.actPoint.x'),
            y: flt(r, 'Entity.actPoint.y'),
            z: flt(r, 'Entity.actPoint.z'),
          });
        }
        break;
      case 'AddConstraint':
        file.constraints.push({
          h: hx(r, 'Constraint.h.v'),
          type: int(r, 'Constraint.type'),
          valA: flt(r, 'Constraint.valA'),
          ptA: hx(r, 'Constraint.ptA.v'),
          ptB: hx(r, 'Constraint.ptB.v'),
          entityA: hx(r, 'Constraint.entityA.v'),
          entityB: hx(r, 'Constraint.entityB.v'),
          other: int(r, 'Constraint.other') !== 0,
          reference: int(r, 'Constraint.reference') !== 0,
          comment: r.fields.get('Constraint.comment') ?? '',
        });
        break;
      case 'AddStyle':
        file.styles.set(hx(r, 'Style.h.v'), r.fields.get('Style.name') ?? '');
        break;
    }
  }
  for (const q of file.requests) {
    if (q.type === RequestType.DATUM_POINT) file.datums.add(requestEntity(q.h, 0));
    if (q.type === RequestType.LINE_SEGMENT) file.segments.set(requestEntity(q.h, 0), [requestEntity(q.h, 1), requestEntity(q.h, 2)]);
  }
  if (solids.size) warnings.push(`3D groups ignored (${[...solids].join(', ')}) — only sketch geometry is read`);
  const skipped = new Map<number, number>();
  for (const q of file.requests) {
    if (q.type !== RequestType.DATUM_POINT && q.type !== RequestType.LINE_SEGMENT && q.type !== RequestType.WORKPLANE) {
      skipped.set(q.type, (skipped.get(q.type) ?? 0) + 1);
    }
  }
  const names: Record<number, string> = { 300: 'cubic', 301: 'periodic cubic', 400: 'circle', 500: 'arc', 600: 'text', 700: 'image' };
  for (const [type, n] of skipped) warnings.push(`${n} ${names[type] ?? `request type ${type}`} request(s) not supported — dropped`);
  return file;
}

interface Points {
  points: InteropPoint[];
  /** SolveSpace point entity → neutral point id. */
  of: Map<number, string>;
  at: Map<string, InteropPoint>;
  /** Coincidences between datum points that ended up joined through segment ends. */
  joined: [string, string][];
}

const isDatum = (file: SlvsFile, h: number) => file.datums.has(h);

/** Point entities of the supported requests, merged along POINTS_COINCIDENT (see {@link fromSLVS}). */
function resolvePoints(file: SlvsFile, warnings: string[]): Points {
  const members: number[] = [];
  for (const q of file.requests) {
    if (q.type === RequestType.DATUM_POINT) members.push(requestEntity(q.h, 0));
    if (q.type === RequestType.LINE_SEGMENT) members.push(requestEntity(q.h, 1), requestEntity(q.h, 2));
  }
  const known = new Set(members);
  const parent = new Map(members.map((m) => [m, m]));
  const find = (h: number): number => {
    let r = h;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(h, r);
    return r;
  };
  for (const c of file.constraints) {
    if (c.type !== CT.POINTS_COINCIDENT || !known.has(c.ptA) || !known.has(c.ptB)) continue;
    if (isDatum(file, c.ptA) && isDatum(file, c.ptB)) continue; // a real coincident constraint
    parent.set(find(c.ptA), find(c.ptB));
  }
  const datumOf = new Map<number, number>();
  for (const m of members) if (isDatum(file, m) && !datumOf.has(find(m))) datumOf.set(find(m), m);

  const pts: Points = { points: [], of: new Map(), at: new Map(), joined: [] };
  let offPlane = 0;
  const add = (h: number): string => {
    const p = position(file, h);
    if (Math.abs(p.z) > 1e-6) offPlane++;
    const point: InteropPoint = { id: `p${pts.points.length + 1}`, x: p.x, y: p.y };
    pts.points.push(point);
    pts.at.set(point.id, point);
    return point.id;
  };
  const classId = new Map<number, string>();
  for (const m of members) {
    const root = find(m);
    const lead = datumOf.get(root);
    if (isDatum(file, m)) {
      const id = add(m);
      pts.of.set(m, id);
      if (lead === m) classId.set(root, id);
      else pts.joined.push([pts.of.get(lead!) ?? classId.get(root)!, id]);
    } else if (lead == null && !classId.has(root)) classId.set(root, add(m));
  }
  for (const m of members) if (!pts.of.has(m)) pts.of.set(m, classId.get(find(m)) ?? pts.of.get(datumOf.get(find(m))!)!);
  if (offPlane) warnings.push(`${offPlane} point(s) not in the XY plane — projected onto it`);
  return pts;
}

/** Stored position of a point entity: its exported actPoint, else its request parameters. */
function position(file: SlvsFile, h: number): { x: number; y: number; z: number } {
  const act = file.act.get(h);
  if (act) return act;
  const req = h >>> 16;
  const k = h & 0xffff;
  const base = 16 + 3 * Math.max(0, k - 1);
  return { x: file.params.get(requestParam(req, base)) ?? 0, y: file.params.get(requestParam(req, base + 1)) ?? 0, z: 0 };
}

function mapLines(file: SlvsFile, pts: Points, warnings: string[]): InteropLine[] {
  const lines: InteropLine[] = [];
  let degenerate = 0;
  for (const q of file.requests) {
    if (q.type !== RequestType.LINE_SEGMENT || file.styles.get(q.style) === HELPER_STYLE_NAME) continue;
    const a = pts.of.get(requestEntity(q.h, 1))!;
    const b = pts.of.get(requestEntity(q.h, 2))!;
    if (a === b) {
      degenerate++;
      continue;
    }
    lines.push({ id: `l${lines.length + 1}`, a, b, ...(q.construction ? { construction: true } : {}) });
  }
  if (degenerate) warnings.push(`${degenerate} zero-length segment(s) dropped`);
  return lines;
}

const PILE_COMMENT = /^pile((?:\s+(?:head|diameter|depth)=[-+0-9.eE]+)*)\s*$/;

function mapConstraints(file: SlvsFile, pts: Points, warnings: string[]): { constraints: Constraint[]; piles: InteropPile[] } {
  const out: Constraint[] = pts.joined.map(([a, b], i) => ({ id: `j${i + 1}`, kind: 'coincident', a, b }));
  const piles = new Map<string, InteropPile>();
  const lineEnds = (h: number): [string, string] | null => {
    const ends = file.segments.get(h);
    return ends ? [pts.of.get(ends[0])!, pts.of.get(ends[1])!] : null;
  };
  const pos = (id: string) => pts.at.get(id)!;
  const ratios = pairRatios(file.constraints, lineEnds, pts.of, pos);
  const skip = (c: Con, why: string) => warnings.push(`constraint ${c.h} (${constraintTypeName(c.type)}) ${why} — dropped`);

  for (const c of file.constraints) {
    const id = `c${c.h}`;
    const ratio = ratios.get(c.h);
    if (ratio === 'consumed') continue;
    if (ratio) {
      out.push({ id, ...ratio });
      continue;
    }
    if (c.reference && c.type !== CT.COMMENT) {
      skip(c, 'is a reference (driven) dimension');
      continue;
    }
    const pA = pts.of.get(c.ptA);
    const pB = pts.of.get(c.ptB);
    const lA = lineEnds(c.entityA);
    const lB = lineEnds(c.entityB);
    switch (c.type) {
      case CT.POINTS_COINCIDENT:
        if (!pA || !pB) skip(c, 'uses a point that is not a sketch point');
        // ends of joined segments are one point already; datum pairs stay a constraint
        else if (pA !== pB) out.push({ id, kind: 'coincident', a: pA, b: pB });
        break;
      case CT.WHERE_DRAGGED:
        if (pA) out.push({ id, kind: 'fix', p: pA, x: pos(pA).x, y: pos(pA).y });
        else skip(c, 'uses a point that is not a sketch point');
        break;
      case CT.PT_PT_DISTANCE:
        if (pA && pB) out.push({ id, kind: 'distance', a: pA, b: pB, d: c.valA });
        else skip(c, 'uses a point that is not a sketch point');
        break;
      case CT.PROJ_PT_DISTANCE: {
        const axis = projectionAxis(c.entityA, lA, pos);
        if (pA && pB && axis) out.push({ id, kind: axis.kind, a: pA, b: pB, d: c.valA * axis.sign });
        else skip(c, 'projects onto a direction that is not the X or Y axis');
        break;
      }
      case CT.HORIZONTAL:
      case CT.VERTICAL: {
        const ends = lA ?? (pA && pB ? ([pA, pB] as const) : null);
        if (ends) out.push({ id, kind: c.type === CT.HORIZONTAL ? 'horizontal' : 'vertical', a: ends[0], b: ends[1] });
        else skip(c, 'uses geometry that is not a sketch line');
        break;
      }
      case CT.AT_MIDPOINT:
        if (pA && lA) out.push({ id, kind: 'ratio', p: pA, a: lA[0], b: lA[1], t: 0.5 });
        else skip(c, 'is not a point at the midpoint of a line');
        break;
      case CT.PT_ON_LINE:
        if (pA && lA) out.push({ id, kind: 'onLine', p: pA, a: lA[0], b: lA[1] });
        else skip(c, 'is not a point on a sketch line');
        break;
      case CT.PARALLEL:
      case CT.PERPENDICULAR:
      case CT.EQUAL_LENGTH_LINES:
        if (lA && lB) {
          const kind = c.type === CT.PARALLEL ? 'parallel' : c.type === CT.PERPENDICULAR ? 'perpendicular' : 'equal';
          out.push({ id, kind, a: lA[0], b: lA[1], c: lB[0], d: lB[1] });
        } else skip(c, 'uses geometry that is not a sketch line');
        break;
      case CT.ANGLE: {
        const angle = angleOf(c, lA, lB, pos);
        if (angle) out.push({ id, kind: 'angle', ...angle });
        else skip(c, 'is not between a line and the X axis or two lines sharing an end');
        break;
      }
      case CT.COMMENT:
        if (!pA) skip(c, 'is free text, not attached to a point');
        else commentOn(pA, c.comment, piles, pts, () => skip(c, 'is a second label of one point'));
        break;
      default:
        skip(c, 'has no sketch equivalent');
    }
  }
  return { constraints: out, piles: [...piles.values()] };
}

function commentOn(id: string, text: string, piles: Map<string, InteropPile>, pts: Points, twice: () => void): void {
  const m = PILE_COMMENT.exec(text.trim());
  if (m) {
    const pile: InteropPile = { point: id };
    for (const [, k, v] of m[1]!.matchAll(/(head|diameter|depth)=([-+0-9.eE]+)/g)) pile[k as 'head' | 'diameter' | 'depth'] = Number(v);
    const label = pts.at.get(id)!.label;
    piles.set(id, label ? { ...pile, label } : pile);
    return;
  }
  const point = pts.at.get(id)!;
  if (point.label) return twice();
  point.label = text;
  const pile = piles.get(id);
  if (pile) pile.label = text;
}

/** ΔX / ΔY from a projected distance: onto the X/Y axis normals, or an axis-parallel segment. */
function projectionAxis(
  entity: number,
  line: [string, string] | null,
  pos: (id: string) => { x: number; y: number },
): { kind: 'dx' | 'dy'; sign: number } | null {
  if (entity === X_AXIS) return { kind: 'dx', sign: 1 };
  if (entity === Y_AXIS) return { kind: 'dy', sign: 1 };
  if (!line) return null;
  // a segment's direction vector is p0 − p1
  const vx = pos(line[0]).x - pos(line[1]).x;
  const vy = pos(line[0]).y - pos(line[1]).y;
  const len = Math.hypot(vx, vy);
  if (len === 0) return null;
  if (Math.abs(vy) / len < 1e-9) return { kind: 'dx', sign: Math.sign(vx) };
  if (Math.abs(vx) / len < 1e-9) return { kind: 'dy', sign: Math.sign(vy) };
  return null;
}

type Pos = (id: string) => { x: number; y: number };

/**
 * Signed `angle` constraint from SolveSpace's unsigned ANGLE (cos∠(other ? −vA : vA, vB) = cos valA,
 * a segment's vector being p0 − p1); the sign is read from the stored geometry.
 */
export function angleOf(
  c: Pick<Con, 'entityA' | 'entityB' | 'other' | 'valA'>,
  lA: [string, string] | null,
  lB: [string, string] | null,
  pos: Pos,
): { a: string; b: string; angle: number; ref: string | null } | null {
  const sgn = (o: { x: number; y: number }, u: { x: number; y: number }, v: { x: number; y: number }) =>
    (u.x - o.x) * (v.y - o.y) - (u.y - o.y) * (v.x - o.x) < -1e-9 ? -1 : 1;
  const flip = c.other ? -1 : 1;
  if (lA && c.entityB === X_AXIS) {
    // direction a → b = (other ? −1 : 1)·(p0 − p1)
    const [a, b] = c.other ? [lA[0], lA[1]] : [lA[1], lA[0]];
    return { a, b, ref: null, angle: c.valA * (pos(b).y - pos(a).y < -1e-9 ? -1 : 1) };
  }
  if (lB && c.entityA === X_AXIS) {
    const [a, b] = [lB[1], lB[0]];
    const mag = flip === 1 ? c.valA : 180 - c.valA;
    return { a, b, ref: null, angle: mag * (pos(b).y - pos(a).y < -1e-9 ? -1 : 1) };
  }
  if (!lA || !lB) return null;
  const s = lA.find((p) => lB.includes(p));
  if (s == null || (lA.includes(lB[0]) && lA.includes(lB[1]))) return null;
  const oa = lA[0] === s ? lA[1] : lA[0];
  const ob = lB[0] === s ? lB[1] : lB[0];
  // vA = sA·(oa − s), vB = sB·(ob − s)
  const sA = lA[1] === s ? 1 : -1;
  const sB = lB[1] === s ? 1 : -1;
  const mag = flip * sA * sB === 1 ? c.valA : 180 - c.valA;
  // our angle: direction s → oa measured from s → ob
  return { a: s, b: oa, ref: ob, angle: mag * sgn(pos(s), pos(ob), pos(oa)) };
}

/**
 * `ratio` written as PT_ON_LINE(p, a–b) + LENGTH_RATIO(a–p, a–b) = |t|: the PT_ON_LINE becomes the
 * ratio (t signed from the geometry), the LENGTH_RATIO is consumed.
 */
function pairRatios(
  cons: readonly Con[],
  lineEnds: (h: number) => [string, string] | null,
  of: Map<number, string>,
  pos: Pos,
): Map<number, { kind: 'ratio'; p: string; a: string; b: string; t: number } | 'consumed'> {
  const out = new Map<number, { kind: 'ratio'; p: string; a: string; b: string; t: number } | 'consumed'>();
  for (const r of cons) {
    if (r.type !== CT.LENGTH_RATIO || r.reference) continue;
    const l1 = lineEnds(r.entityA);
    const l2 = lineEnds(r.entityB);
    const a = l1?.find((p) => l2?.includes(p));
    if (!l1 || !l2 || a == null) continue;
    const p = l1[0] === a ? l1[1] : l1[0];
    const b = l2[0] === a ? l2[1] : l2[0];
    const on = cons.find((c) => {
      if (c.type !== CT.PT_ON_LINE || out.has(c.h) || of.get(c.ptA) !== p) return false;
      const ends = lineEnds(c.entityA);
      return !!ends && ends.includes(a) && ends.includes(b);
    });
    if (!on) continue;
    const A = pos(a);
    const B = pos(b);
    const P = pos(p);
    const dot = (P.x - A.x) * (B.x - A.x) + (P.y - A.y) * (B.y - A.y);
    out.set(on.h, { kind: 'ratio', p, a, b, t: dot < 0 ? -r.valA : r.valA });
    out.set(r.h, 'consumed');
  }
  return out;
}
