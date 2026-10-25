import { create } from 'zustand';

/** Design-mode canvas tools: select (and drag), or place a new pile. */
export type EditorTool = 'select' | 'pile';

interface EditorState {
  tool: EditorTool;
  /** Selected piles, in the order they were picked (constraints use the order). */
  selected: string[];
  /** Selected constraint (clicked on the drawing or in the list). */
  constraint: string | null;
  hovered: string | null;
  /** Short feedback shown in the toolbar (e.g. "already determined"). */
  message: string | null;
  /** Taps add to / remove from the selection (phones have no Shift key). */
  multi: boolean;
  setMulti(on: boolean): void;
  setTool(tool: EditorTool): void;
  select(ids: string[]): void;
  toggle(id: string): void;
  selectConstraint(id: string | null): void;
  hover(id: string | null): void;
  say(message: string | null): void;
}

/** UI-only editor state: not saved, not part of undo. */
export const useEditor = create<EditorState>()((set) => ({
  tool: 'select',
  selected: [],
  constraint: null,
  hovered: null,
  message: null,
  multi: false,
  setMulti: (multi) => set({ multi }),
  setTool: (tool) => set({ tool }),
  select: (selected) => set({ selected, constraint: null, message: null }),
  toggle: (id) =>
    set((s) => ({
      selected: s.selected.includes(id) ? s.selected.filter((x) => x !== id) : [...s.selected, id],
      constraint: null,
      message: null,
    })),
  selectConstraint: (constraint) => set({ constraint }),
  hover: (hovered) => set({ hovered }),
  say: (message) => set({ message }),
}));
