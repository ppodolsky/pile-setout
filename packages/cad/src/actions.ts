import { measure, projectT } from './deps';
import type { ConstraintDraft, Line, Point } from './model';

export interface SelectionContext {
  /** Selected points in pick order. */
  readonly points: readonly Point[];
  readonly lines: readonly Line[];
  /** Endpoints of the selected lines. */
  readonly at: (id: string) => Point;
}

/**
 * What a selection allows. `constraints` are measured from the current geometry (nothing moves);
 * `create` makes a new point (the domain decides what goes on it, e.g. a pile) with constraints.
 */
export interface SelectionAction {
  readonly id: string;
  readonly name: string;
  readonly hint: string;
  readonly constraints?: (s: SelectionContext) => ConstraintDraft[];
  readonly create?: (s: SelectionContext) => { at: { x: number; y: number }; constraints: (id: string) => ConstraintDraft[] };
}

const P = (s: SelectionContext, i: number) => s.points[i]!;
const L = (s: SelectionContext, i: number) => s.lines[i]!;

/** Actions for the current selection (by how many points and lines are selected). */
export function selectionActions(points: number, lines: number): SelectionAction[] {
  const key = `${points}p${lines}l`;
  return ACTIONS[key] ?? [];
}

const ACTIONS: Record<string, SelectionAction[]> = {
  '1p0l': [
    {
      id: 'fix',
      name: 'Fix',
      hint: 'Pin this point where it is',
      constraints: (s) => [{ kind: 'fix', p: P(s, 0).id, x: P(s, 0).x, y: P(s, 0).y }],
    },
    {
      id: 'polar-point',
      name: 'New at distance + angle',
      hint: 'A new point 1000 mm from this one at 0°; edit the values in the inspector',
      create: (s) => {
        const a = P(s, 0);
        return {
          at: { x: a.x + 1000, y: a.y },
          constraints: (id) => [
            { kind: 'distance', a: a.id, b: id, d: 1000 },
            { kind: 'angle', a: a.id, b: id, angle: 0, ref: null },
          ],
        };
      },
    },
  ],
  '2p0l': [
    {
      id: 'distance',
      name: 'Distance',
      hint: 'Keep the distance between the two',
      constraints: (s) => [{ kind: 'distance', a: P(s, 0).id, b: P(s, 1).id, d: measure('distance', P(s, 0), P(s, 1)) }],
    },
    {
      id: 'distance-angle',
      name: 'Distance + angle',
      hint: 'Second at a distance and direction from the first (angle from the X axis)',
      constraints: (s) => [
        { kind: 'distance', a: P(s, 0).id, b: P(s, 1).id, d: measure('distance', P(s, 0), P(s, 1)) },
        { kind: 'angle', a: P(s, 0).id, b: P(s, 1).id, angle: measure('angle', P(s, 0), P(s, 1)), ref: null },
      ],
    },
    { id: 'horizontal', name: 'Horizontal', hint: 'Same Y', constraints: (s) => [{ kind: 'horizontal', a: P(s, 0).id, b: P(s, 1).id }] },
    { id: 'vertical', name: 'Vertical', hint: 'Same X', constraints: (s) => [{ kind: 'vertical', a: P(s, 0).id, b: P(s, 1).id }] },
    {
      id: 'dx',
      name: 'ΔX',
      hint: 'Keep the distance along X',
      constraints: (s) => [{ kind: 'dx', a: P(s, 0).id, b: P(s, 1).id, d: measure('dx', P(s, 0), P(s, 1)) }],
    },
    {
      id: 'dy',
      name: 'ΔY',
      hint: 'Keep the distance along Y',
      constraints: (s) => [{ kind: 'dy', a: P(s, 0).id, b: P(s, 1).id, d: measure('dy', P(s, 0), P(s, 1)) }],
    },
    {
      id: 'coincident',
      name: 'Coincident',
      hint: 'Same place',
      constraints: (s) => [{ kind: 'coincident', a: P(s, 0).id, b: P(s, 1).id }],
    },
    {
      id: 'mid-point',
      name: 'New in the middle',
      hint: 'A new point at the midpoint of the two',
      create: (s) => ({
        at: { x: (P(s, 0).x + P(s, 1).x) / 2, y: (P(s, 0).y + P(s, 1).y) / 2 },
        constraints: (id) => [{ kind: 'ratio', p: id, a: P(s, 0).id, b: P(s, 1).id, t: 0.5 }],
      }),
    },
  ],
  '3p0l': [
    {
      id: 'midpoint',
      name: 'Midpoint',
      hint: 'Last picked in the middle of the first two',
      constraints: (s) => [{ kind: 'ratio', p: P(s, 2).id, a: P(s, 0).id, b: P(s, 1).id, t: 0.5 }],
    },
    {
      id: 'ratio',
      name: 'On line at ratio',
      hint: 'Last picked on the line of the first two, at its current fraction',
      constraints: (s) => [{ kind: 'ratio', p: P(s, 2).id, a: P(s, 0).id, b: P(s, 1).id, t: projectT(P(s, 2), P(s, 0), P(s, 1)) }],
    },
    {
      id: 'online',
      name: 'On line',
      hint: 'Last picked on the line through the first two',
      constraints: (s) => [{ kind: 'onLine', p: P(s, 2).id, a: P(s, 0).id, b: P(s, 1).id }],
    },
    {
      id: 'angle-ref',
      name: 'Angle from direction',
      hint: 'Direction first → last picked, measured from the direction first → second',
      constraints: (s) => [
        { kind: 'angle', a: P(s, 0).id, b: P(s, 2).id, angle: measure('angle', P(s, 0), P(s, 2), P(s, 1)), ref: P(s, 1).id },
      ],
    },
  ],
  '0p1l': [
    {
      id: 'line-horizontal',
      name: 'Horizontal',
      hint: 'Line along X',
      constraints: (s) => [{ kind: 'horizontal', a: L(s, 0).a, b: L(s, 0).b, via: [L(s, 0).id] }],
    },
    {
      id: 'line-vertical',
      name: 'Vertical',
      hint: 'Line along Y',
      constraints: (s) => [{ kind: 'vertical', a: L(s, 0).a, b: L(s, 0).b, via: [L(s, 0).id] }],
    },
    {
      id: 'length',
      name: 'Length',
      hint: 'Keep the line’s length',
      constraints: (s) => [
        { kind: 'distance', a: L(s, 0).a, b: L(s, 0).b, d: measure('distance', s.at(L(s, 0).a), s.at(L(s, 0).b)), via: [L(s, 0).id] },
      ],
    },
    {
      id: 'line-mid-point',
      name: 'New in the middle',
      hint: 'A new point at the line’s midpoint',
      create: (s) => {
        const a = s.at(L(s, 0).a);
        const b = s.at(L(s, 0).b);
        return {
          at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          constraints: (id) => [{ kind: 'ratio', p: id, a: a.id, b: b.id, t: 0.5, via: [L(s, 0).id] }],
        };
      },
    },
  ],
  '0p2l': [
    {
      id: 'parallel',
      name: 'Parallel',
      hint: 'The two lines parallel',
      constraints: (s) => [{ kind: 'parallel', a: L(s, 0).a, b: L(s, 0).b, c: L(s, 1).a, d: L(s, 1).b, via: [L(s, 0).id, L(s, 1).id] }],
    },
    {
      id: 'perpendicular',
      name: 'Perpendicular',
      hint: 'The two lines at 90°',
      constraints: (s) => [
        { kind: 'perpendicular', a: L(s, 0).a, b: L(s, 0).b, c: L(s, 1).a, d: L(s, 1).b, via: [L(s, 0).id, L(s, 1).id] },
      ],
    },
    {
      id: 'equal',
      name: 'Equal length',
      hint: 'The two lines the same length',
      constraints: (s) => [{ kind: 'equal', a: L(s, 0).a, b: L(s, 0).b, c: L(s, 1).a, d: L(s, 1).b, via: [L(s, 0).id, L(s, 1).id] }],
    },
  ],
  '1p1l': [
    {
      id: 'on-line',
      name: 'On line',
      hint: 'Point on the line',
      constraints: (s) => [{ kind: 'onLine', p: P(s, 0).id, a: L(s, 0).a, b: L(s, 0).b, via: [L(s, 0).id] }],
    },
    {
      id: 'line-midpoint',
      name: 'Midpoint',
      hint: 'Point in the middle of the line',
      constraints: (s) => [{ kind: 'ratio', p: P(s, 0).id, a: L(s, 0).a, b: L(s, 0).b, t: 0.5, via: [L(s, 0).id] }],
    },
  ],
};
