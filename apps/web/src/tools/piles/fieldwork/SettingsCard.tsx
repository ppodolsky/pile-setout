import { useTranslation } from 'react-i18next';
import { fmt } from '@/lib/format';
import { NumberInput } from '@/components/number-input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useFieldwork } from '../model/derived';
import { useProject } from '../model/store';

/** Tolerance, how set-out piles are handled, and test helpers. */
export function SettingsCard() {
  const { t } = useTranslation('fieldwork');
  const fw = useProject((s) => s.fieldwork);
  const { plan, piles } = useFieldwork();
  const { setTolerance, setParametric, fillDesignReadings, fillDemoReadings } = useProject.getState();
  const params = piles.filter((p) => p.setout === 'derive').length;
  const measuredCount = piles.length - params;
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle>{t('settings.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-4">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="tol">{t('settings.tolerance')}</Label>
          <NumberInput id="tol" className="w-24" value={fw.tolerance} min={0.5} digits={1} onValue={(v) => v != null && setTolerance(v)} />
        </div>
        {params > 0 && (
          <div className="space-y-1.5">
            <Label>{t('settings.parametric', { n: fmt(params, 0) })}</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              className="w-full"
              value={fw.parametric}
              onValueChange={(v) => v && setParametric(v as 'derived' | 'measured')}
            >
              <ToggleGroupItem value="derived" className="flex-1 text-xs">
                {t('settings.setOutAfter')}
              </ToggleGroupItem>
              <ToggleGroupItem value="measured" className="flex-1 text-xs">
                {t('settings.measure')}
              </ToggleGroupItem>
            </ToggleGroup>
            <p className="text-xs text-muted-foreground">
              {fw.parametric === 'derived'
                ? t('settings.derivedHint', { measured: fmt(measuredCount, 0), min: fmt(Math.max(0, 2 * measuredCount - 3), 0) })
                : t('settings.measuredHint', { min: fmt(Math.max(0, 2 * piles.length - 3), 0) })}
            </p>
          </div>
        )}
        <div className="flex flex-wrap gap-2 border-t pt-3">
          <Button size="sm" variant="ghost" onClick={fillDesignReadings}>
            {t('settings.fillDesign')}
          </Button>
          <Button size="sm" variant="ghost" onClick={fillDemoReadings}>
            {t('settings.demoErrors')}
          </Button>
          <span className="self-center text-xs text-muted-foreground">{t('settings.forTrying', { n: fmt(plan.measured.length, 0) })}</span>
        </div>
      </CardContent>
    </Card>
  );
}
