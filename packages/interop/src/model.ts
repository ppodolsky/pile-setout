import type { Constraint } from '@buildkit/sketch';

/**
 * The neutral document every format converts to and from: a 2D sketch of points and segments
 * with the `@buildkit/sketch` constraints between the points, plus pile properties attached to
 * points. Millimetres, X right, Y up (CAD convention), angles in degrees counter-clockwise.
 */

/** A sketch point, mm. `id` is stable; `label` is for people (e.g. "P1"). */
export interface InteropPoint {
  id: string;
  x: number;
  y: number;
  label?: string;
}

/** A segment between two points (ids). Construction lines are reference geometry, not drawn. */
export interface InteropLine {
  id: string;
  a: string;
  b: string;
  construction?: boolean;
}

/** A pile at a point: square head side, shaft diameter and depth below the head, all mm. */
export interface InteropPile {
  point: string;
  label?: string;
  /** Square head side, mm. */
  head?: number;
  /** Shaft diameter, mm. */
  diameter?: number;
  /** Depth below the head, mm. */
  depth?: number;
}

export interface InteropDocument {
  units: 'mm';
  /** Optional title (SVG `<title>`, FreeCAD document label). */
  name?: string;
  points: InteropPoint[];
  lines: InteropLine[];
  constraints: Constraint[];
  piles: InteropPile[];
}

/** An imported document plus everything that could not be represented, in plain words. */
export interface ImportResult {
  document: InteropDocument;
  warnings: string[];
}

/** An exported file plus everything the format could not keep. */
export interface ExportResult<T> {
  output: T;
  warnings: string[];
}

export const emptyDocument = (): InteropDocument => ({ units: 'mm', points: [], lines: [], constraints: [], piles: [] });
