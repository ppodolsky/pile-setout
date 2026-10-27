import { ChevronDown, Eye, EyeOff, LandPlot, Lock, LockOpen, Square, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BackgroundDrawing } from '@buildkit/cad';
import { Field, FieldRow } from '@/components/field';
import { NumberInput } from '@/components/number-input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useDesign } from '../model/derived';
import { useProject } from '../model/store';

function BackgroundRow({ d }: { d: BackgroundDrawing }) {
  const { t } = useTranslation('design');
  const [open, setOpen] = useState(false);
  const { updateBackground, removeBackground } = useProject.getState();
  const icon = (label: string, onClick: () => void, children: React.ReactNode) => (
    <Button size="icon" variant="ghost" className="size-7" aria-label={label} title={label} onClick={onClick}>
      {children}
    </Button>
  );
  return (
    <li className="py-1.5">
      <div className="flex items-center gap-1.5">
        <Square className={cn('size-3.5 shrink-0 text-muted-foreground', !d.visible && 'opacity-40')} />
        <button
          className="flex min-w-0 flex-1 items-center gap-1 text-left text-sm"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={t('sketches.edit', { name: d.name })}
        >
          <span className={cn('truncate', !d.visible && 'text-muted-foreground')}>{d.name}</span>
          <ChevronDown className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
        </button>
        {icon(
          d.visible ? t('sketches.hide', { name: d.name }) : t('sketches.show', { name: d.name }),
          () => updateBackground(d.id, { visible: !d.visible }),
          d.visible ? <Eye /> : <EyeOff />,
        )}
        {icon(
          d.locked ? t('sketches.unlock', { name: d.name }) : t('sketches.lock', { name: d.name }),
          () => updateBackground(d.id, { locked: !d.locked }),
          d.locked ? <Lock /> : <LockOpen />,
        )}
        {icon(t('sketches.remove', { name: d.name }), () => removeBackground(d.id), <Trash2 />)}
      </div>
      {open && (
        <div className="mt-2 space-y-2 pl-5">
          <Field label={t('sketches.name')}>
            <Input value={d.name} onChange={(e) => updateBackground(d.id, { name: e.target.value })} />
          </Field>
          <FieldRow cols={3}>
            <Field label={t('sketches.x')}>
              <NumberInput
                value={d.offset.x}
                disabled={d.locked}
                onValue={(x) => x != null && updateBackground(d.id, { offset: { ...d.offset, x } })}
              />
            </Field>
            <Field label={t('sketches.y')}>
              <NumberInput
                value={d.offset.y}
                disabled={d.locked}
                onValue={(y) => y != null && updateBackground(d.id, { offset: { ...d.offset, y } })}
              />
            </Field>
            <Field label={t('sketches.rotation')}>
              <NumberInput
                value={d.rotation}
                disabled={d.locked}
                digits={3}
                onValue={(r) => r != null && updateBackground(d.id, { rotation: r })}
              />
            </Field>
          </FieldRow>
        </div>
      )}
    </li>
  );
}

/** The design's sketches: the pile field and background drawings (show / lock / place / remove). */
export function SketchesCard() {
  const { t } = useTranslation('design');
  const { piles } = useDesign();
  const backgrounds = useProject((s) => s.design.backgrounds);
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle>{t('sketches.title')}</CardTitle>
        <CardDescription>{t('sketches.description')}</CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        <ul className="divide-y">
          <li className="flex items-center gap-1.5 py-1.5 text-sm">
            <LandPlot className="size-3.5 text-primary" />
            <span className="flex-1 font-medium">{t('sketches.pileField')}</span>
            <span className="text-xs text-muted-foreground">{t('sketches.piles', { count: piles.length })}</span>
          </li>
          {backgrounds.map((d) => (
            <BackgroundRow key={d.id} d={d} />
          ))}
        </ul>
        {!backgrounds.length && <p className="mt-2 text-xs text-muted-foreground">{t('sketches.none')}</p>}
      </CardContent>
    </Card>
  );
}
