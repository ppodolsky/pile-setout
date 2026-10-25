import type { Constraint } from '@buildkit/sketch';
import { byId, checkDocument, lineBetween, normalizeDeg, unsupportedConstraint } from './doc';
import type { ExportResult, InteropDocument } from './model';
import { zipStore } from './zip';

/**
 * FreeCAD export: a `.FCStd` (ZIP) holding `Document.xml` with one `Sketcher::SketchObject` on the XY
 * plane, in the format FreeCAD 1.x saves (Part geometry list + Sketcher constraint list).
 *
 * - every point is a `Part::GeomPoint` (GeoId 0…n−1, vertex position 1); every line a
 *   `Part::GeomLineSegment` whose start/end are Coincident with its points;
 * - fix → DistanceX + DistanceY from the sketch origin (FreeCAD's "lock"), distance → Distance,
 *   dx/dy → DistanceX/DistanceY, horizontal/vertical → Horizontal/Vertical between the two points,
 *   angle → Angle of the line a→b to the X axis or to the line a→ref, ratio ½ → Symmetric about the
 *   midpoint, onLine → PointOnObject, coincident → Coincident, parallel/perpendicular/equal →
 *   Parallel/Perpendicular/Equal; a line a constraint needs but the document lacks is added as
 *   construction geometry;
 * - other ratios have no Sketcher equivalent: PointOnObject + a Distance from `a` at today's length
 *   (holds the point, but no longer scales with a–b — reported);
 * - labels and pile properties have no place in a sketch and are dropped (reported).
 *
 * The archive is stored (not deflated) and has no `GuiDocument.xml`; FreeCAD recomputes the shape and
 * uses default colours on open.
 */
export const toFCStd = (doc: InteropDocument): Uint8Array => exportFCStd(doc).output;

/**
 * Like {@link toFCStd}, also listing what could not be kept.
 *
 * @throws InteropError if the document references missing points.
 */
export function exportFCStd(doc: InteropDocument): ExportResult<Uint8Array> {
  const { xml, warnings } = fcstdDocumentXml(doc);
  return { output: zipStore([{ name: 'Document.xml', data: new TextEncoder().encode(xml) }]), warnings };
}

/** Sketcher::ConstraintType ids (src/Mod/Sketcher/App/Constraint.h). */
export const FcType = {
  Coincident: 1,
  Horizontal: 2,
  Vertical: 3,
  Parallel: 4,
  Distance: 6,
  DistanceX: 7,
  DistanceY: 8,
  Angle: 9,
  Perpendicular: 10,
  Equal: 12,
  PointOnObject: 13,
  Symmetric: 14,
} as const;

/** Sketcher GeoIds: the root point / X axis is −1 (vertex 1 = origin), unused slots are −2000. */
const ROOT = -1;
const UNDEF = -2000;
/** Sketcher::PointPos: none 0, start 1, end 2, mid 3; a GeomPoint is its own start. */
const START = 1;
const END = 2;

interface FcCon {
  type: number;
  value?: number;
  first: number;
  firstPos?: number;
  second?: number;
  secondPos?: number;
  third?: number;
  thirdPos?: number;
}

interface FcGeo {
  kind: 'point' | 'line';
  construction: boolean;
  a: { x: number; y: number };
  b?: { x: number; y: number };
}

/** `Document.xml` of the export, with the list of what was dropped. */
export function fcstdDocumentXml(doc: InteropDocument): { xml: string; warnings: string[] } {
  checkDocument(doc);
  const warnings: string[] = [];
  const pts = byId(doc.points);
  const geo: FcGeo[] = doc.points.map((p) => ({ kind: 'point', construction: false, a: p }));
  const index = new Map(doc.points.map((p, i) => [p.id, i]));
  const g = (id: string) => index.get(id)!;
  const cons: FcCon[] = [];
  const structural: FcCon[] = [];
  const addLine = (a: string, b: string, construction: boolean) => {
    const i = geo.length;
    geo.push({ kind: 'line', construction, a: pts.get(a)!, b: pts.get(b)! });
    structural.push({ type: FcType.Coincident, first: i, firstPos: START, second: g(a), secondPos: START });
    structural.push({ type: FcType.Coincident, first: i, firstPos: END, second: g(b), secondPos: START });
    return { geo: i, a, b };
  };
  const own = doc.lines.map((l) => ({ line: l, fc: addLine(l.a, l.b, !!l.construction) }));
  const helpers: { geo: number; a: string; b: string }[] = [];
  const lineFor = (a: string, b: string) => {
    const mine = lineBetween(doc.lines, a, b);
    if (mine) return own.find((o) => o.line === mine)!.fc;
    return helpers.find((h) => (h.a === a && h.b === b) || (h.a === b && h.b === a)) ?? helpers[helpers.push(addLine(a, b, true)) - 1]!;
  };

  for (const c of doc.constraints) {
    const mapped = mapConstraint(c, g, lineFor, (id) => pts.get(id)!);
    if (!mapped) warnings.push(unsupportedConstraint(c, 'FreeCAD Sketcher'));
    else {
      cons.push(...mapped.cons);
      if (mapped.warning) warnings.push(mapped.warning);
    }
  }
  const labels = doc.points.filter((p) => p.label).length + doc.piles.filter((p) => p.label).length;
  if (labels) warnings.push(`${labels} label(s) dropped — Sketcher points have no names`);
  if (doc.piles.length) warnings.push(`${doc.piles.length} pile(s) exported as plain points (head, diameter and depth dropped)`);
  return { xml: documentXml(doc.name ?? 'Sketch', geo, [...cons, ...structural]), warnings };
}

type LineFor = (a: string, b: string) => { geo: number; a: string; b: string };

function mapConstraint(
  c: Constraint,
  g: (id: string) => number,
  lineFor: LineFor,
  at: (id: string) => { x: number; y: number },
): { cons: FcCon[]; warning?: string } | null {
  const pp = (type: number, a: string, b: string, value?: number): FcCon => ({
    type,
    first: g(a),
    firstPos: START,
    second: g(b),
    secondPos: START,
    value,
  });
  switch (c.kind) {
    case 'fix':
      return {
        cons: [
          { type: FcType.DistanceX, first: ROOT, firstPos: START, second: g(c.p), secondPos: START, value: c.x },
          { type: FcType.DistanceY, first: ROOT, firstPos: START, second: g(c.p), secondPos: START, value: c.y },
        ],
      };
    case 'distance':
      return { cons: [c.d > 0 ? pp(FcType.Distance, c.a, c.b, c.d) : pp(FcType.Coincident, c.a, c.b)] };
    case 'dx':
    case 'dy': {
      const type = c.kind === 'dx' ? FcType.DistanceX : FcType.DistanceY;
      return { cons: [c.d >= 0 ? pp(type, c.a, c.b, c.d) : pp(type, c.b, c.a, -c.d)] };
    }
    case 'horizontal':
      return { cons: [pp(FcType.Horizontal, c.a, c.b)] };
    case 'vertical':
      return { cons: [pp(FcType.Vertical, c.a, c.b)] };
    case 'angle': {
      // Sketcher angles follow line directions (start → end), counter-clockwise, radians
      const l = lineFor(c.a, c.b);
      const flip = l.a === c.a ? 0 : 180;
      if (!c.ref) return { cons: [{ type: FcType.Angle, first: l.geo, value: rad(normalizeDeg(c.angle + flip)) }] };
      const r = lineFor(c.a, c.ref);
      const rflip = r.a === c.a ? 0 : 180;
      return { cons: [{ type: FcType.Angle, first: r.geo, second: l.geo, value: rad(normalizeDeg(c.angle + flip - rflip)) }] };
    }
    case 'ratio': {
      if (c.t === 0) return { cons: [pp(FcType.Coincident, c.p, c.a)] };
      if (c.t === 1) return { cons: [pp(FcType.Coincident, c.p, c.b)] };
      if (c.t === 0.5) return { cons: [{ ...pp(FcType.Symmetric, c.a, c.b), third: g(c.p), thirdPos: START }] };
      const ab = lineFor(c.a, c.b);
      const len = Math.abs(c.t) * Math.hypot(at(c.b).x - at(c.a).x, at(c.b).y - at(c.a).y);
      return {
        cons: [{ type: FcType.PointOnObject, first: g(c.p), firstPos: START, second: ab.geo }, pp(FcType.Distance, c.a, c.p, len)],
        warning: `constraint "${c.id}" (ratio ${c.t}) exported as point-on-line + fixed distance ${round(len)} mm — no ratio constraint in Sketcher`,
      };
    }
    case 'onLine':
      return { cons: [{ type: FcType.PointOnObject, first: g(c.p), firstPos: START, second: lineFor(c.a, c.b).geo }] };
    case 'coincident':
      return { cons: [pp(FcType.Coincident, c.a, c.b)] };
    case 'parallel':
    case 'perpendicular':
    case 'equal': {
      const type = { parallel: FcType.Parallel, perpendicular: FcType.Perpendicular, equal: FcType.Equal }[c.kind];
      return { cons: [{ type, first: lineFor(c.a, c.b).geo, second: lineFor(c.c, c.d).geo }] };
    }
    default: {
      const unknown: never = c;
      void unknown;
      return null;
    }
  }
}

const rad = (deg: number) => (deg * Math.PI) / 180;
const round = (v: number) => Math.round(v * 1000) / 1000;

/** Number as FreeCAD writes it: plain decimal (FreeCAD reads with strtod, so any exact form works). */
const n = (v: number): string => (Object.is(v, -0) ? '0' : String(v));

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch]!);

/** geometryModeFlags of SketchGeometryExtension: a 32-bit string, bit 1 = construction. */
const modeFlags = (construction: boolean): string => (construction ? 2 : 0).toString(2).padStart(32, '0');

function geometryXml(g: FcGeo, i: number): string {
  const ext =
    `<GeoExtensions count="1">\n` +
    `<GeoExtension type="Sketcher::SketchGeometryExtension" id="${i + 1}" internalGeometryType="0" geometryModeFlags="${modeFlags(g.construction)}" geometryLayer="0"/>\n` +
    `</GeoExtensions>\n`;
  const shape =
    g.kind === 'point'
      ? `<GeomPoint X="${n(g.a.x)}" Y="${n(g.a.y)}" Z="0"/>\n`
      : `<LineSegment StartX="${n(g.a.x)}" StartY="${n(g.a.y)}" StartZ="0" EndX="${n(g.b!.x)}" EndY="${n(g.b!.y)}" EndZ="0"/>\n`;
  const type = g.kind === 'point' ? 'Part::GeomPoint' : 'Part::GeomLineSegment';
  return `<Geometry type="${type}" id="${i + 1}" migrated="1">\n${ext}${shape}<Construction value="${g.construction ? 1 : 0}"/>\n</Geometry>\n`;
}

function constraintXml(c: FcCon): string {
  const ids = [c.first, c.second ?? UNDEF, c.third ?? UNDEF];
  const pos = [c.firstPos ?? 0, c.secondPos ?? 0, c.thirdPos ?? 0];
  return (
    `<Constrain Name="" Type="${c.type}" Value="${n(c.value ?? 0)}" LabelDistance="10" LabelPosition="0" ` +
    `IsDriving="1" IsInVirtualSpace="0" IsVisible="1" IsActive="1" ` +
    `First="${ids[0]}" FirstPos="${pos[0]}" Second="${ids[1]}" SecondPos="${pos[1]}" Third="${ids[2]}" ThirdPos="${pos[2]}" ` +
    `ElementIds="${ids.join(' ')}" ElementPositions="${pos.join(' ')}" />\n`
  );
}

const PLACEMENT = '<PropertyPlacement Px="0" Py="0" Pz="0" Q0="0" Q1="0" Q2="0" Q3="1" A="0" Ox="0" Oy="0" Oz="1"/>';

function documentXml(label: string, geo: readonly FcGeo[], cons: readonly FcCon[]): string {
  return `<?xml version='1.0' encoding='utf-8'?>
<!--
 FreeCAD Document, see https://www.freecad.org for more information...
 Written by Buildkit interop.
-->
<Document SchemaVersion="4" ProgramVersion="1.0" FileVersion="1">
<Properties Count="1" TransientCount="0">
<Property name="Label" type="App::PropertyString">
<String value="${esc(label)}"/>
</Property>
</Properties>
<Objects Count="1" Dependencies="1">
<ObjectDeps Name="Sketch" Count="0"/>
<Object type="Sketcher::SketchObject" name="Sketch" id="1" Touched="1"/>
</Objects>
<ObjectData Count="1">
<Object name="Sketch" Extensions="True">
<Extensions Count="1">
<Extension type="Part::AttachExtension" name="AttachExtension">
</Extension>
</Extensions>
<Properties Count="4" TransientCount="0">
<Property name="Constraints" type="Sketcher::PropertyConstraintList" status="1">
<ConstraintList count="${cons.length}">
${cons.map(constraintXml).join('')}</ConstraintList>
</Property>
<Property name="Geometry" type="Part::PropertyGeometryList" status="8193">
<GeometryList count="${geo.length}">
${geo.map(geometryXml).join('')}</GeometryList>
</Property>
<Property name="Label" type="App::PropertyString" status="134217729">
<String value="Sketch"/>
</Property>
<Property name="Placement" type="App::PropertyPlacement" status="8388609">
${PLACEMENT}
</Property>
</Properties>
</Object>
</ObjectData>
</Document>
`;
}
