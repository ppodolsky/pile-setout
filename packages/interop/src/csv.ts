import { checkDocument, pilesByPoint, pointText } from './doc';
import type { ExportResult, ImportResult, InteropPoint } from './model';
import type { InteropDocument } from './model';

/**
 * Survey point list (CSV) — the format total stations and GNSS rovers (Leica, Trimble, Topcon,
 * Carlson…) import for stake-out: one row per point, Point name, Easting, Northing, Elevation,
 * Description (PENZD; PNEZD is the other common order). Easting = X, Northing = Y of the site grid,
 * in metres by default as field software expects; elevation is 0 (the sketch is 2D).
 * Keeps points and names only — lines, constraints and pile sizes are not part of a point list.
 */
export interface PointsCsvOptions {
  /** Column order (default PENZD). */
  order?: 'PENZD' | 'PNEZD';
  /** Coordinate unit in the file (default metres). */
  unit?: 'm' | 'mm';
  /** Field separator (default ","); on import it is detected when omitted. */
  delimiter?: ',' | ';' | '\t';
}

export const toPointsCSV = (doc: InteropDocument, opts: PointsCsvOptions = {}): string => exportPointsCSV(doc, opts).output;

/**
 * Like {@link toPointsCSV}, also listing what a point list cannot keep.
 *
 * @throws InteropError if the document references missing points.
 */
export function exportPointsCSV(doc: InteropDocument, opts: PointsCsvOptions = {}): ExportResult<string> {
  checkDocument(doc);
  const sep = opts.delimiter ?? ',';
  const k = opts.unit === 'mm' ? 1 : 1000;
  const piles = pilesByPoint(doc.piles);
  const cols =
    opts.order === 'PNEZD'
      ? ['Point', 'Northing', 'Easting', 'Elevation', 'Description']
      : ['Point', 'Easting', 'Northing', 'Elevation', 'Description'];
  const rows = doc.points.map((p) => {
    const e = fixed(p.x / k, k);
    const n = fixed(p.y / k, k);
    const name = pointText(p, piles.get(p.id)) ?? p.id;
    const desc = piles.has(p.id) ? 'pile' : '';
    const cells = opts.order === 'PNEZD' ? [name, n, e, '0', desc] : [name, e, n, '0', desc];
    return cells.map((c) => cell(c, sep)).join(sep);
  });
  const dropped = doc.lines.length + doc.constraints.length;
  const warnings = dropped
    ? [`${doc.lines.length} line(s) and ${doc.constraints.length} constraint(s) dropped — a point list has points only`]
    : [];
  return { output: [cols.join(sep), ...rows].join('\n') + '\n', warnings };
}

/** Points from a survey CSV (header row optional, delimiter detected). Point names become labels. */
export function fromPointsCSV(text: string, opts: PointsCsvOptions = {}): ImportResult {
  const k = opts.unit === 'mm' ? 1 : 1000;
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const sep = opts.delimiter ?? ([',', ';', '\t'] as const).find((d) => lines[0]?.includes(d)) ?? ',';
  const warnings: string[] = [];
  const points: InteropPoint[] = [];
  lines.forEach((line, i) => {
    const c = split(line, sep);
    const [e, n] = opts.order === 'PNEZD' ? [c[2], c[1]] : [c[1], c[2]];
    const x = Number(e);
    const y = Number(n);
    if (!Number.isFinite(x) || !Number.isFinite(y) || e?.trim() === '' || n?.trim() === '') {
      if (i > 0 || !/[a-z]/i.test(line)) warnings.push(`row ${i + 1} has no coordinates — skipped`);
      return;
    }
    const label = c[0]?.trim();
    points.push({ id: `p${points.length + 1}`, x: um(x * k), y: um(y * k), ...(label ? { label } : {}) });
  });
  return { document: { units: 'mm', points, lines: [], constraints: [], piles: [] }, warnings };
}

/** Rounds to 1 µm (drops float noise of the unit conversion). */
const um = (v: number): number => Math.round(v * 1000) / 1000;

/** Fixed decimals for the unit: 0.1 mm resolution. */
const fixed = (v: number, k: number): string => v.toFixed(k === 1000 ? 4 : 1);

const cell = (s: string, sep: string): string => (s.includes(sep) || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s);

/** One CSV row, honouring double-quoted cells. */
function split(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}
