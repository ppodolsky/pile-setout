import {
  exportWarnings,
  formatOf,
  fromDXF,
  fromPointsCSV,
  fromSLVS,
  toDXF,
  toFCStd,
  toPointsCSV,
  toSLVSBytes,
  toSVG,
  type FormatId,
  type InteropDocument,
} from '@buildkit/interop';
import { uid } from '@/lib/id';
import { pilesOf, type PileDesign, type PileElement } from './deps';

/** A pile plan as the neutral exchange document (labels from piles, pile sizes kept). */
export function toInterop(doc: PileDesign, name: string): InteropDocument {
  const piles = pilesOf(doc);
  const labelOf = new Map(piles.map((p) => [p.point, p.label]));
  return {
    units: 'mm',
    name,
    points: doc.points.map((p) => ({ id: p.id, x: p.x, y: p.y, ...(labelOf.has(p.id) ? { label: labelOf.get(p.id)! } : {}) })),
    lines: doc.lines.map((l) => ({ id: l.id, a: l.a, b: l.b, ...(l.construction ? { construction: true } : {}) })),
    // the exchange format knows constraints only, not which line they were made from
    constraints: doc.constraints.map(({ via: _via, ...c }) => c),
    piles: piles.map((p) => ({
      point: p.point,
      label: p.label,
      head: p.head,
      ...(p.diameter ? { diameter: p.diameter } : {}),
      ...(p.depth ? { depth: p.depth } : {}),
    })),
  };
}

/**
 * An imported document as a pile plan with fresh ids. Points with a pile get one; with
 * `everyPointIsPile` (survey point lists) every point becomes a pile.
 */
export function fromInterop(d: InteropDocument, defaults: { head: number }, everyPointIsPile = false): PileDesign {
  const pid = new Map(d.points.map((p) => [p.id, uid('pt')]));
  const P = (id: string) => pid.get(id) ?? id;
  const pileAt = new Map(d.piles.map((p) => [p.point, p]));
  const elements: PileElement[] = d.points
    .filter((p) => everyPointIsPile || pileAt.has(p.id))
    .map((p, i) => {
      const pile = pileAt.get(p.id);
      return {
        id: uid('p'),
        type: 'pile',
        point: P(p.id),
        label: pile?.label ?? p.label ?? `C${i + 1}`,
        head: pile?.head ?? defaults.head,
        ...(pile?.diameter ? { diameter: pile.diameter } : {}),
        ...(pile?.depth ? { depth: pile.depth } : {}),
        setout: 'measure',
      };
    });
  const remap = (c: InteropDocument['constraints'][number]) =>
    Object.fromEntries(
      Object.entries(c).map(([k, v]) => [k, ['p', 'a', 'b', 'c', 'd', 'ref'].includes(k) && typeof v === 'string' ? P(v) : v]),
    );
  return {
    points: d.points.map((p) => ({ id: P(p.id), x: p.x, y: p.y })),
    lines: d.lines.map((l) => ({ id: uid('l'), a: P(l.a), b: P(l.b), ...(l.construction ? { construction: true } : {}) })),
    constraints: d.constraints.map((c) => ({ ...remap(c), id: uid('k') }) as PileDesign['constraints'][number]),
    elements,
  };
}

export interface ExportFile {
  readonly blob: Blob;
  readonly filename: string;
  readonly warnings: string[];
}

/** Exports the plan to a CAD / exchange format. */
export function exportDesign(doc: PileDesign, name: string, format: FormatId): ExportFile {
  const d = toInterop(doc, name);
  const base = (name || 'pile-field').replace(/[^\w.-]+/g, '-');
  const file = (data: BlobPart, ext: string, type: string): ExportFile => ({
    blob: new Blob([data], { type }),
    filename: `${base}.${ext}`,
    warnings: exportWarnings(d, format),
  });
  switch (format) {
    case 'dxf':
      return file(toDXF(d), 'dxf', 'image/vnd.dxf');
    case 'slvs':
      return file(toSLVSBytes(d) as BlobPart, 'slvs', 'application/octet-stream');
    case 'fcstd':
      return file(toFCStd(d) as BlobPart, 'FCStd', 'application/zip');
    case 'svg':
      return file(toSVG(d), 'svg', 'image/svg+xml');
    case 'csv':
      return file(toPointsCSV(d), 'csv', 'text/csv');
  }
}

/** Reads a CAD / exchange file into a pile plan; null if the format can't be imported. */
export async function importDesign(f: File, defaults: { head: number }): Promise<{ doc: PileDesign; warnings: string[] } | null> {
  const fmt = formatOf(f.name);
  if (!fmt?.canImport) return null;
  if (fmt.id === 'slvs') {
    const r = fromSLVS(new Uint8Array(await f.arrayBuffer()));
    return { doc: fromInterop(r.document, defaults), warnings: r.warnings };
  }
  const text = await f.text();
  if (fmt.id === 'dxf') {
    const r = fromDXF(text);
    return { doc: fromInterop(r.document, defaults), warnings: r.warnings };
  }
  if (fmt.id === 'csv') {
    const r = fromPointsCSV(text);
    return { doc: fromInterop(r.document, defaults, true), warnings: r.warnings };
  }
  return null;
}
