import { bounds, byId, checkDocument, labelWarnings, pilesByPoint, pileRadius, pointText } from './doc';
import type { ExportResult, InteropDocument, InteropPile, InteropPoint } from './model';

/**
 * DXF export, ASCII DXF R12 (AC1009).
 *
 * R12 is the dialect every DXF reader accepts — AutoCAD/BricsCAD/DraftSight, LibreCAD/QCAD, FreeCAD,
 * SolveSpace, Inkscape, QGIS, laser/CNC software, web viewers — because it needs no handles, owner
 * pointers, CLASSES or OBJECTS (R13+ files without a consistent object graph are rejected by AutoCAD).
 * The price: R12 has no LWPOLYLINE (R14+), so pile heads are written as the R12 equivalent, a closed
 * POLYLINE/VERTEX/SEQEND, and no `$INSUNITS` (R2000+), so units are millimetres by convention (stated
 * in a 999 comment). The importer reads R12 and later files alike.
 *
 * Layers: points (POINT) and lines (LINE) on SKETCH, construction lines on CONSTRUCTION (dashed),
 * pile heads (square POLYLINE) and shafts (CIRCLE) on PILES with thickness = −depth (a 3D viewer shows
 * the pile going down), labels (TEXT) on LABELS. Constraints have no place in DXF and are dropped.
 */
export interface DxfOptions {
  /** Label text height, mm. Default: about 1/100 of the drawing diagonal, a multiple of 50, ≥ 50. */
  textHeight?: number;
  /** Write point/pile labels as TEXT (default true). */
  labels?: boolean;
}

export const DXF_LAYERS = {
  sketch: 'SKETCH',
  construction: 'CONSTRUCTION',
  piles: 'PILES',
  labels: 'LABELS',
} as const;

/** DXF R12 text of the document. Constraints are dropped (geometry only). */
export const toDXF = (doc: InteropDocument, opts: DxfOptions = {}): string => exportDXF(doc, opts).output;

/**
 * Like {@link toDXF}, also listing what DXF cannot keep.
 *
 * @throws InteropError if the document references missing points.
 */
export function exportDXF(doc: InteropDocument, opts: DxfOptions = {}): ExportResult<string> {
  checkDocument(doc);
  const warnings: string[] = [];
  if (doc.constraints.length) {
    warnings.push(`${doc.constraints.length} constraint(s) dropped — DXF stores geometry only`);
  }
  const piles = pilesByPoint(doc.piles);
  const sizeless = doc.piles.filter((p) => !p.head && !p.diameter).length;
  if (sizeless) warnings.push(`${sizeless} pile(s) without head or diameter are written as plain points`);
  warnings.push(...labelWarnings(doc));

  const box = extents(doc, piles);
  const h = opts.textHeight ?? defaultTextHeight(box);
  const out = new DxfOut();
  out.comment('Buildkit interop export — units: millimetres');
  header(out, box, h);
  tables(out, box);
  out.section('ENTITIES');
  entities(out, doc, piles, opts.labels ?? true, h);
  out.pair(0, 'ENDSEC');
  out.pair(0, 'EOF');
  return { output: out.text(), warnings };
}

/** Group code / value pairs, codes right-aligned in three characters as AutoCAD writes them. */
class DxfOut {
  private readonly lines: string[] = [];
  pair(code: number, value: string | number): void {
    this.lines.push(String(code).padStart(3), typeof value === 'number' ? String(value) : value);
  }
  real(code: number, value: number): void {
    this.pair(code, real(value));
  }
  xy(code: number, x: number, y: number, z = 0): void {
    this.real(code, x);
    this.real(code + 10, y);
    this.real(code + 20, z);
  }
  comment(text: string): void {
    this.pair(999, text);
  }
  section(name: string): void {
    this.pair(0, 'SECTION');
    this.pair(2, name);
  }
  text(): string {
    return this.lines.join('\n') + '\n';
  }
}

/** Real value in fixed notation (no exponent), rounded to 1 nm, always with a decimal point. */
export function real(v: number): string {
  const r = Math.round(v * 1e9) / 1e9;
  if (r === 0) return '0.0';
  const s = r.toFixed(9).replace(/0+$/, '');
  return s.endsWith('.') ? `${s}0` : s;
}

/**
 * A string value safe for R12: one line, ASCII only — other characters become AutoCAD's `\U+XXXX`
 * escapes (R12 files are read in the drawing code page; UTF-8 arrived only with R2007).
 */
export function dxfString(s: string): string {
  let out = '';
  for (const ch of s.replace(/[\r\n\t]+/g, ' ')) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0x20 && cp < 0x7f) out += ch;
    else if (cp >= 0x7f) {
      const units = cp > 0xffff ? [ch.charCodeAt(0), ch.charCodeAt(1)] : [cp];
      out += units.map((u) => `\\U+${u.toString(16).toUpperCase().padStart(4, '0')}`).join('');
    }
  }
  return out;
}

type Box = { minX: number; minY: number; maxX: number; maxY: number };

function extents(doc: InteropDocument, piles: Map<string, InteropPile>): Box {
  const corners = doc.points.flatMap((p) => {
    const r = pileRadius(piles.get(p.id));
    return [
      { x: p.x - r, y: p.y - r },
      { x: p.x + r, y: p.y + r },
    ];
  });
  return bounds(corners) ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}

/** About 1/100 of the drawing diagonal, rounded to 50 mm, at least 50 mm. */
export function defaultTextHeight(box: Box): number {
  const diag = Math.hypot(box.maxX - box.minX, box.maxY - box.minY);
  return Math.max(50, Math.round(diag / 100 / 50) * 50);
}

function header(out: DxfOut, box: Box, textHeight: number): void {
  out.section('HEADER');
  out.pair(9, '$ACADVER');
  out.pair(1, 'AC1009');
  out.pair(9, '$DWGCODEPAGE');
  out.pair(3, 'ANSI_1252');
  out.pair(9, '$INSBASE');
  out.xy(10, 0, 0);
  out.pair(9, '$EXTMIN');
  out.xy(10, box.minX, box.minY);
  out.pair(9, '$EXTMAX');
  out.xy(10, box.maxX, box.maxY);
  out.pair(9, '$TEXTSIZE');
  out.real(40, textHeight);
  // points drawn as an "X" (PDMODE 3) of an absolute size so they stay visible
  out.pair(9, '$PDMODE');
  out.pair(70, 3);
  out.pair(9, '$PDSIZE');
  out.real(40, textHeight / 2);
  out.pair(0, 'ENDSEC');
}

/** Dashed pattern for construction lines, mm: 200 dash, 100 gap. */
const DASH = [200, -100] as const;

const LAYER_TABLE: readonly { name: string; color: number; ltype: string }[] = [
  { name: '0', color: 7, ltype: 'CONTINUOUS' },
  { name: DXF_LAYERS.sketch, color: 7, ltype: 'CONTINUOUS' },
  { name: DXF_LAYERS.construction, color: 8, ltype: 'DASHED' },
  { name: DXF_LAYERS.piles, color: 1, ltype: 'CONTINUOUS' },
  { name: DXF_LAYERS.labels, color: 5, ltype: 'CONTINUOUS' },
];

function tables(out: DxfOut, box: Box): void {
  out.section('TABLES');
  // VPORT *ACTIVE: open zoomed to the drawing instead of AutoCAD's default 12 × 9 units
  table(out, 'VPORT', 1, () => {
    const w = Math.max(box.maxX - box.minX, 1);
    const hgt = Math.max(box.maxY - box.minY, 1);
    out.pair(0, 'VPORT');
    out.pair(2, '*ACTIVE');
    out.pair(70, 0);
    out.real(10, 0);
    out.real(20, 0);
    out.real(11, 1);
    out.real(21, 1);
    out.real(12, (box.minX + box.maxX) / 2);
    out.real(22, (box.minY + box.maxY) / 2);
    out.real(13, 0);
    out.real(23, 0);
    out.real(14, 10);
    out.real(24, 10);
    out.real(15, 10);
    out.real(25, 10);
    out.xy(16, 0, 0, 1);
    out.xy(17, 0, 0, 0);
    out.real(40, Math.max(hgt, w / 1.5) * 1.1);
    out.real(41, 1.5);
    out.real(42, 50);
    out.real(43, 0);
    out.real(44, 0);
    out.real(50, 0);
    out.real(51, 0);
    for (const [code, v] of [
      [71, 0],
      [72, 100],
      [73, 1],
      [74, 3],
      [75, 0],
      [76, 0],
      [77, 0],
      [78, 0],
    ] as const)
      out.pair(code, v);
  });
  table(out, 'LTYPE', 2, () => {
    ltype(out, 'CONTINUOUS', 'Solid line', []);
    ltype(out, 'DASHED', 'Dashed __ __ __', DASH);
  });
  table(out, 'LAYER', LAYER_TABLE.length, () => {
    for (const l of LAYER_TABLE) {
      out.pair(0, 'LAYER');
      out.pair(2, l.name);
      out.pair(70, 0);
      out.pair(62, l.color);
      out.pair(6, l.ltype);
    }
  });
  table(out, 'STYLE', 1, () => {
    out.pair(0, 'STYLE');
    out.pair(2, 'STANDARD');
    out.pair(70, 0);
    out.real(40, 0);
    out.real(41, 1);
    out.real(50, 0);
    out.pair(71, 0);
    out.real(42, 2.5);
    out.pair(3, 'txt');
    out.pair(4, '');
  });
  out.pair(0, 'ENDSEC');
}

function table(out: DxfOut, name: string, count: number, body: () => void): void {
  out.pair(0, 'TABLE');
  out.pair(2, name);
  out.pair(70, count);
  body();
  out.pair(0, 'ENDTAB');
}

function ltype(out: DxfOut, name: string, description: string, pattern: readonly number[]): void {
  out.pair(0, 'LTYPE');
  out.pair(2, name);
  out.pair(70, 0);
  out.pair(3, description);
  out.pair(72, 65);
  out.pair(73, pattern.length);
  out.real(
    40,
    pattern.reduce((s, v) => s + Math.abs(v), 0),
  );
  for (const v of pattern) out.real(49, v);
}

function entities(out: DxfOut, doc: InteropDocument, piles: Map<string, InteropPile>, labels: boolean, h: number): void {
  const pts = byId(doc.points);
  for (const p of doc.points) {
    out.pair(0, 'POINT');
    out.pair(8, DXF_LAYERS.sketch);
    out.xy(10, p.x, p.y);
  }
  for (const l of doc.lines) {
    const a = pts.get(l.a)!;
    const b = pts.get(l.b)!;
    out.pair(0, 'LINE');
    out.pair(8, l.construction ? DXF_LAYERS.construction : DXF_LAYERS.sketch);
    out.xy(10, a.x, a.y);
    out.xy(11, b.x, b.y);
  }
  for (const [id, pile] of piles) pileEntities(out, pts.get(id)!, pile);
  if (labels) for (const p of doc.points) label(out, p, piles.get(p.id), h);
}

function pileEntities(out: DxfOut, at: InteropPoint, pile: InteropPile): void {
  const thickness = pile.depth ? -pile.depth : 0;
  if (pile.head) {
    const s = pile.head / 2;
    out.pair(0, 'POLYLINE');
    out.pair(8, DXF_LAYERS.piles);
    out.pair(66, 1);
    out.xy(10, 0, 0);
    if (thickness) out.real(39, thickness);
    out.pair(70, 1);
    for (const [dx, dy] of [
      [-s, -s],
      [s, -s],
      [s, s],
      [-s, s],
    ] as const) {
      out.pair(0, 'VERTEX');
      out.pair(8, DXF_LAYERS.piles);
      out.xy(10, at.x + dx, at.y + dy);
    }
    out.pair(0, 'SEQEND');
    out.pair(8, DXF_LAYERS.piles);
  }
  if (pile.diameter) {
    out.pair(0, 'CIRCLE');
    out.pair(8, DXF_LAYERS.piles);
    if (thickness) out.real(39, thickness);
    out.xy(10, at.x, at.y);
    out.real(40, pile.diameter / 2);
  }
}

/** Label up and to the right of the point, clear of the pile head. */
export const labelOffset = (pile: InteropPile | undefined, h: number): number => pileRadius(pile) + 0.3 * h;

function label(out: DxfOut, p: InteropPoint, pile: InteropPile | undefined, h: number): void {
  const text = pointText(p, pile);
  if (!text) return;
  const d = labelOffset(pile, h);
  out.pair(0, 'TEXT');
  out.pair(8, DXF_LAYERS.labels);
  out.xy(10, p.x + d, p.y + d);
  out.real(40, h);
  out.pair(1, dxfString(text));
}
