/** design strings (English — the source): Design mode of the pile tool. */
export const design = {
  /** DesignMode: toolbar, hints, canvas. */
  mode: {
    tools: {
      select: 'Select & move',
      pile: 'New pile',
      point: 'New point',
      line: 'Line (string line / axis)',
    },
    drawingTool: 'Drawing tool',
    multiSelect: 'Multi-select',
    multiSelectHint: 'Multi-select: taps add or remove (same as Shift-click)',
    undo: 'Undo',
    redo: 'Redo',
    showConstraints: 'constraints',
    canvas: 'Pile design',
    hint: {
      place:
        'Click to place. It snaps to points, midpoints, other piles’ axes, round angles from the selected pile (90° is stickiest) and round distances — and keeps those relations as constraints.',
      line: 'Click points (or empty space) one after another to draw a line; Esc to finish.',
      select:
        'Click to select; Shift-click / box / multi-select for more. Drag to move — dimensions follow. Pan: right-drag, Space+drag or touch; zoom: wheel or pinch.',
      constrain: 'Constrain the selection with the buttons above (in pick order), or drag to move.',
    },
  },
  /** Inspector: properties of the selection or of a constraint. */
  inspector: {
    constraint: 'Constraint',
    plan: 'Plan',
    conflicting_one: '{{count}} conflicting',
    conflicting_other: '{{count}} conflicting',
    fullyConstrained: 'fully constrained',
    free_one: '{{count}} free',
    free_other: '{{count}} free',
    planHelp:
      'Click a pile, point or line to select it — Shift-click or drag a box for more, then constrain from the toolbar. Drag to move: dimensions follow. Click a value on the drawing to edit it. Blue = can still move; black = fully constrained.',
    pile: 'Pile {{label}}',
    point: 'Point',
    line: 'Line',
    selected: '{{n}} selected',
    sharedJoint: 'shared joint',
    canStillMove: 'can still move',
    pickedOrder: 'Picked in this order: {{list}}',
    pointItem: 'point',
    lineItem: 'line',
    label: 'Label',
    x: 'X, mm',
    y: 'Y, mm',
    head: 'Head, mm',
    diameter: 'Diameter, mm',
    depth: 'Depth, mm',
    inFieldWork: 'In field work',
    measure: 'Measure it',
    derive: 'Set out from neighbours',
    putPile: 'Put a pile on this point',
    constraints_one: '{{count}} constraint',
    constraints_other: '{{count}} constraints',
    constraintsBetween_one: '{{count}} constraint between them',
    constraintsBetween_other: '{{count}} constraints between them',
    noConstraints: 'None yet — use the toolbar above the drawing.',
    deletePile: 'Delete pile',
    deletePoint: 'Delete point',
    deleteLine: 'Delete line',
    deleteItems_one: 'Delete {{count}} item',
    deleteItems_other: 'Delete {{count}} items',
  },
  /** PileList: all piles. */
  list: {
    title: 'Piles ({{n}})',
    derive: 'set out from neighbours',
    measure: 'measured',
  },
  /** TemplateCard: the container template that generates the design. */
  template: {
    title: 'Container template',
    description:
      'Containers joined end to end. Generates a fully constrained sketch: each joint on one shared pile, intermediate supports set out from their corners.',
    remove: 'Remove {{label}}',
    head: 'Pile head (square), mm',
    inset: 'Inset, mm',
    insetHelp:
      'Inset: container outer edge (string line) → outer side of the head. 0 = head flush with the edge, so corner piles are inset + head/2 from the edges.',
    edited: 'Piles were edited by hand — template changes don’t replace them.',
    regenerateTitle: 'Regenerate piles from the template?',
    regenerateDescription: 'Your hand-made piles and edits are replaced. Measurements of piles that no longer exist are removed.',
    regenerate: 'Regenerate',
  },
  /** Drawing layers (tooltips). */
  layers: {
    casting: 'Container corner casting (178 × 162)',
    pocket: 'Forklift pocket (schematic)',
  },
} as const;
