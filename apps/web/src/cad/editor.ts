import { create } from 'zustand';
import type { EntityRef } from '@buildkit/cad';

/**
 * Canvas tools. `select` picks and drags; `point` / `line` draw bare geometry; any other id is a
 * domain tool (e.g. `pile`) that places a domain element on a new point.
 */
export type CadTool = 'select' | 'point' | 'line' | (string & {});

interface CadEditorState {
  tool: CadTool;
  /** Selected points / lines in pick order (constraints use the order). */
  selection: EntityRef[];
  /** Selected constraint (clicked on the drawing or in a list). */
  constraint: string | null;
  /** Hovered entity id (point, line or a domain element), for cross-highlighting. */
  hovered: string | null;
  /** First point of a line being drawn. */
  lineStart: string | null;
  /** Short feedback (e.g. "already determined"). */
  message: string | null;
  /** Taps add to / remove from the selection (phones have no Shift key). */
  multi: boolean;
  setTool(tool: CadTool): void;
  select(refs: EntityRef[]): void;
  toggle(ref: EntityRef): void;
  selectConstraint(id: string | null): void;
  hover(id: string | null): void;
  setLineStart(id: string | null): void;
  say(message: string | null): void;
  setMulti(on: boolean): void;
}

const same = (a: EntityRef, b: EntityRef) => a.kind === b.kind && a.id === b.id;

/** UI-only editor state shared by CAD views: not saved, not part of undo. */
export const useCadEditor = create<CadEditorState>()((set) => ({
  tool: 'select',
  selection: [],
  constraint: null,
  hovered: null,
  lineStart: null,
  message: null,
  multi: false,
  setTool: (tool) => set({ tool, lineStart: null, message: null }),
  select: (selection) => set({ selection, constraint: null, message: null }),
  toggle: (ref) =>
    set((s) => ({
      selection: s.selection.some((r) => same(r, ref)) ? s.selection.filter((r) => !same(r, ref)) : [...s.selection, ref],
      constraint: null,
      message: null,
    })),
  selectConstraint: (constraint) => set({ constraint }),
  hover: (hovered) => set({ hovered }),
  setLineStart: (lineStart) => set({ lineStart }),
  say: (message) => set({ message }),
  setMulti: (multi) => set({ multi }),
}));

export const isSelected = (sel: readonly EntityRef[], ref: EntityRef) => sel.some((r) => same(r, ref));
