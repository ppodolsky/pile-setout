import { create } from 'zustand';

/** Design-mode canvas tools. */
export type EditorTool = 'select' | 'fixed' | 'between' | 'polar';

interface EditorState {
  tool: EditorTool;
  selected: string | null;
  /** Piles picked so far by a parametric tool (e.g. the first end of "between"). */
  picks: string[];
  hovered: string | null;
  setTool(tool: EditorTool): void;
  select(id: string | null): void;
  pick(id: string): void;
  hover(id: string | null): void;
}

/** UI-only editor state: not saved, not part of undo. */
export const useEditor = create<EditorState>()((set) => ({
  tool: 'select',
  selected: null,
  picks: [],
  hovered: null,
  setTool: (tool) => set({ tool, picks: [] }),
  select: (selected) => set({ selected }),
  pick: (id) => set((s) => ({ picks: [...s.picks, id] })),
  hover: (hovered) => set({ hovered }),
}));
