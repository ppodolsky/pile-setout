import { create } from 'zustand';

/** Field-work screen state (phones show one panel at a time). Not saved. */
interface FieldworkUi {
  tab: 'measure' | 'plan';
  /** Measurement whose reading is being typed (shown large on phones). */
  focused: string | null;
  setTab(tab: 'measure' | 'plan'): void;
  setFocused(id: string | null): void;
}

export const useFieldworkUi = create<FieldworkUi>()((set) => ({
  tab: 'measure',
  focused: null,
  setTab: (tab) => set({ tab }),
  setFocused: (focused) => set({ focused }),
}));
