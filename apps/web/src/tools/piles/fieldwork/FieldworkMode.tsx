import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { MeasurementsCard } from './MeasurementsCard';
import { MovePlanCard } from './MovePlanCard';
import { NextCard } from './NextCard';
import { PlanCard } from './PlanCard';
import { ResidualsCard } from './ResidualsCard';
import { SettingsCard } from './SettingsCard';
import { MeasuringStrip } from './MeasuringStrip';
import { useFieldworkUi } from './ui';

/** Field work: take the design to site — measure, see what to move, set out the rest. */
export default function FieldworkMode() {
  const { t } = useTranslation('fieldwork');
  const { tab, setTab } = useFieldworkUi();
  return (
    <div className="mx-auto max-w-[1600px] p-3 sm:p-5">
      {/* phones: switch between measuring and the plan; desktop shows both */}
      <div className="sticky top-14 z-20 -mx-3 mb-3 border-b bg-background/90 px-3 py-2 backdrop-blur lg:hidden">
        <div className="grid grid-cols-2 rounded-lg bg-muted p-1 text-sm font-medium">
          {(['measure', 'plan'] as const).map((id) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn('rounded-md py-1.5', tab === id ? 'bg-card shadow-sm' : 'text-muted-foreground')}
            >
              {t(`tabs.${id}`)}
            </button>
          ))}
        </div>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[420px_minmax(0,1fr)]">
        <aside className={cn('flex flex-col gap-4', tab !== 'measure' && 'max-lg:hidden')}>
          <MeasuringStrip />
          <NextCard />
          <MeasurementsCard />
          <SettingsCard />
          <ResidualsCard />
        </aside>
        <section className={cn('flex min-w-0 flex-col gap-4', tab !== 'plan' && 'max-lg:hidden')}>
          <PlanCard />
          <MovePlanCard />
        </section>
      </div>
    </div>
  );
}
