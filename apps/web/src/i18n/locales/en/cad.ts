/** cad strings (English — the source): the generic CAD editor. */
export const cad = {
  /** Constraint display names, by constraint kind. */
  constraints: {
    fix: 'Fixed',
    distance: 'Distance',
    dx: 'ΔX',
    dy: 'ΔY',
    horizontal: 'Horizontal',
    vertical: 'Vertical',
    angle: 'Angle',
    ratio: 'On line at ratio',
    onLine: 'On line',
    coincident: 'Coincident',
    parallel: 'Parallel',
    perpendicular: 'Perpendicular',
    equal: 'Equal length',
  },
  /** What a constraint ties ("C1 → C3", "C2 on C1–C3", …). */
  subject: {
    fix: '{{p}} at {{x}}, {{y}}',
    onLine: '{{p}} on {{a}}–{{b}}',
    angleFrom: '{{a}} → {{b}} from →{{ref}}',
    pair: '{{a}}–{{b}} & {{c}}–{{d}}',
  },
  /** Selection actions (from `selectionActions()`), by action id. */
  actions: {
    fix: { name: 'Fix', hint: 'Pin this point where it is' },
    'polar-point': {
      name: 'New at distance + angle',
      hint: 'A new point 1000 mm from this one at 0°; edit the values in the inspector',
    },
    distance: { name: 'Distance', hint: 'Keep the distance between the two' },
    'distance-angle': {
      name: 'Distance + angle',
      hint: 'Second at a distance and direction from the first (angle from the X axis)',
    },
    horizontal: { name: 'Horizontal', hint: 'Same Y' },
    vertical: { name: 'Vertical', hint: 'Same X' },
    dx: { name: 'ΔX', hint: 'Keep the distance along X' },
    dy: { name: 'ΔY', hint: 'Keep the distance along Y' },
    coincident: { name: 'Coincident', hint: 'Same place' },
    'mid-point': { name: 'New in the middle', hint: 'A new point at the midpoint of the two' },
    midpoint: { name: 'Midpoint', hint: 'Last picked in the middle of the first two' },
    ratio: { name: 'On line at ratio', hint: 'Last picked on the line of the first two, at its current fraction' },
    online: { name: 'On line', hint: 'Last picked on the line through the first two' },
    'angle-ref': {
      name: 'Angle from direction',
      hint: 'Direction first → last picked, measured from the direction first → second',
    },
    'line-horizontal': { name: 'Horizontal', hint: 'Line along X' },
    'line-vertical': { name: 'Vertical', hint: 'Line along Y' },
    length: { name: 'Length', hint: 'Keep the line’s length' },
    'line-mid-point': { name: 'New in the middle', hint: 'A new point at the line’s midpoint' },
    parallel: { name: 'Parallel', hint: 'The two lines parallel' },
    perpendicular: { name: 'Perpendicular', hint: 'The two lines at 90°' },
    equal: { name: 'Equal length', hint: 'The two lines the same length' },
    'on-line': { name: 'On line', hint: 'Point on the line' },
    'line-midpoint': { name: 'Midpoint', hint: 'Point in the middle of the line' },
  },
  /** Feedback after adding constraints from the toolbar. */
  added: {
    nothing: 'Nothing added — already determined by other constraints.',
    someRedundant: 'Added {{added}}; {{redundant}} already determined by other constraints.',
  },
  /** One constraint in a list (ConstraintRow). */
  row: {
    delete: 'Delete {{name}} constraint',
    value: '{{name}} value',
    ratioHint: '(0 = first, 1 = second, 0.5 = middle)',
    fixedX: 'Fixed X',
    fixedY: 'Fixed Y',
    angleFrom: 'Angle measured from',
    fromXAxis: 'from the X axis',
    fromDirection: 'from direction {{a}} → {{b}}',
  },
  /** Snap readouts on the canvas. */
  snap: {
    midpoint: 'midpoint',
    onLine: 'on line',
  },
  /** Constraint marks on the drawing. */
  glyph: {
    horizontal: 'H',
    vertical: 'V',
    onLine: 'on line',
  },
  /** A point's coordinates, x and y. */
  coords: '{{x}}, {{y}}',
  background: {
    titles: { Container: 'Container', 'Corner casting': 'Corner casting (178 × 162)', 'Forklift pocket': 'Forklift pocket (schematic)' },
  },
} as const;
