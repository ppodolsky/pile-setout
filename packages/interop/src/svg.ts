import { bounds, byId, checkDocument, pileRadius, pilesByPoint, pointText } from './doc';
import type { ExportResult, InteropDocument, InteropPile } from './model';

/**
 * SVG export for printing and documents: a to-scale drawing in paper millimetres (`width="…mm"`),
 * Y flipped so north/up stays up, text upright. Layers are `<g>` groups with classes (`sketch`,
 * `construction`, `piles`, `points`, `labels`, `caption`) styled by an embedded stylesheet you can
 * replace. Export only; constraints are not drawn.
 */
export interface SvgOptions {
  /** Drawing scale 1:N (paper mm per N world mm), or 'auto': the smallest standard scale that fits `fit`. */
  scale?: number | 'auto';
  /** Paper area the drawing must fit for 'auto', mm (default A4 landscape inside 10 mm margins: 277 × 190). */
  fit?: { width: number; height: number };
  /** Margin around the drawing, paper mm (default 10). */
  margin?: number;
  /** Draw point/pile labels (default true). */
  labels?: boolean;
  /** Draw construction lines, dashed (default true). */
  construction?: boolean;
  /** Title and scale line under the drawing (default true). */
  caption?: boolean;
  /** Replaces the default stylesheet. */
  css?: string;
}

/** Standard drawing scales 1:N (ISO 5455 series plus common site-plan scales). */
export const STANDARD_SCALES = [1, 2, 5, 10, 20, 25, 50, 75, 100, 125, 200, 250, 500, 1000, 1250, 2000, 2500, 5000, 10000] as const;

export const DEFAULT_SVG_CSS = [
  '.sketch line{stroke:#000;stroke-width:.35;stroke-linecap:round}',
  '.construction line{stroke:#888;stroke-width:.18;stroke-dasharray:2 1}',
  '.piles rect,.piles circle{fill:none;stroke:#000;stroke-width:.25}',
  '.points path{stroke:#000;stroke-width:.18}',
  'text{font-family:sans-serif;fill:#000}',
  '.labels text{font-size:2.5px}',
  '.caption text{font-size:3px}',
].join('');

/** SVG text of the document. */
export const toSVG = (doc: InteropDocument, opts: SvgOptions = {}): string => exportSVG(doc, opts).output;

/**
 * Like {@link toSVG}, also listing what the drawing leaves out.
 *
 * @throws InteropError if the document references missing points; RangeError for a scale ≤ 0.
 */
export function exportSVG(doc: InteropDocument, opts: SvgOptions = {}): ExportResult<string> {
  checkDocument(doc);
  const warnings = doc.constraints.length ? [`${doc.constraints.length} constraint(s) not drawn`] : [];
  const piles = pilesByPoint(doc.piles);
  const box = bounds(
    doc.points.flatMap((p) => {
      const r = pileRadius(piles.get(p.id));
      return [
        { x: p.x - r, y: p.y - r },
        { x: p.x + r, y: p.y + r },
      ];
    }),
  ) ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const fit = opts.fit ?? { width: 277, height: 190 };
  const n = opts.scale == null || opts.scale === 'auto' ? autoScale(box.maxX - box.minX, box.maxY - box.minY, fit) : opts.scale;
  if (!(n > 0)) throw new RangeError(`SVG scale must be positive, got ${n}`);
  const margin = opts.margin ?? 10;
  const caption = opts.caption ?? true;
  const labelRoom = opts.labels === false ? 0 : 8;
  const W = (box.maxX - box.minX) / n + 2 * margin + labelRoom;
  const H = (box.maxY - box.minY) / n + 2 * margin + labelRoom + (caption ? 8 : 0);
  const X = (x: number) => f(margin + (x - box.minX) / n);
  const Y = (y: number) => f(margin + labelRoom + (box.maxY - y) / n);

  const pts = byId(doc.points);
  const line = (a: string, b: string) => {
    const p = pts.get(a)!;
    const q = pts.get(b)!;
    return `<line x1="${X(p.x)}" y1="${Y(p.y)}" x2="${X(q.x)}" y2="${Y(q.y)}"/>`;
  };
  const group = (cls: string, items: string[]) => (items.length ? `<g class="${cls}">${items.join('')}</g>\n` : '');
  const body = [
    group('construction', opts.construction === false ? [] : doc.lines.filter((l) => l.construction).map((l) => line(l.a, l.b))),
    group(
      'sketch',
      doc.lines.filter((l) => !l.construction).map((l) => line(l.a, l.b)),
    ),
    group(
      'piles',
      [...piles].map(([id, pile]) => pileSvg(id, pts.get(id)!, pile, n, X, Y)),
    ),
    group(
      'points',
      doc.points.map((p) => {
        const s = 0.8;
        const x = margin + (p.x - box.minX) / n;
        const y = margin + labelRoom + (box.maxY - p.y) / n;
        return `<path data-id="${esc(p.id)}" d="M${f(x - s)} ${f(y - s)}L${f(x + s)} ${f(y + s)}M${f(x - s)} ${f(y + s)}L${f(x + s)} ${f(y - s)}"/>`;
      }),
    ),
    group(
      'labels',
      opts.labels === false
        ? []
        : doc.points.flatMap((p) => {
            const text = pointText(p, piles.get(p.id));
            if (!text) return [];
            const d = pileRadius(piles.get(p.id)) / n + 1;
            return [`<text x="${f(Number(X(p.x)) + d)}" y="${f(Number(Y(p.y)) - d)}">${esc(text)}</text>`];
          }),
    ),
    caption
      ? group('caption', [
          `<text x="${f(margin)}" y="${f(H - margin / 2)}">${esc([doc.name, `1:${n}`, 'mm'].filter(Boolean).join(' · '))}</text>`,
        ])
      : '',
  ].join('');
  const title = doc.name ? `<title>${esc(doc.name)}</title>\n` : '';
  const output =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${f(W)}mm" height="${f(H)}mm" viewBox="0 0 ${f(W)} ${f(H)}" data-scale="${n}">\n` +
    title +
    `<style>${opts.css ?? DEFAULT_SVG_CSS}</style>\n` +
    body +
    `</svg>\n`;
  return { output, warnings };
}

/** Smallest standard scale 1:N at which a w × h mm drawing fits the paper area. */
export function autoScale(w: number, h: number, fit: { width: number; height: number }): number {
  return STANDARD_SCALES.find((n) => w / n <= fit.width && h / n <= fit.height) ?? Math.ceil(Math.max(w / fit.width, h / fit.height));
}

function pileSvg(
  id: string,
  at: { x: number; y: number },
  pile: InteropPile,
  n: number,
  X: (x: number) => string,
  Y: (y: number) => string,
): string {
  const parts: string[] = [];
  if (pile.head) {
    const s = pile.head / 2;
    parts.push(`<rect x="${X(at.x - s)}" y="${Y(at.y + s)}" width="${f(pile.head / n)}" height="${f(pile.head / n)}"/>`);
  }
  if (pile.diameter) parts.push(`<circle cx="${X(at.x)}" cy="${Y(at.y)}" r="${f(pile.diameter / 2 / n)}"/>`);
  return parts.length ? `<g data-id="${esc(id)}">${parts.join('')}</g>` : '';
}

/** Paper coordinate, 0.001 mm. */
const f = (v: number): string => String(Math.round(v * 1000) / 1000);

const esc = (s: string): string => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
