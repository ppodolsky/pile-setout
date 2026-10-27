import { Plus, RefreshCw, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CONTAINER_TYPES, CONTAINERS, HEAD_RANGE, INSET_RANGE } from '@buildkit/pile-field';
import { NumberInput } from '@/components/number-input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ConfirmButton } from '../ui/ConfirmButton';
import { useProject } from '../model/store';

/** Container template: which containers, pile head and inset — generates the pile design. */
export function TemplateCard() {
  const { t } = useTranslation('design');
  const template = useProject((s) => s.design.template);
  const edited = useProject((s) => s.design.edited);
  const { setTemplate, regenerate } = useProject.getState();
  const containers = template.containers;

  return (
    <Card className="gap-4 py-4">
      <CardHeader className="px-4">
        <CardTitle>{t('template.title')}</CardTitle>
        <CardDescription>{t('template.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {containers.map((ct, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-full border bg-secondary py-0.5 pr-1 pl-2.5 text-sm font-medium"
            >
              {CONTAINERS[ct].label}
              <button
                className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-destructive disabled:opacity-40"
                disabled={containers.length === 1}
                aria-label={t('template.remove', { label: CONTAINERS[ct].label })}
                onClick={() => setTemplate({ containers: containers.filter((_, k) => k !== i) })}
              >
                <X className="size-3.5" />
              </button>
            </span>
          ))}
          {CONTAINER_TYPES.map((ct) => (
            <Button
              key={ct}
              size="sm"
              variant="outline"
              className="h-7 border-dashed px-2"
              onClick={() => setTemplate({ containers: [...containers, ct] })}
            >
              <Plus className="size-3.5" />
              {CONTAINERS[ct].label}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="head">{t('template.head')}</Label>
            <NumberInput
              id="head"
              value={template.head}
              min={HEAD_RANGE[0]}
              max={HEAD_RANGE[1]}
              onValue={(v) => v != null && setTemplate({ head: v })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inset">{t('template.inset')}</Label>
            <NumberInput
              id="inset"
              value={template.inset}
              min={INSET_RANGE[0]}
              max={INSET_RANGE[1]}
              onValue={(v) => v != null && setTemplate({ inset: v })}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t('template.insetHelp')}</p>
        {edited && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-dashed p-2.5 text-xs text-muted-foreground">
            <span>{t('template.edited')}</span>
            <ConfirmButton
              size="sm"
              variant="outline"
              title={t('template.regenerateTitle')}
              description={t('template.regenerateDescription')}
              confirm={t('template.regenerate')}
              onConfirm={regenerate}
            >
              <RefreshCw className="size-3.5" /> {t('template.regenerate')}
            </ConfirmButton>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
