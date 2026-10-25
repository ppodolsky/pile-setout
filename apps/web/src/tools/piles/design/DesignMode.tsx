import { GitCommitHorizontal, MousePointer2, Pin, Redo2, Undo2, Waypoints } from 'lucide-react';
import { useEffect } from 'react';
import { useStore } from 'zustand';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useEditor, type EditorTool } from '../model/editor';
import { useProject } from '../model/store';
import { DesignCanvas } from './DesignCanvas';
import { Inspector } from './Inspector';
import { PileList } from './PileList';
import { TemplateCard } from './TemplateCard';

const TOOLS: { id: EditorTool; name: string; icon: typeof Pin; key: string }[] = [
  { id: 'select', name: 'Select & move', icon: MousePointer2, key: 'V' },
  { id: 'fixed', name: 'Fixed pile', icon: Pin, key: 'F' },
  { id: 'between', name: 'Pile between two piles', icon: GitCommitHorizontal, key: 'B' },
  { id: 'polar', name: 'Pile at distance + angle', icon: Waypoints, key: 'A' },
];

function hint(tool: EditorTool, picks: number): string {
  if (tool === 'fixed') return 'Click on the plan to place a fixed pile (snaps to 5 mm and to other piles’ axes).';
  if (tool === 'between') return picks ? 'Pick the second pile.' : 'Pick the first pile.';
  if (tool === 'polar') return 'Pick the base pile; then set distance and angle in the inspector.';
  return 'Click a pile to select it; drag a selected fixed pile to move it. Drag empty space to pan, scroll or pinch to zoom.';
}

/** Design mode: the pile plan as a CAD drawing with an inspector. */
export default function DesignMode() {
  const { tool, picks, setTool, selected, select } = useEditor();
  const { undo, redo, pastStates, futureStates } = useStore(useProject.temporal);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (typing || mod) return;
      if (e.key === 'Escape') {
        setTool('select');
        select(null);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        useProject.getState().deletePile(selected);
        select(null);
      } else {
        const t = TOOLS.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
        if (t) setTool(t.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, setTool, select, selected]);

  return (
    <div className="mx-auto grid h-full max-w-[1600px] gap-4 p-3 sm:p-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="flex min-h-[60vh] flex-col gap-2 lg:min-h-0">
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
          <div className="flex">
            <Button variant="ghost" size="icon" onClick={() => undo()} disabled={!pastStates.length} aria-label="Undo">
              <Undo2 />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => redo()} disabled={!futureStates.length} aria-label="Redo">
              <Redo2 />
            </Button>
          </div>
          <p className="min-w-0 basis-full text-xs text-muted-foreground sm:flex-1 sm:basis-auto">{hint(tool, picks.length)}</p>
        </div>
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
