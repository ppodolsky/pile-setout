import { measure, projectT, type Constraint, type Pile } from './deps';

/** A constraint to add, without an id yet. */
export type ConstraintDraft = Constraint extends infer C ? (C extends { id: string } ? Omit<C, 'id'> : never) : never;

/** Something the selection allows: add constraints between the selected piles, or a new pile. */
export interface SelectionAction {
  readonly id: string;
  readonly name: string;
  readonly hint: string;
  /** Constraints between selected piles, measured from where they are now (nothing moves). */
  readonly constraints?: (sel: readonly Pile[]) => ConstraintDraft[];
  /** A new pile placed relative to the selection, with its constraints. */
  readonly newPile?: (sel: readonly Pile[]) => { at: { x: number; y: number }; constraints: (id: string) => ConstraintDraft[] };
}

const two = (s: readonly Pile[]) => [s[0]!, s[1]!] as const;

/** Actions for a selection of 1, 2 or 3 piles (order = pick order). */
export function selectionActions(n: number): SelectionAction[] {
  if (n === 1)
    return [
      { id: 'fix', name: 'Fix', hint: 'Pin this pile where it is', constraints: ([p]) => [{ kind: 'fix', p: p!.id, x: p!.x, y: p!.y }] },
      {
        id: 'polar-pile',
        name: 'New pile at distance + angle',
        hint: 'A new pile 1000 mm from this one at 0°; edit the values in the inspector',
        newPile: ([a]) => ({
          at: { x: a!.x + 1000, y: a!.y },
          constraints: (id) => [
            { kind: 'distance', a: a!.id, b: id, d: 1000 },
            { kind: 'angle', a: a!.id, b: id, angle: 0, ref: null },
          ],
        }),
      },
    ];
  if (n === 2)
    return [
      {
        id: 'distance',
        name: 'Distance',
        hint: 'Keep the distance between the two piles',
        constraints: (s) => {
          const [a, b] = two(s);
          return [{ kind: 'distance', a: a.id, b: b.id, d: measure('distance', a, b) }];
        },
      },
      {
        id: 'distance-angle',
        name: 'Distance + angle',
        hint: 'Second pile at a distance and direction from the first (angle from the X axis)',
        constraints: (s) => {
          const [a, b] = two(s);
          return [
            { kind: 'distance', a: a.id, b: b.id, d: measure('distance', a, b) },
            { kind: 'angle', a: a.id, b: b.id, angle: measure('angle', a, b), ref: null },
          ];
        },
      },
      {
        id: 'horizontal',
        name: 'Horizontal',
        hint: 'Same Y (on one line along the containers)',
        constraints: (s) => {
          const [a, b] = two(s);
          return [{ kind: 'horizontal', a: a.id, b: b.id }];
        },
      },
      {
        id: 'vertical',
        name: 'Vertical',
        hint: 'Same X (on one line across)',
        constraints: (s) => {
          const [a, b] = two(s);
          return [{ kind: 'vertical', a: a.id, b: b.id }];
        },
      },
      {
        id: 'dx',
        name: 'ΔX',
        hint: 'Keep the distance along X',
        constraints: (s) => {
          const [a, b] = two(s);
          return [{ kind: 'dx', a: a.id, b: b.id, d: measure('dx', a, b) }];
        },
      },
      {
        id: 'dy',
        name: 'ΔY',
        hint: 'Keep the distance along Y',
        constraints: (s) => {
          const [a, b] = two(s);
          return [{ kind: 'dy', a: a.id, b: b.id, d: measure('dy', a, b) }];
        },
      },
      {
        id: 'mid-pile',
        name: 'New pile in the middle',
        hint: 'A new pile at the midpoint of the two, set out on the string between them',
        newPile: (s) => {
          const [a, b] = two(s);
          return {
            at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
            constraints: (id) => [{ kind: 'ratio', p: id, a: a.id, b: b.id, t: 0.5 }],
          };
        },
      },
    ];
  if (n === 3)
    return [
      {
        id: 'midpoint',
        name: 'Midpoint',
        hint: 'Last picked pile in the middle of the first two',
        constraints: ([a, b, p]) => [{ kind: 'ratio', p: p!.id, a: a!.id, b: b!.id, t: 0.5 }],
      },
      {
        id: 'ratio',
        name: 'On line at ratio',
        hint: 'Last picked pile on the line of the first two, at its current fraction',
        constraints: ([a, b, p]) => [{ kind: 'ratio', p: p!.id, a: a!.id, b: b!.id, t: projectT(p!, a!, b!) }],
      },
      {
        id: 'online',
        name: 'On line',
        hint: 'Last picked pile on the line through the first two',
        constraints: ([a, b, p]) => [{ kind: 'onLine', p: p!.id, a: a!.id, b: b!.id }],
      },
      {
        id: 'angle-ref',
        name: 'Angle from direction',
        hint: 'Direction first → last picked, measured from the direction first → second',
        constraints: ([a, r, b]) => [{ kind: 'angle', a: a!.id, b: b!.id, angle: measure('angle', a!, b!, r!), ref: r!.id }],
      },
    ];
  return [];
}
