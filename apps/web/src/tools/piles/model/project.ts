import { generateDesign, solveDocument, type Measurement, type ParametricMode, type PileDesign, type TemplateSpec } from './deps';

/** Design: the container template and the pile plan (a CAD document whose elements are piles). */
export interface DesignState {
  readonly template: TemplateSpec;
  readonly doc: PileDesign;
  /** Edited by hand: template changes no longer regenerate the plan automatically. */
  readonly edited: boolean;
}

/** Field work: tape measurements taken on site and how the move plan is computed. */
export interface FieldworkState {
  readonly measurements: readonly Measurement[];
  /** Allowed offset of a pile from its design position, mm. */
  readonly tolerance: number;
  readonly pinned: readonly string[];
  /** Piles marked "set out from neighbours": set out after the others, or measured too. */
  readonly parametric: ParametricMode;
}

export interface ViewState {
  /** Arrows on the field plan are drawn this many times longer than the real offset. */
  readonly exaggeration: number;
  readonly showLines: boolean;
  /** Show constraint glyphs on the design drawing. */
  readonly showConstraints: boolean;
}

export interface ProjectData {
  readonly design: DesignState;
  readonly fieldwork: FieldworkState;
  readonly view: ViewState;
}

export const DEFAULT_TEMPLATE: TemplateSpec = { containers: ['20'], head: 200, inset: 0 };

export function designFromTemplate(template: TemplateSpec): DesignState {
  return { template, doc: solveDocument(generateDesign(template)).doc, edited: false };
}

export function newProject(): ProjectData {
  return {
    design: designFromTemplate(DEFAULT_TEMPLATE),
    fieldwork: { measurements: [], tolerance: 3, pinned: [], parametric: 'derived' },
    view: { exaggeration: 10, showLines: true, showConstraints: true },
  };
}
