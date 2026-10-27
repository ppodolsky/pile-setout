import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { fmt, sfmt } from '@/lib/format';
import { cn } from '@/lib/utils';
import { pileLabel, useFieldwork } from '../model/derived';
import { useProject } from '../model/store';

/** Measured (corrected) vs design distance for every used reading. */
export function ResidualsCard() {
  const { t } = useTranslation('fieldwork');
  const { plan, piles } = useFieldwork();
  const tol = useProject((s) => s.fieldwork.tolerance);
  if (plan.status === 'empty') return null;
  const rows = plan.adjustment.residuals;
  return (
    <Card className="py-3">
      <Collapsible>
        <CollapsibleTrigger className="group flex w-full items-center justify-between px-4 text-sm font-semibold">
          {t('residuals.title', { n: fmt(rows.length, 0) })}
          <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="px-4 pt-3">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="py-1 font-medium">{t('residuals.pair')}</th>
                  <th className="font-medium">{t('residuals.design')}</th>
                  <th className="font-medium">{t('residuals.measured')}</th>
                  <th className="text-right font-medium">Δ</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {rows.map((r) => {
                  const d = r.observed - r.design;
                  return (
                    <tr key={r.ref ?? `${r.a}${r.b}`} className="border-t">
                      <td className="py-1.5 font-sans font-semibold">
                        {pileLabel(piles, r.a)}–{pileLabel(piles, r.b)}
                      </td>
                      <td>{fmt(r.design)}</td>
                      <td>{fmt(r.observed)}</td>
                      <td className={cn('text-right', Math.abs(d) <= tol ? 'text-ok' : Math.abs(d) <= 3 * tol ? 'text-warn' : 'text-err')}>
                        {sfmt(d)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted-foreground">{t('residuals.footnote')}</p>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
