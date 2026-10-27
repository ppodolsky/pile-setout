import { BookmarkPlus, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { containerShapes, HEAD_RANGE, INSET_RANGE } from '@buildkit/pile-field';
import { bounds } from '@buildkit/geometry';
import { useAuth } from '@/app/backend/auth';
import { Field, FieldRow } from '@/components/field';
import { NumberInput } from '@/components/number-input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useCadEditor } from '@/cad';
import { useProject } from '../model/store';
import { builtInTemplates, deleteTemplate, instantiate, saveAsTemplate, userTemplates, type TemplateEntry } from '../model/templates';

/** A tiny outline preview of a container template. */
function Preview({ entry }: { entry: TemplateEntry }) {
  if (entry.kind !== 'builtin') return <span className="block h-6 w-16 rounded-sm border border-dashed" />;
  const outlines = containerShapes(entry.containers).filter((s) => s.kind === 'rect' && s.style === 'outline');
  const b = bounds(
    outlines.flatMap((s) =>
      s.kind === 'rect'
        ? [
            { x: s.x, y: s.y },
            { x: s.x + s.w, y: s.y + s.h },
          ]
        : [],
    ),
  );
  // at most 64 px long and 14 px high, so every template reads as the same kind of strip
  const k = Math.min(64 / Math.max(b.maxX - b.minX, 1), 14 / Math.max(b.maxY - b.minY, 1));
  const H = Math.max(6, (b.maxY - b.minY) * k);
  return (
    <svg width={64} height={H} viewBox={`0 0 64 ${H}`} aria-hidden className="shrink-0">
      {outlines.map((s, i) =>
        s.kind === 'rect' ? (
          <rect
            key={i}
            x={(s.x - b.minX) * k + 0.5}
            y={0.5}
            width={s.w * k - 1}
            height={H - 1}
            fill="var(--draw-container)"
            stroke="var(--draw-container-stroke)"
          />
        ) : null,
      )}
    </svg>
  );
}

/** Library of design templates: built-in containers and the user's own; use one or add it alongside. */
export function TemplatesCard() {
  const { t } = useTranslation(['design', 'common']);
  const defaults = useProject((s) => s.design.defaults);
  const account = useAuth((s) => s.account);
  const [mine, setMine] = useState<TemplateEntry[]>([]);
  const [pending, setPending] = useState<{ entry: TemplateEntry; mode: 'use' | 'add' } | null>(null);
  const [piles, setPiles] = useState(defaults);
  const [saveName, setSaveName] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const refresh = async () => setMine(await userTemplates());
  useEffect(() => {
    void refresh();
  }, [account]);

  const run = async (entry: TemplateEntry, mode: 'use' | 'add', params = piles) => {
    const content = await instantiate(entry, params);
    if (!content) return;
    const store = useProject.getState();
    if (mode === 'use') store.useTemplate(content, entry.kind === 'builtin' ? params : defaults);
    else store.addTemplate(content);
    if (entry.kind === 'builtin') store.setDefaults(params);
    useCadEditor.getState().select([]);
    setPending(null);
  };
  const row = (entry: TemplateEntry) => (
    <li key={entry.id} className="flex items-center gap-2 py-1.5">
      <Preview entry={entry} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{entry.name}</span>
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2 text-xs"
        aria-label={t('templates.useName', { name: entry.name })}
        onClick={() => (setPiles(defaults), setPending({ entry, mode: 'use' }))}
      >
        {t('templates.use')}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs"
        aria-label={t('templates.addName', { name: entry.name })}
        onClick={() => (entry.kind === 'builtin' ? (setPiles(defaults), setPending({ entry, mode: 'add' })) : void run(entry, 'add'))}
      >
        <Plus className="size-3.5" /> {t('templates.add')}
      </Button>
      {entry.kind === 'user' && (
        <Button
          size="icon"
          variant="ghost"
          className="size-7 text-muted-foreground hover:text-destructive"
          aria-label={t('templates.delete', { name: entry.name })}
          onClick={async () => {
            if (!confirm(t('templates.deleteConfirm', { name: entry.name }))) return;
            await deleteTemplate(entry.id);
            await refresh();
          }}
        >
          <Trash2 />
        </Button>
      )}
    </li>
  );

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle>{t('templates.title')}</CardTitle>
        <CardDescription>{t('templates.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-4">
        <div>
          <div className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{t('templates.builtIn')}</div>
          <ul className="divide-y">{builtInTemplates().map(row)}</ul>
        </div>
        <div>
          <div className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{t('templates.mine')}</div>
          {mine.length ? (
            <ul className="divide-y">{mine.map(row)}</ul>
          ) : (
            <p className="text-xs text-muted-foreground">{t('templates.empty')}</p>
          )}
        </div>
        <form
          className="flex gap-2 border-t pt-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!saveName.trim()) return;
            await saveAsTemplate(saveName.trim());
            setNote(t('templates.saved', { name: saveName.trim() }));
            setSaveName('');
            await refresh();
          }}
        >
          <Input
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder={t('templates.saveName')}
            aria-label={t('templates.saveName')}
            className="h-8"
          />
          <Button size="sm" type="submit" variant="outline" disabled={!saveName.trim()} title={t('templates.saveAs')}>
            <BookmarkPlus /> {t('templates.save')}
          </Button>
        </form>
        {note && <p className="text-xs text-ok">{note}</p>}
      </CardContent>

      <Dialog open={!!pending} onOpenChange={(v) => !v && setPending(null)}>
        <DialogContent className="sm:max-w-sm">
          {pending && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {t(pending.mode === 'use' ? 'templates.useTitle' : 'templates.addTitle', { name: pending.entry.name })}
                </DialogTitle>
                <DialogDescription>{pending.mode === 'use' ? t('templates.useWarning') : t('templates.addHint')}</DialogDescription>
              </DialogHeader>
              {pending.entry.kind === 'builtin' && (
                <>
                  <FieldRow cols={2}>
                    <Field label={t('templates.head')} htmlFor="tpl-head">
                      <NumberInput
                        id="tpl-head"
                        value={piles.head}
                        min={HEAD_RANGE[0]}
                        max={HEAD_RANGE[1]}
                        onValue={(v) => v != null && setPiles({ ...piles, head: v })}
                      />
                    </Field>
                    <Field label={t('templates.inset')} htmlFor="tpl-inset">
                      <NumberInput
                        id="tpl-inset"
                        value={piles.inset}
                        min={INSET_RANGE[0]}
                        max={INSET_RANGE[1]}
                        onValue={(v) => v != null && setPiles({ ...piles, inset: v })}
                      />
                    </Field>
                  </FieldRow>
                  <p className="text-xs text-muted-foreground">{t('templates.insetHelp')}</p>
                </>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setPending(null)}>
                  {t('common:cancel')}
                </Button>
                <Button onClick={() => void run(pending.entry, pending.mode)}>
                  {pending.mode === 'use' ? t('templates.use') : t('templates.add')}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
