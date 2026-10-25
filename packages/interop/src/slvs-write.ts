import { projectT } from '@buildkit/geometry';
import type { Constraint } from '@buildkit/sketch';
import {
  byId,
  checkDocument,
  labelWarnings,
  lineBetween,
  normalizeDeg,
  pileRadius,
  pilesByPoint,
  pointText,
  unsupportedConstraint,
} from './doc';
import type { ExportResult, InteropDocument, InteropPile } from './model';
import {
  ConstraintType as CT,
  EntityType,
  FIRST_CUSTOM_STYLE,
  GroupType,
  REF_XY,
  REF_YZ,
  REF_ZX,
  RequestType,
  SKETCH_GROUP,
  SLVS_VERSION,
  WORKPLANE,
  X_AXIS,
  Y_AXIS,
  constraintParam,
  groupEntity,
  record,
  requestEntity,
  requestParam,
  slvsBytes,
  type Field,
} from './slvs-format';

/**
 * SolveSpace export: one "sketch-in-plane" group on the XY plane, exactly the layout SolveSpace itself
 * saves (so `solvespace-cli regenerate` rewrites it unchanged).
 *
 * - every point is a datum point (request 4, 5, …), in document order;
 * - every line is a line segment whose ends are POINTS_COINCIDENT with its two datum points (that is
 *   how SolveSpace joins segments); construction lines are construction requests;
 * - constraints map to native ones: fix → WHERE_DRAGGED (the point is written at the fix position),
 *   distance → PT_PT_DISTANCE, dx/dy → PROJ_PT_DISTANCE onto the X/Y axis (signed), horizontal /
 *   vertical → HORIZONTAL / VERTICAL between the two points (in the workplane), angle →
 *   ANGLE against the X axis or the line a→ref, ratio ½ → AT_MIDPOINT, other ratios → PT_ON_LINE +
 *   LENGTH_RATIO, onLine → PT_ON_LINE, coincident → POINTS_COINCIDENT, parallel / perpendicular /
 *   equal → PARALLEL / PERPENDICULAR / EQUAL_LENGTH_LINES;
 * - where SolveSpace needs a line between two points that have none, a helper construction line is
 *   added with the style "buildkit-helper" (the importer leaves those out again);
 * - labels and pile properties become COMMENTs attached to the point ("P1", "pile head=400 …").
 */
export const toSLVS = (doc: InteropDocument): string => exportSLVS(doc).output;

/** {@link toSLVS} as the bytes to write to disk (the version line is Latin-1, the rest UTF-8). */
export const toSLVSBytes = (doc: InteropDocument): Uint8Array => slvsBytes(toSLVS(doc));

/** Name of the style marking helper lines that exist only because a constraint needs a line. */
export const HELPER_STYLE_NAME = 'buildkit-helper';

/** First request handle after the three reference planes. */
const FIRST_REQUEST = 4;

interface Req {
  h: number;
  type: typeof RequestType.DATUM_POINT | typeof RequestType.LINE_SEGMENT;
  construction: boolean;
  helper: boolean;
  /** Positions of the request's points (one for a datum point, two for a segment). */
  at: { x: number; y: number }[];
}

/** A SolveSpace line as constraints see it: entity handle and the point ids of its two ends. */
interface SLine {
  entity: number;
  p0: string;
  p1: string;
}

interface SCon {
  type: number;
  valA?: number;
  ptA?: number;
  ptB?: number;
  entityA?: number;
  entityB?: number;
  other?: boolean;
  comment?: string;
  offset?: { x: number; y: number };
  /** Initial value of the constraint's own parameter (PT_ON_LINE: position along the line). */
  param?: number;
}

/**
 * Like {@link toSLVS}, also listing what could not be kept.
 *
 * @throws InteropError if the document references missing points.
 */
export function exportSLVS(doc: InteropDocument): ExportResult<string> {
  checkDocument(doc);
  const warnings = labelWarnings(doc);
  const pts = byId(doc.points);
  const piles = pilesByPoint(doc.piles);
  const pinned = new Map<string, { x: number; y: number }>();
  for (const c of doc.constraints) if (c.kind === 'fix') pinned.set(c.p, { x: c.x, y: c.y });
  const pos = (id: string) => pinned.get(id) ?? pts.get(id)!;

  const reqs: Req[] = [];
  const datum = new Map<string, number>();
  for (const p of doc.points) {
    const h = FIRST_REQUEST + reqs.length;
    reqs.push({ h, type: RequestType.DATUM_POINT, construction: false, helper: false, at: [pos(p.id)] });
    datum.set(p.id, requestEntity(h, 0));
  }
  const pt = (id: string) => datum.get(id)!;
  const structural: SCon[] = [];
  const addSegment = (a: string, b: string, construction: boolean, helper: boolean): SLine => {
    const h = FIRST_REQUEST + reqs.length;
    reqs.push({ h, type: RequestType.LINE_SEGMENT, construction, helper, at: [pos(a), pos(b)] });
    structural.push({ type: CT.POINTS_COINCIDENT, ptA: requestEntity(h, 1), ptB: pt(a) });
    structural.push({ type: CT.POINTS_COINCIDENT, ptA: requestEntity(h, 2), ptB: pt(b) });
    return { entity: requestEntity(h, 0), p0: a, p1: b };
  };
  const userLines = doc.lines.map((l) => ({ line: l, s: addSegment(l.a, l.b, !!l.construction, false) }));
  const helpers = new Map<string, SLine>();
  /** A line through a and b: the document's own if there is one, else a helper oriented a → b. */
  const lineFor = (a: string, b: string): SLine => {
    const own = lineBetween(doc.lines, a, b);
    if (own) return userLines.find((u) => u.line === own)!.s;
    const known = helpers.get(`${a}\u0000${b}`) ?? helpers.get(`${b}\u0000${a}`);
    if (known) return known;
    const s = addSegment(a, b, true, true);
    helpers.set(`${a}\u0000${b}`, s);
    return s;
  };

  const user: SCon[] = [];
  for (const c of doc.constraints) {
    const mapped = mapConstraint(c, pt, lineFor, pos);
    if (mapped) user.push(...mapped);
    else warnings.push(unsupportedConstraint(c, 'SolveSpace'));
  }
  const comments = doc.points.flatMap((p) => pointComments(pt(p.id), pointText(p, piles.get(p.id)), piles.get(p.id)));

  const cons = [...user, ...structural, ...comments];
  const text =
    `${SLVS_VERSION}\n\n\n` +
    groups() +
    params(reqs, cons) +
    requests(
      reqs,
      reqs.some((r) => r.helper),
    ) +
    entities(reqs) +
    cons.map((c, i) => constraintRecord(c, i + 1)).join('') +
    (reqs.some((r) => r.helper) ? helperStyle() : '');
  return { output: text, warnings };
}

type PointOf = (id: string) => number;
type LineFor = (a: string, b: string) => SLine;
type Pos = (id: string) => { x: number; y: number };

/** Native constraint(s) for one neutral constraint; null if SolveSpace has no equivalent. */
export function mapConstraint(c: Constraint, pt: PointOf, lineFor: LineFor, pos: Pos): SCon[] | null {
  switch (c.kind) {
    case 'fix':
      return [{ type: CT.WHERE_DRAGGED, ptA: pt(c.p) }];
    case 'distance':
      return [{ type: CT.PT_PT_DISTANCE, ptA: pt(c.a), ptB: pt(c.b), valA: c.d }];
    case 'dx':
    case 'dy':
      return [{ type: CT.PROJ_PT_DISTANCE, ptA: pt(c.a), ptB: pt(c.b), entityA: c.kind === 'dx' ? X_AXIS : Y_AXIS, valA: c.d }];
    case 'horizontal':
    case 'vertical': {
      const type = c.kind === 'horizontal' ? CT.HORIZONTAL : CT.VERTICAL;
      return [{ type, ptA: pt(c.a), ptB: pt(c.b) }];
    }
    case 'angle': {
      // SolveSpace: cos∠(other ? −vA : vA, vB) = cos valA, with a segment's vector = p0 − p1
      const la = lineFor(c.a, c.b);
      const lb = c.ref ? lineFor(c.a, c.ref) : null;
      const revA = la.p0 === c.a;
      const revB = lb ? lb.p0 === c.a : false;
      return [
        {
          type: CT.ANGLE,
          entityA: la.entity,
          entityB: lb ? lb.entity : X_AXIS,
          other: revA !== revB,
          valA: Math.abs(normalizeDeg(c.angle)),
        },
      ];
    }
    case 'ratio': {
      if (c.t === 0) return [{ type: CT.POINTS_COINCIDENT, ptA: pt(c.p), ptB: pt(c.a) }];
      if (c.t === 1) return [{ type: CT.POINTS_COINCIDENT, ptA: pt(c.p), ptB: pt(c.b) }];
      const ab = lineFor(c.a, c.b);
      if (c.t === 0.5) return [{ type: CT.AT_MIDPOINT, ptA: pt(c.p), entityA: ab.entity }];
      return [
        onLine(pt(c.p), ab, c.t),
        { type: CT.LENGTH_RATIO, entityA: lineFor(c.a, c.p).entity, entityB: ab.entity, valA: Math.abs(c.t) },
      ];
    }
    case 'onLine': {
      const ab = lineFor(c.a, c.b);
      return [onLine(pt(c.p), ab, projectT(pos(c.p), pos(ab.p0), pos(ab.p1)))];
    }
    case 'coincident':
      return [{ type: CT.POINTS_COINCIDENT, ptA: pt(c.a), ptB: pt(c.b) }];
    case 'parallel':
    case 'perpendicular':
    case 'equal': {
      const type = { parallel: CT.PARALLEL, perpendicular: CT.PERPENDICULAR, equal: CT.EQUAL_LENGTH_LINES }[c.kind];
      return [{ type, entityA: lineFor(c.a, c.b).entity, entityB: lineFor(c.c, c.d).entity }];
    }
    default: {
      const unknown: never = c;
      void unknown;
      return null;
    }
  }
}

/** PT_ON_LINE seeded with the point's position along the segment (its free parameter). */
function onLine(p: number, line: SLine, t: number): SCon {
  return { type: CT.PT_ON_LINE, ptA: p, entityA: line.entity, param: line.p0 === line.p1 ? 0 : t };
}

/** Text of the pile comment, e.g. "pile head=400 diameter=300 depth=2000". */
export function pileComment(pile: InteropPile): string {
  const parts = (['head', 'diameter', 'depth'] as const).filter((k) => pile[k] != null).map((k) => `${k}=${pile[k]}`);
  return ['pile', ...parts].join(' ');
}

function pointComments(ptA: number, label: string | undefined, pile: InteropPile | undefined): SCon[] {
  const d = Math.max(pileRadius(pile), 50) + 50;
  const out: SCon[] = [];
  if (label) out.push({ type: CT.COMMENT, ptA, comment: oneLine(label), offset: { x: d, y: d } });
  if (pile) out.push({ type: CT.COMMENT, ptA, comment: pileComment(pile), offset: { x: d, y: -d } });
  return out;
}

const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ');

function groups(): string {
  const common = (h: number, type: number, name: string, extra: Field[]): string =>
    record(
      [
        ['Group.h.v', 'x', h],
        ['Group.type', 'd', type],
        ...extra.filter(([k]) => k === 'Group.order'),
        ['Group.name', 'S', name],
        ...extra.filter(([k]) => k !== 'Group.order'),
        ['Group.color', 'x', 0xff000000],
        ...(type === GroupType.DRAWING_WORKPLANE ? ([['Group.subtype', 'd', 6000]] as Field[]) : []),
        ['Group.skipFirst', 'b', false],
        ...(type === GroupType.DRAWING_WORKPLANE
          ? ([
              ['Group.predef.q.w', 'f', 1],
              ['Group.predef.origin.v', 'x', requestEntity(REF_XY, 1)],
            ] as Field[])
          : []),
        ['Group.predef.swapUV', 'b', false],
        ['Group.predef.negateU', 'b', false],
        ['Group.predef.negateV', 'b', false],
        ['Group.visible', 'b', true],
        ['Group.suppress', 'b', false],
        ['Group.relaxConstraints', 'b', false],
        ['Group.allowRedundant', 'b', false],
        ['Group.allDimsReference', 'b', false],
        ['Group.scale', 'f', 1],
        ['Group.remap', 'S', '{\n}'],
      ],
      'AddGroup',
    );
  return (
    common(1, GroupType.DRAWING_3D, '#references', []) +
    common(SKETCH_GROUP, GroupType.DRAWING_WORKPLANE, 'sketch-in-plane', [
      ['Group.order', 'd', 1],
      ['Group.activeWorkplane.v', 'x', WORKPLANE],
    ])
  );
}

/** Orientation quaternions (w, x, y, z) of the reference planes XY, YZ, ZX. */
const PLANES: readonly [number, readonly [number, number, number, number]][] = [
  [REF_XY, [1, 0, 0, 0]],
  [REF_YZ, [0.5, 0.5, 0.5, 0.5]],
  [REF_ZX, [0.5, -0.5, -0.5, -0.5]],
];

function params(reqs: readonly Req[], cons: readonly SCon[]): string {
  const out: [number, number][] = [];
  for (const [r, q] of PLANES) {
    for (let i = 0; i < 3; i++) out.push([requestParam(r, 0x10 + i), 0]);
    q.forEach((v, i) => out.push([requestParam(r, 0x20 + i), v]));
  }
  for (const r of reqs) {
    r.at.forEach((p, k) => {
      out.push([requestParam(r.h, 16 + 3 * k), p.x]);
      out.push([requestParam(r.h, 17 + 3 * k), p.y]);
    });
  }
  cons.forEach((c, i) => {
    if (c.param != null) out.push([constraintParam(i + 1, 0), c.param]);
  });
  return out
    .sort((a, b) => a[0] - b[0])
    .map(([h, v]) =>
      record(
        [
          ['Param.h.v.', 'x', h],
          ['Param.val', 'f', v],
        ],
        'AddParam',
      ),
    )
    .join('');
}

function requests(reqs: readonly Req[], helperStyle: boolean): string {
  const refs = PLANES.map(([r]) =>
    record(
      [
        ['Request.h.v', 'x', r],
        ['Request.type', 'd', RequestType.WORKPLANE],
        ['Request.group.v', 'x', 1],
        ['Request.construction', 'b', false],
      ],
      'AddRequest',
    ),
  );
  const ours = reqs.map((r) =>
    record(
      [
        ['Request.h.v', 'x', r.h],
        ['Request.type', 'd', r.type],
        ['Request.workplane.v', 'x', WORKPLANE],
        ['Request.group.v', 'x', SKETCH_GROUP],
        ['Request.construction', 'b', r.construction],
        ['Request.style', 'x', r.helper && helperStyle ? FIRST_CUSTOM_STYLE : 0],
      ],
      'AddRequest',
    ),
  );
  return [...refs, ...ours].join('');
}

function entities(reqs: readonly Req[]): string {
  const out: string[] = [];
  for (const [r, q] of PLANES) {
    out.push(
      record(
        [
          ['Entity.h.v', 'x', requestEntity(r, 0)],
          ['Entity.type', 'd', EntityType.WORKPLANE],
          ['Entity.construction', 'b', false],
          ['Entity.point[0].v', 'x', requestEntity(r, 1)],
          ['Entity.normal.v', 'x', requestEntity(r, 0x20)],
          ['Entity.actVisible', 'b', true],
        ],
        'AddEntity',
      ),
      record(
        [
          ['Entity.h.v', 'x', requestEntity(r, 1)],
          ['Entity.type', 'd', EntityType.POINT_IN_3D],
          ['Entity.construction', 'b', true],
          ['Entity.actVisible', 'b', true],
        ],
        'AddEntity',
      ),
      record(
        [
          ['Entity.h.v', 'x', requestEntity(r, 0x20)],
          ['Entity.type', 'd', EntityType.NORMAL_IN_3D],
          ['Entity.construction', 'b', false],
          ['Entity.point[0].v', 'x', requestEntity(r, 1)],
          ['Entity.actNormal.w', 'f', q[0]],
          ['Entity.actNormal.vx', 'f', q[1]],
          ['Entity.actNormal.vy', 'f', q[2]],
          ['Entity.actNormal.vz', 'f', q[3]],
          ['Entity.actVisible', 'b', true],
        ],
        'AddEntity',
      ),
    );
  }
  for (const r of reqs) {
    const style: Field = ['Entity.style', 'x', r.helper ? FIRST_CUSTOM_STYLE : 0];
    const point = (h: number, p: { x: number; y: number }) =>
      record(
        [
          ['Entity.h.v', 'x', h],
          ['Entity.type', 'd', EntityType.POINT_IN_2D],
          ['Entity.construction', 'b', r.construction],
          style,
          ['Entity.workplane.v', 'x', WORKPLANE],
          ['Entity.actPoint.x', 'f', p.x],
          ['Entity.actPoint.y', 'f', p.y],
          ['Entity.actVisible', 'b', true],
        ],
        'AddEntity',
      );
    if (r.type === RequestType.DATUM_POINT) {
      out.push(point(requestEntity(r.h, 0), r.at[0]!));
      continue;
    }
    out.push(
      record(
        [
          ['Entity.h.v', 'x', requestEntity(r.h, 0)],
          ['Entity.type', 'd', EntityType.LINE_SEGMENT],
          ['Entity.construction', 'b', r.construction],
          style,
          ['Entity.point[0].v', 'x', requestEntity(r.h, 1)],
          ['Entity.point[1].v', 'x', requestEntity(r.h, 2)],
          ['Entity.workplane.v', 'x', WORKPLANE],
          ['Entity.actVisible', 'b', true],
        ],
        'AddEntity',
      ),
      point(requestEntity(r.h, 1), r.at[0]!),
      point(requestEntity(r.h, 2), r.at[1]!),
    );
  }
  out.push(
    record(
      [
        ['Entity.h.v', 'x', WORKPLANE],
        ['Entity.type', 'd', EntityType.WORKPLANE],
        ['Entity.construction', 'b', false],
        ['Entity.point[0].v', 'x', groupEntity(SKETCH_GROUP, 2)],
        ['Entity.normal.v', 'x', groupEntity(SKETCH_GROUP, 1)],
        ['Entity.actVisible', 'b', true],
      ],
      'AddEntity',
    ),
    record(
      [
        ['Entity.h.v', 'x', groupEntity(SKETCH_GROUP, 1)],
        ['Entity.type', 'd', EntityType.NORMAL_N_COPY],
        ['Entity.construction', 'b', false],
        ['Entity.point[0].v', 'x', groupEntity(SKETCH_GROUP, 2)],
        ['Entity.actNormal.w', 'f', 1],
        ['Entity.actVisible', 'b', true],
      ],
      'AddEntity',
    ),
    record(
      [
        ['Entity.h.v', 'x', groupEntity(SKETCH_GROUP, 2)],
        ['Entity.type', 'd', EntityType.POINT_N_COPY],
        ['Entity.construction', 'b', true],
        ['Entity.actVisible', 'b', true],
      ],
      'AddEntity',
    ),
  );
  return out.join('');
}

function constraintRecord(c: SCon, h: number): string {
  return record(
    [
      ['Constraint.h.v', 'x', h],
      ['Constraint.type', 'd', c.type],
      ['Constraint.group.v', 'x', SKETCH_GROUP],
      ['Constraint.workplane.v', 'x', WORKPLANE],
      ['Constraint.valA', 'f', c.valA],
      ['Constraint.valP.v', 'x', c.param != null ? constraintParam(h, 0) : 0],
      ['Constraint.ptA.v', 'x', c.ptA],
      ['Constraint.ptB.v', 'x', c.ptB],
      ['Constraint.entityA.v', 'x', c.entityA],
      ['Constraint.entityB.v', 'x', c.entityB],
      ['Constraint.other', 'b', !!c.other],
      ['Constraint.other2', 'b', false],
      ['Constraint.reference', 'b', false],
      ['Constraint.comment', 'S', c.comment],
      ['Constraint.disp.offset.x', 'f', c.offset?.x],
      ['Constraint.disp.offset.y', 'f', c.offset?.y],
    ],
    'AddConstraint',
  );
}

function helperStyle(): string {
  // every field SolveSpace writes back for a custom style; grey (packed 0xAABBGGRR, alpha inverted), short dash
  return record(
    [
      ['Style.h.v', 'x', FIRST_CUSTOM_STYLE],
      ['Style.name', 'S', HELPER_STYLE_NAME],
      ['Style.width', 'f', 1],
      ['Style.textHeight', 'f', 11.5],
      ['Style.color', 'x', 0x00999999],
      ['Style.fillColor', 'x', 0x004c4c4c],
      ['Style.filled', 'b', false],
      ['Style.visible', 'b', true],
      ['Style.exportable', 'b', true],
      ['Style.stippleType', 'd', 1],
      ['Style.stippleScale', 'f', 15],
    ],
    'AddStyle',
  );
}
