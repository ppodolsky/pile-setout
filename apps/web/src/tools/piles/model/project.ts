import { generatePiles, type Measurement, type ParametricMode, type PileSpec, type TemplateSpec } from '@buildkit/pile-field';

/** Design: the container template and the pile plan generated from it (and edited by hand). */
export interface DesignState {
  readonly template: TemplateSpec;
  readonly piles: readonly PileSpec[];
  /** Piles were edited by hand: template changes no longer regenerate them automatically. */
  readonly edited: boolean;
}

/** Field work: tape measurements taken on site and how the move plan is computed. */
export interface FieldworkState {
  readonly measurements: readonly Measurement[];
  /** Allowed offset of a pile from its design position, mm. */
  readonly tolerance: number;
  readonly pinned: readonly string[];
  readonly parametric: ParametricMode;
}

export interface ViewState {
  /** Arrows on the field plan are drawn this many times longer than the real offset. */
  readonly exaggeration: number;
  readonly showLines: boolean;
}

export interface ProjectData {
  readonly design: DesignState;
  readonly fieldwork: FieldworkState;
  readonly view: ViewState;
}

export const DEFAULT_TEMPLATE: TemplateSpec = { containers: ['20'], head: 200, inset: 0 };

export function newProject(): ProjectData {
  return {
    design: { template: DEFAULT_TEMPLATE, piles: generatePiles(DEFAULT_TEMPLATE), edited: false },
    fieldwork: { measurements: [], tolerance: 3, pinned: [], parametric: 'derived' },
    view: { exaggeration: 10, showLines: true },
  };
}
