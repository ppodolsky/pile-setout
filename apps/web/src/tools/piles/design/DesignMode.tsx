import { CirclePlus, MousePointer2, Redo2, SquareDashedMousePointer, Undo2 } from 'lucide-react';
import { useEffect } from 'react';
import { useStore } from 'zustand';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { selectionActions } from '../model/actions';
import { useDesign } from '../model/derived';
import { useEditor, type EditorTool } from '../model/editor';
import { useProject } from '../model/store';
import { DesignCanvas } from './DesignCanvas';
import { Inspector } from './Inspector';
import { ACTION_ICON } from './meta';
import { PileList } from './PileList';
import { TemplateCard } from './TemplateCard';

const TOOLS: { id: EditorTool; name: string; icon: typeof CirclePlus; key: string }[] = [
  { id: 'select', name: 'Select & move', icon: MousePointer2, key: 'V' },
  { id: 'pile', name: 'New pile', icon: CirclePlus, key: 'P' },
];

/** Constraint buttons for the current selection (1, 2 or 3 piles). */
function SelectionActions() {
  const { piles } = useDesign();
  const { selected, select, say } = useEditor();
  const sel = selected.map((id) => piles.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p);
  const actions = selectionActions(sel.length);
  if (!actions.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {actions.map((a) => {
        const Icon = ACTION_ICON[a.id] ?? CirclePlus;
        return (
          <Tooltip key={a.id}>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 px-2.5 text-xs"
                onClick={() => {
                  const store = useProject.getState();
                  if (a.newPile) {
                    const { at, constraints } = a.newPile(sel);
                    select([store.addPileWith(at, constraints)]);
                    return;
                  }
                  const { added, redundant } = store.addConstraints(a.constraints!(sel));
                  say(
                    !added.length
                      ? 'Nothing added — the selection is already determined by other constraints.'
                      : redundant
                        ? `Added ${added.length}; ${redundant} already determined by other constraints.`
                        : null,
                  );
                }}
              >
                <Icon className="size-3.5" />
                {a.name}
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-60">{a.hint}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

function hint(tool: EditorTool, n: number): string {
  if (tool === 'pile')
    return 'Click on the plan to place a pile (snaps to 5 mm and to other piles’ axes). It is free until you constrain it.';
  if (n === 0)
    return 'Click a pile; Shift-click or drag a box to select more. Pan: right/middle-drag, Space+drag or touch; zoom: wheel or pinch.';
  if (n === 1) return 'One pile: fix it, add a pile at distance + angle, or Shift-click more piles.';
  if (n === 2) return 'Two piles: constrain them (measured as they are now), or add a pile in the middle.';
  if (n === 3) return 'Three piles: the last picked goes on the line of the first two.';
  return `${n} piles selected — delete them, or select up to three to constrain.`;
}

/** Design mode: the pile plan as a CAD sketch — piles plus geometric constraints. */
export default function DesignMode() {
  const { tool, setTool, selected, select, constraint, selectConstraint, message, multi, setMulti } = useEditor();
  const { undo, redo, pastStates, futureStates } = useStore(useProject.temporal);
  const showConstraints = useProject((s) => s.view.showConstraints);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y' && !typing) {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'a' && !typing) {
        e.preventDefault();
        select(useProject.getState().design.piles.map((p) => p.id));
        return;
      }
      if (typing || mod) return;
      if (e.key === 'Escape') {
        setTool('select');
        select([]);
        selectConstraint(null);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selected.length) {
          useProject.getState().deletePiles(selected);
          select([]);
        } else if (constraint) {
          useProject.getState().deleteConstraint(constraint);
          selectConstraint(null);
        }
      } else {
        const t = TOOLS.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
        if (t) setTool(t.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, setTool, select, selected, constraint, selectConstraint]);

  return (
    <div className="mx-auto grid h-full max-w-[1600px] gap-4 p-3 sm:p-5 lg:grid-cols-[minmax(0,1fr)_400px]">
      <section className="flex min-h-[64vh] flex-col gap-2 lg:min-h-0">
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            variant="outline"
            value={tool}
            onValueChange={(t) => t && setTool(t as EditorTool)}
            aria-label="Drawing tool"
          >
            {TOOLS.map((t) => (
              <Tooltip key={t.id}>
                <TooltipTrigger asChild>
                  <ToggleGroupItem value={t.id} aria-label={t.name} className="px-3">
                    <t.icon />
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent>
                  {t.name} <kbd className="ml-1 font-mono opacity-70">{t.key}</kbd>
                </TooltipContent>
              </Tooltip>
            ))}
          </ToggleGroup>
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle variant="outline" pressed={multi} onPressedChange={setMulti} aria-label="Multi-select" className="px-3">
                <SquareDashedMousePointer />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>Multi-select: taps add or remove piles (same as Shift-click)</TooltipContent>
          </Tooltip>
          <div className="flex">
            <Button variant="ghost" size="icon" onClick={() => undo()} disabled={!pastStates.length} aria-label="Undo">
              <Undo2 />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => redo()} disabled={!futureStates.length} aria-label="Redo">
              <Redo2 />
            </Button>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={showConstraints} onCheckedChange={(v) => useProject.getState().setView({ showConstraints: v })} /> constraints
          </label>
          <SelectionActions />
        </div>
        <p className="text-xs text-muted-foreground">{message ?? hint(tool, selected.length)}</p>
        <div className="min-h-0 flex-1 rounded-xl border bg-card p-1 shadow-sm">
          <DesignCanvas />
        </div>
      </section>
      <aside className="flex flex-col gap-4 lg:overflow-y-auto lg:pb-4">
        <Inspector />
        <TemplateCard />
        <PileList />
      </aside>
    </div>
  );
}
