import { uid } from '@/lib/id';
import {
  instantiateContainers,
  solveDocument,
  type BackgroundDrawing,
  type ContainerType,
  type Measurement,
  type ParametricMode,
  type PileDesign,
  type TemplateSpec,
} from './deps';

/** Design: background drawings (reference only, e.g. container outlines) and the pile field. */
export interface DesignState {
  readonly backgrounds: readonly BackgroundDrawing[];
  readonly doc: PileDesign;
  /** Defaults for new piles and template inserts. */
  readonly defaults: { readonly head: number; readonly inset: number };
}

/** Field work: tape measurements taken on site and how the move plan is computed. */
export interface FieldworkState {
  readonly measurements: readonly Measurement[];
  /** Allowed offset of a pile from its design position, mm. */
  readonly tolerance: number;
  readonly pinned: readonly string[];
  /** Piles marked "set out from neighbours": set out after the others, or measured too. */
  readonly parametric: ParametricMode;
  /** Piles reported as moved on site since their readings were taken. */
  readonly moved?: readonly string[];
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

/** A design made from a container combination: its outline drawing plus its pile field. */
export function designFromContainers(containers: readonly ContainerType[], piles: { head: number; inset: number }): DesignState {
  const { background, design } = instantiateContainers(containers, piles, uid('bg'));
  return { backgrounds: [background], doc: solveDocument(design).doc, defaults: piles };
}

/** Version-4 design (one container template + the pile plan) → background drawing + pile field. */
export function designFromV4(d: { template: TemplateSpec; doc?: PileDesign; edited: boolean }): DesignState {
  const generated = designFromContainers(d.template.containers, { head: d.template.head, inset: d.template.inset });
  return d.edited && d.doc ? { ...generated, doc: d.doc } : generated;
}

export function newProject(): ProjectData {
  return {
    design: designFromContainers(DEFAULT_TEMPLATE.containers, { head: DEFAULT_TEMPLATE.head, inset: DEFAULT_TEMPLATE.inset }),
    fieldwork: { measurements: [], tolerance: 3, pinned: [], parametric: 'derived' },
    view: { exaggeration: 10, showLines: true, showConstraints: true },
  };
}
