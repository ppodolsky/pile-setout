import type { Vec2 } from '@buildkit/geometry';

/** A point of the network with its design (approximate) position. */
export interface Station extends Vec2 {
  readonly id: string;
}

/** An unordered pair of stations. */
export interface Pair {
  readonly a: string;
  readonly b: string;
}

/** A measured distance between two stations (already corrected — see the caller's conventions). */
export interface DistanceObservation extends Pair {
  readonly length: number;
  /** Caller's reference (e.g. a measurement row id), passed through to residuals. */
  readonly ref?: string;
}

export const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
