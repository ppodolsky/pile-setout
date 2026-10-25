import { NumberInput } from '@/components/number-input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useFieldwork } from '../model/derived';
import { useProject } from '../model/store';

/** Tolerance, how parametric piles are handled, and test helpers. */
export function SettingsCard() {
  const fw = useProject((s) => s.fieldwork);
  const { plan, piles } = useFieldwork();
  const { setTolerance, setParametric, fillDesignReadings, fillDemoReadings } = useProject.getState();
  const params = piles.filter((p) => p.def.kind !== 'fixed').length;
  const fixed = piles.length - params;
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <CardTitle>Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-4">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="tol">Tolerance, mm</Label>
          <NumberInput id="tol" className="w-24" value={fw.tolerance} min={0.5} digits={1} onValue={(v) => v != null && setTolerance(v)} />
        </div>
        {params > 0 && (
          <div className="space-y-1.5">
            <Label>Parametric piles ({params})</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              className="w-full"
              value={fw.parametric}
              onValueChange={(v) => v && setParametric(v as 'derived' | 'measured')}
            >
              <ToggleGroupItem value="derived" className="flex-1 text-xs">
                Set from references
              </ToggleGroupItem>
              <ToggleGroupItem value="measured" className="flex-1 text-xs">
                Measure
              </ToggleGroupItem>
            </ToggleGroup>
            <p className="text-xs text-muted-foreground">
              {fw.parametric === 'derived'
                ? `Only the ${fixed} fixed piles are measured and corrected (${Math.max(0, 2 * fixed - 3)} measurements minimum); parametric piles are then set out from their corrected references.`
                : `Every pile is measured and corrected on its own (${Math.max(0, 2 * piles.length - 3)} minimum) — also catches a parametric stake that is off.`}
            </p>
          </div>
        )}
        <div className="flex flex-wrap gap-2 border-t pt-3">
          <Button size="sm" variant="ghost" onClick={fillDesignReadings}>
            Fill design values
          </Button>
          <Button size="sm" variant="ghost" onClick={fillDemoReadings}>
            Demo errors
          </Button>
          <span className="self-center text-xs text-muted-foreground">for trying the app ({plan.measured.length} measured piles)</span>
        </div>
      </CardContent>
    </Card>
  );
}
