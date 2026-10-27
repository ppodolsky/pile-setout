import { CircleDot, LandPlot, MousePointer2, PenLine, Redo2, SquareDashedMousePointer, Undo2 } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import { BackgroundLayer, CadCanvas, SelectionToolbar, useCadEditor, type CadTool } from '@/cad';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useBackgroundGeometry, useBackgrounds, useDesign } from '../model/derived';
import { usePileOps } from '../model/ops';
import { useProject } from '../model/store';
import { Inspector } from './Inspector';
import { PileLayer } from './PileLayer';
import { PileList } from './PileList';
import { SketchesCard } from './SketchesCard';
import { TemplatesCard } from './TemplatesCard';

/** Drawing tools; the name is `mode.tools.<id>` in the `design` namespace. */
const TOOLS = [
  { id: 'select', icon: MousePointer2, key: 'V' },
  { id: 'pile', icon: LandPlot, key: 'P' },
  { id: 'point', icon: CircleDot, key: 'O' },
  { id: 'line', icon: PenLine, key: 'L' },
] as const satisfies readonly { id: CadTool; icon: typeof LandPlot; key: string }[];

/** Key of the hint under the toolbar for the current tool and selection size. */
function hint(tool: CadTool, n: number) {
  if (tool === 'pile' || tool === 'point') return 'mode.hint.place' as const;
  if (tool === 'line') return 'mode.hint.line' as const;
  if (n === 0) return 'mode.hint.select' as const;
  return 'mode.hint.constrain' as const;
}

/** Design mode: the pile plan as a CAD drawing — points, lines, constraints, piles on points. */
export default function DesignMode() {
  const { t } = useTranslation('design');
  const model = useDesign();
  const ops = usePileOps();
  const backgrounds = useBackgrounds();
  const { reference, extent } = useBackgroundGeometry();
  const head = useProject((s) => s.design.defaults.head);
  const showConstraints = useProject((s) => s.view.showConstraints);
  const { tool, setTool, selection, select, constraint, selectConstraint, message, multi, setMulti, setLineStart } = useCadEditor();
  const { undo, redo, pastStates, futureStates } = useStore(useProject.temporal);

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
        const next = TOOLS.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
        if (next) setTool(next.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, tool, setTool, select, selection, constraint, selectConstraint, setLineStart, ops, model.doc]);

  return (
    <div className="mx-auto grid h-full max-w-[1600px] gap-4 p-3 sm:p-5 lg:grid-cols-[minmax(0,1fr)_400px]">
      <section className="flex min-h-[64vh] flex-col gap-2 lg:min-h-0">
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            variant="outline"
            value={tool}
            onValueChange={(id) => id && setTool(id)}
            aria-label={t('mode.drawingTool')}
          >
            {TOOLS.map((tl) => (
              <Tooltip key={tl.id}>
                <TooltipTrigger asChild>
                  <ToggleGroupItem value={tl.id} aria-label={t(`mode.tools.${tl.id}`)} className="px-3">
                    <tl.icon />
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent>
                  {t(`mode.tools.${tl.id}`)} <kbd className="ml-1 font-mono opacity-70">{tl.key}</kbd>
                </TooltipContent>
              </Tooltip>
            ))}
          </ToggleGroup>
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle variant="outline" pressed={multi} onPressedChange={setMulti} aria-label={t('mode.multiSelect')} className="px-3">
                <SquareDashedMousePointer />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>{t('mode.multiSelectHint')}</TooltipContent>
          </Tooltip>
          <div className="flex">
            <Button variant="ghost" size="icon" onClick={() => undo()} disabled={!pastStates.length} aria-label={t('mode.undo')}>
              <Undo2 />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => redo()} disabled={!futureStates.length} aria-label={t('mode.redo')}>
              <Redo2 />
            </Button>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={showConstraints} onCheckedChange={(v) => useProject.getState().setView({ showConstraints: v })} />{' '}
            {t('mode.showConstraints')}
          </label>
          <SelectionToolbar model={model} ops={ops} />
        </div>
        <p className="text-xs text-muted-foreground">{message ?? t(hint(tool, selection.length))}</p>
        <div className="min-h-0 flex-1 rounded-xl border bg-card p-1 shadow-sm">
          <CadCanvas
            label={t('mode.canvas')}
            model={model}
            ops={ops}
            extent={extent}
            showConstraints={showConstraints}
            ghostSize={head}
            background={<BackgroundLayer drawings={backgrounds} />}
            reference={reference}
            elements={<PileLayer />}
          />
        </div>
      </section>
      <aside className="flex flex-col gap-4 lg:overflow-y-auto lg:pb-4">
        <Inspector ops={ops} />
        <SketchesCard />
        <TemplatesCard />
        <PileList />
      </aside>
    </div>
  );
}
