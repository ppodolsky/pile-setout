import { pairKey, pileRadius, positive } from './doc';
import { emptyDocument, type ImportResult, type InteropLine, type InteropPile } from './model';
import { PointPool } from './pool';

/**
 * DXF import (ASCII, any version from R12 on). Reads POINT, LINE, LWPOLYLINE, POLYLINE (2D/3D, not
 * meshes), CIRCLE, TEXT and MTEXT from the ENTITIES section:
 * - every point, line end, polyline vertex and circle centre becomes a sketch point; points closer than
 *   `tolerance` (0.01 mm) are merged, so a closed outline shares its corners;
 * - lines and polyline edges become sketch lines (construction if the layer name says so);
 * - on a pile layer (name contains "PILE"), closed squares and circles up to `maxPileSize` become
 *   piles — head side / diameter, depth = |thickness| — at their centre;
 * - a TEXT/MTEXT becomes the label of the nearest point within ~3 text heights (plus pile size).
 * Everything else (arcs, splines, hatches, dimensions, block inserts…) is reported in `warnings`.
 * Coordinates are converted to mm from `$INSUNITS` when the file declares other units.
 */
export interface DxfImportOptions {
  /** Merge distance for coincident points, mm (default 0.01). */
  tolerance?: number;
  /** Largest square / circle on a pile layer still read as a pile, mm (default 5000). */
  maxPileSize?: number;
}

export function fromDXF(text: string, opts: DxfImportOptions = {}): ImportResult {
  const warnings: string[] = [];
  if (text.startsWith('AutoCAD Binary DXF')) {
    return { document: emptyDocument(), warnings: ['binary DXF is not supported — save as ASCII DXF'] };
  }
  const pairs = tokenize(text);
  const scale = unitScale(headerVar(pairs, '$INSUNITS'), warnings);
  const shapes = collectShapes(entityRecords(pairs), scale, warnings);
  return { document: build(shapes, opts, warnings), warnings };
}

interface Pair {
  code: number;
  value: string;
}

/** Group code / value pairs; tolerant of CRLF and of padding around codes. */
export function tokenize(text: string): Pair[] {
  const lines = text.split(/\r?\n/);
  const pairs: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number.parseInt(lines[i]!.trim(), 10);
    if (Number.isNaN(code)) break;
    pairs.push({ code, value: lines[i + 1]!.replace(/\r$/, '') });
  }
  return pairs;
}

function headerVar(pairs: readonly Pair[], name: string): string | undefined {
  const i = pairs.findIndex((p) => p.code === 9 && p.value.trim() === name);
  return i >= 0 ? pairs[i + 1]?.value.trim() : undefined;
}

/** mm per drawing unit for `$INSUNITS` codes (AutoCAD DXF reference, HEADER section). */
const UNITS: Record<number, [string, number]> = {
  1: ['inches', 25.4],
  2: ['feet', 304.8],
  4: ['millimetres', 1],
  5: ['centimetres', 10],
  6: ['metres', 1000],
  7: ['kilometres', 1e6],
  10: ['yards', 914.4],
  14: ['decimetres', 100],
};

function unitScale(insunits: string | undefined, warnings: string[]): number {
  const code = insunits == null ? 0 : Number(insunits);
  if (!code) return 1;
  const unit = UNITS[code];
  if (!unit) {
    warnings.push(`unsupported $INSUNITS ${code} — coordinates read as millimetres`);
    return 1;
  }
  if (unit[1] !== 1) warnings.push(`drawing units are ${unit[0]} — converted to millimetres`);
  return unit[1];
}

interface EntityRecord {
  type: string;
  pairs: Pair[];
  /** VERTEX records of a POLYLINE. */
  vertices?: EntityRecord[];
}

/** Entity records of the ENTITIES section, POLYLINE vertices folded into their polyline. */
function entityRecords(pairs: readonly Pair[]): EntityRecord[] {
  const out: EntityRecord[] = [];
  let inEntities = false;
  let current: EntityRecord | null = null;
  let polyline: EntityRecord | null = null;
  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i]!;
    if (p.code !== 0) {
      current?.pairs.push(p);
      continue;
    }
    const type = p.value.trim();
    if (type === 'SECTION') {
      inEntities = pairs[i + 1]?.value.trim() === 'ENTITIES';
      current = null;
      continue;
    }
    if (!inEntities) continue;
    if (type === 'ENDSEC' || type === 'EOF') {
      inEntities = false;
      current = null;
      continue;
    }
    current = { type, pairs: [] };
    if (type === 'VERTEX' && polyline) polyline.vertices!.push(current);
    else if (type === 'SEQEND') polyline = null;
    else {
      out.push(current);
      polyline = type === 'POLYLINE' ? current : null;
      if (polyline) polyline.vertices = [];
    }
  }
  return out;
}

const num = (r: EntityRecord, code: number, dflt = 0): number => {
  const v = r.pairs.find((p) => p.code === code)?.value;
  const n = v == null ? NaN : Number.parseFloat(v);
  return Number.isFinite(n) ? n : dflt;
};
const str = (r: EntityRecord, code: number): string | undefined => r.pairs.find((p) => p.code === code)?.value;

interface Shapes {
  points: XY[];
  segments: { a: XY; b: XY; layer: string }[];
  circles: { c: XY; r: number; layer: string; thickness: number }[];
  polylines: { verts: XY[]; closed: boolean; layer: string; thickness: number }[];
  texts: { at: XY; height: number; text: string }[];
}

type XY = { x: number; y: number };

function collectShapes(records: readonly EntityRecord[], k: number, warnings: string[]): Shapes {
  const s: Shapes = { points: [], segments: [], circles: [], polylines: [], texts: [] };
  const dropped = new Map<string, number>();
  let bulges = 0;
  for (const r of records) {
    const layer = str(r, 8)?.trim() ?? '0';
    // OCS entities drawn with extrusion (0, 0, −1) are mirrored in X (arbitrary axis algorithm)
    const fx = num(r, 230, 1) < 0 ? -1 : 1;
    const at = (cx: number, cy: number): XY => ({ x: num(r, cx) * k * fx, y: num(r, cy) * k });
    switch (r.type) {
      case 'POINT':
        s.points.push({ x: num(r, 10) * k, y: num(r, 20) * k });
        break;
      case 'LINE':
        s.segments.push({ a: { x: num(r, 10) * k, y: num(r, 20) * k }, b: { x: num(r, 11) * k, y: num(r, 21) * k }, layer });
        break;
      case 'CIRCLE':
        s.circles.push({ c: at(10, 20), r: num(r, 40) * k, layer, thickness: num(r, 39) * k });
        break;
      case 'LWPOLYLINE': {
        const xs = r.pairs.filter((p) => p.code === 10).map((p) => Number.parseFloat(p.value) * k * fx);
        const ys = r.pairs.filter((p) => p.code === 20).map((p) => Number.parseFloat(p.value) * k);
        bulges += r.pairs.filter((p) => p.code === 42 && Number.parseFloat(p.value) !== 0).length;
        const verts = xs.map((x, i) => ({ x, y: ys[i] ?? 0 }));
        s.polylines.push({ verts, closed: (num(r, 70) & 1) === 1, layer, thickness: num(r, 39) * k });
        break;
      }
      case 'POLYLINE': {
        const flags = num(r, 70);
        if (flags & (16 | 64)) {
          dropped.set('polygon/polyface mesh', (dropped.get('polygon/polyface mesh') ?? 0) + 1);
          break;
        }
        const fx3 = flags & 8 ? 1 : fx; // 3D polylines are in WCS
        const verts = (r.vertices ?? [])
          .filter((v) => !(num(v, 70) & 16)) // skip spline frame control points
          .map((v) => {
            if (num(v, 42) !== 0) bulges++;
            return { x: num(v, 10) * k * fx3, y: num(v, 20) * k };
          });
        s.polylines.push({ verts, closed: (flags & 1) === 1, layer, thickness: num(r, 39) * k });
        break;
      }
      case 'TEXT': {
        const aligned = num(r, 72) !== 0 || num(r, 73) !== 0;
        const anchor = aligned && r.pairs.some((p) => p.code === 11) ? at(11, 21) : at(10, 20);
        s.texts.push({ at: anchor, height: num(r, 40, 1) * k, text: decodeText(str(r, 1) ?? '') });
        break;
      }
      case 'MTEXT': {
        const raw = r.pairs
          .filter((p) => p.code === 3)
          .map((p) => p.value)
          .join('');
        s.texts.push({
          at: { x: num(r, 10) * k, y: num(r, 20) * k },
          height: num(r, 40, 1) * k,
          text: decodeMText(raw + (str(r, 1) ?? '')),
        });
        break;
      }
      default:
        dropped.set(r.type, (dropped.get(r.type) ?? 0) + 1);
    }
  }
  if (bulges) warnings.push(`${bulges} polyline arc segment(s) (bulge) read as straight lines`);
  for (const [type, n] of dropped) {
    warnings.push(
      `${n} ${type} entit${n === 1 ? 'y' : 'ies'} not supported — dropped${type === 'INSERT' ? ' (blocks are not expanded)' : ''}`,
    );
  }
  return s;
}

/** TEXT value: `\U+XXXX` escapes and `%%` control codes (Ø, °, ±; under/overline toggles dropped). */
export function decodeText(s: string): string {
  return s
    .replace(/\\U\+([0-9a-fA-F]{4})/g, (_, h: string) => String.fromCharCode(Number.parseInt(h, 16)))
    .replace(/%%([cdpCDPuoUO%])/g, (_, c: string) => ({ c: 'Ø', d: '°', p: '±', '%': '%' })[c.toLowerCase()] ?? '')
    .trim();
}

/** MTEXT value: inline formatting codes stripped, paragraphs joined with spaces. */
export function decodeMText(s: string): string {
  return decodeText(
    s
      .replace(/\\\\/g, '\uE000')
      .replace(/\\[Pp~]/g, ' ')
      .replace(/\\S([^;]*)\^([^;]*);/g, '$1/$2')
      .replace(/\\[fFHhCcAaWwQqTtpX][^;]*;/g, '')
      .replace(/\\[LlOoKkNn]/g, '')
      .replace(/[{}]/g, '')
      .replace(/\uE000/g, '\\'),
  ).replace(/\s+/g, ' ');
}

const isPileLayer = (layer: string) => /pile/i.test(layer);
const isConstructionLayer = (layer: string) => /construct/i.test(layer);

/** Centre and side of a closed axis-free square (4 vertices, optionally repeating the first), else null. */
export function squareOf(verts: readonly XY[], tol: number): { c: XY; side: number } | null {
  const v = verts.length === 5 && Math.hypot(verts[0]!.x - verts[4]!.x, verts[0]!.y - verts[4]!.y) <= tol ? verts.slice(0, 4) : verts;
  if (v.length !== 4) return null;
  const [a, b, c, d] = v as [XY, XY, XY, XY];
  const side = Math.hypot(b.x - a.x, b.y - a.y);
  const sides = [side, Math.hypot(c.x - b.x, c.y - b.y), Math.hypot(d.x - c.x, d.y - c.y), Math.hypot(a.x - d.x, a.y - d.y)];
  const diag = [Math.hypot(c.x - a.x, c.y - a.y), Math.hypot(d.x - b.x, d.y - b.y)];
  const t = Math.max(tol, side * 1e-6);
  if (side <= t || sides.some((s) => Math.abs(s - side) > t) || diag.some((g) => Math.abs(g - side * Math.SQRT2) > t)) return null;
  return { c: { x: (a.x + b.x + c.x + d.x) / 4, y: (a.y + b.y + c.y + d.y) / 4 }, side };
}

function build(s: Shapes, opts: DxfImportOptions, warnings: string[]): ImportResult['document'] {
  const tol = opts.tolerance ?? 0.01;
  const maxPile = opts.maxPileSize ?? 5000;
  const pool = new PointPool(tol);
  const lines: InteropLine[] = [];
  const seen = new Set<string>();
  const addLine = (a: XY, b: XY, layer: string) => {
    const ia = pool.add(a.x, a.y);
    const ib = pool.add(b.x, b.y);
    if (ia === ib || seen.has(pairKey(ia, ib))) return;
    seen.add(pairKey(ia, ib));
    lines.push({ id: `l${lines.length + 1}`, a: ia, b: ib, ...(isConstructionLayer(layer) ? { construction: true } : {}) });
  };

  for (const p of s.points) pool.add(p.x, p.y);
  for (const g of s.segments) addLine(g.a, g.b, g.layer);

  const piles = new Map<string, InteropPile>();
  const pileAt = (c: XY): InteropPile => {
    const id = pool.add(c.x, c.y);
    const pile = piles.get(id) ?? { point: id };
    piles.set(id, pile);
    return pile;
  };
  const depth = (thickness: number) => positive(Math.abs(thickness));
  for (const pl of s.polylines) {
    const sq = pl.closed || pl.verts.length === 5 ? squareOf(pl.verts, tol) : null;
    if (sq && isPileLayer(pl.layer) && sq.side <= maxPile) {
      const pile = pileAt(sq.c);
      pile.head = sq.side;
      pile.depth ??= depth(pl.thickness);
      continue;
    }
    pl.verts.forEach((v, i) => {
      const next = pl.verts[i + 1] ?? (pl.closed ? pl.verts[0] : undefined);
      if (next) addLine(v, next, pl.layer);
      else pool.add(v.x, v.y);
    });
  }
  let radii = 0;
  for (const c of s.circles) {
    if (isPileLayer(c.layer) && 2 * c.r <= maxPile) {
      const pile = pileAt(c.c);
      pile.diameter = 2 * c.r;
      pile.depth ??= depth(c.thickness);
    } else {
      pool.add(c.c.x, c.c.y);
      radii++;
    }
  }
  if (radii) warnings.push(`${radii} circle(s) read as their centre point (radius dropped)`);

  const points = pool.points;
  assignLabels(s.texts, points, piles, warnings);
  for (const [id, pile] of piles) {
    const label = points.find((p) => p.id === id)?.label;
    if (label) pile.label = label;
  }
  return { units: 'mm', points, lines, constraints: [], piles: [...piles.values()] };
}

/** Each text labels the nearest point within reach; the closest text wins a contested point. */
function assignLabels(
  texts: Shapes['texts'],
  points: { id: string; x: number; y: number; label?: string }[],
  piles: Map<string, InteropPile>,
  warnings: string[],
): void {
  const best = new Map<string, { text: string; d: number }>();
  let orphans = 0;
  for (const t of texts) {
    if (!t.text) continue;
    let pick: { id: string; d: number } | null = null;
    for (const p of points) {
      const d = Math.hypot(p.x - t.at.x, p.y - t.at.y);
      const reach = 3 * t.height + 1.5 * pileRadius(piles.get(p.id));
      if (d <= reach && (!pick || d < pick.d)) pick = { id: p.id, d };
    }
    if (!pick) {
      orphans++;
      continue;
    }
    const prev = best.get(pick.id);
    if (prev) orphans++;
    if (!prev || pick.d < prev.d) best.set(pick.id, { text: t.text, d: pick.d });
  }
  for (const p of points) {
    const b = best.get(p.id);
    if (b) p.label = b.text;
  }
  if (orphans) warnings.push(`${orphans} text(s) not next to a point (or a second text at one) — dropped`);
}
