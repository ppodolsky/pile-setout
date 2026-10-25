import { CircleDot, LandPlot, MousePointer2, PenLine, Redo2, SquareDashedMousePointer, Undo2 } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useStore } from 'zustand';
import { CadCanvas, SelectionToolbar, useCadEditor, type CadTool } from '@/cad';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Containers } from '../drawing/layers';
import { useDesign, useOutlines } from '../model/derived';
import { usePileOps } from '../model/ops';
import { useProject } from '../model/store';
import { Inspector } from './Inspector';
import { PileLayer } from './PileLayer';
import { PileList } from './PileList';
import { TemplateCard } from './TemplateCard';

const TOOLS: { id: CadTool; name: string; icon: typeof LandPlot; key: string }[] = [
  { id: 'select', name: 'Select & move', icon: MousePointer2, key: 'V' },
  { id: 'pile', name: 'New pile', icon: LandPlot, key: 'P' },
  { id: 'point', name: 'New point', icon: CircleDot, key: 'O' },
  { id: 'line', name: 'Line (string line / axis)', icon: PenLine, key: 'L' },
];

function hint(tool: CadTool, n: number): string {
  if (tool === 'pile' || tool === 'point')
    return 'Click to place. It snaps to points, midpoints, other piles’ axes, round angles from the selected pile (90° is stickiest) and round distances — and keeps those relations as constraints.';
  if (tool === 'line') return 'Click points (or empty space) one after another to draw a line; Esc to finish.';
  if (n === 0)
    return 'Click to select; Shift-click / box / multi-select for more. Drag to move — dimensions follow. Pan: right-drag, Space+drag or touch; zoom: wheel or pinch.';
  return 'Constrain the selection with the buttons above (in pick order), or drag to move.';
}

/** Design mode: the pile plan as a CAD drawing — points, lines, constraints, piles on points. */
export default function DesignMode() {
  const model = useDesign();
  const ops = usePileOps();
  const outlines = useOutlines();
  const head = useProject((s) => s.design.template.head);
  const showConstraints = useProject((s) => s.view.showConstraints);
  const { tool, setTool, selection, select, constraint, selectConstraint, message, multi, setMulti, setLineStart } = useCadEditor();
  const { undo, redo, pastStates, futureStates } = useStore(useProject.temporal);
  const extent = useMemo(
    () =>
      outlines.flatMap((o) => [
        { x: o.x0, y: 0 },
        { x: o.x0 + o.length, y: o.width },
      ]),
    [outlines],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement;
      const mod = e.metaKey || e.ctrlKey;
      if (typing) return;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      } else if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        select(model.doc.points.map((p) => ({ kind: 'point' as const, id: p.id })));
      } else if (mod) return;
      else if (e.key === 'Escape') {
        // first Esc stops the line being drawn, the next one returns to Select
        if (tool === 'line' && useCadEditor.getState().lineStart) setLineStart(null);
        else setTool('select');
        select([]);
        selectConstraint(null);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selection.length) {
          const points = selection.filter((r) => r.kind === 'point').map((r) => r.id);
          ops.remove({
            points,
            lines: selection.filter((r) => r.kind === 'line').map((r) => r.id),
            elements: model.doc.elements.filter((x) => points.includes(x.point)).map((x) => x.id),
          });
          select([]);
        } else if (constraint) {
          ops.remove({ constraints: [constraint] });
          selectConstraint(null);
        }
      } else {
        const t = TOOLS.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
        if (t) setTool(t.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, tool, setTool, select, selection, constraint, selectConstraint, setLineStart, ops, model.doc]);

  return (
    <div className="mx-auto grid h-full max-w-[1600px] gap-4 p-3 sm:p-5 lg:grid-cols-[minmax(0,1fr)_400px]">
      <section className="flex min-h-[64vh] flex-col gap-2 lg:min-h-0">
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup type="single" variant="outline" value={tool} onValueChange={(t) => t && setTool(t)} aria-label="Drawing tool">
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
            <TooltipContent>Multi-select: taps add or remove (same as Shift-click)</TooltipContent>
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
          <SelectionToolbar model={model} ops={ops} />
        </div>
        <p className="text-xs text-muted-foreground">{message ?? hint(tool, selection.length)}</p>
        <div className="min-h-0 flex-1 rounded-xl border bg-card p-1 shadow-sm">
          <CadCanvas
            label="Pile design"
            model={model}
            ops={ops}
            extent={extent}
            showConstraints={showConstraints}
            ghostSize={head}
            background={<Containers outlines={outlines} />}
            elements={<PileLayer />}
          />
        </div>
      </section>
      <aside className="flex flex-col gap-4 lg:overflow-y-auto lg:pb-4">
        <Inspector ops={ops} />
        <TemplateCard />
        <PileList />
      </aside>
    </div>
  );
}
