import { Crosshair, Trash2 } from 'lucide-react';
import { KIND_ICON, KIND_LABEL } from './kinds';
import { references, type PileDef, type PileKind } from '@buildkit/pile-field';
import { NativeSelect } from '@/components/native-select';
import { NumberInput } from '@/components/number-input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { fmt } from '@/lib/format';
import { convertDef, dependents, referenceCandidates } from '../model/convert';
import { pileLabel, useResolved } from '../model/derived';
import { useEditor } from '../model/editor';
import { useProject } from '../model/store';

/** Properties of the selected pile — CAD-style: fixed coordinates or a parametric definition. */
export function Inspector() {
  const { piles, issues } = useResolved();
  const specs = useProject((s) => s.design.piles);
  const selected = useEditor((s) => s.selected);
  const select = useEditor((s) => s.select);
  const { updatePile, deletePile } = useProject.getState();
  const spec = specs.find((p) => p.id === selected);
  if (!spec)
    return (
      <Card className="gap-2 py-4">
        <CardHeader className="px-4">
          <CardTitle>Pile</CardTitle>
          <CardDescription>Select a pile on the plan or in the list, or add one with the toolbar.</CardDescription>
        </CardHeader>
      </Card>
    );
  const pile = piles.find((p) => p.id === spec.id);
  const issue = issues.get(spec.id);
  const deps = pile ? [...dependents(piles, pile.id)] : [];
  const setDef = (def: PileDef) => updatePile(spec.id, { def });
  const def = spec.def;
  const candidates = pile ? referenceCandidates(piles, pile) : piles.filter((p) => p.id !== spec.id);
  const refSelect = (value: string, onChange: (id: string) => void, label: string) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <NativeSelect value={value} onChange={(e) => onChange(e.target.value)}>
        {!candidates.some((c) => c.id === value) && <option value={value}>{pileLabel(specs, value)}</option>}
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </NativeSelect>
    </div>
  );

  return (
    <Card className="gap-4 py-4">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2">
          Pile <span className="font-mono">{spec.label}</span>
          {spec.shared && <Badge variant="secondary">shared joint</Badge>}
        </CardTitle>
        {pile && (
          <CardDescription className="font-mono">
            X {fmt(pile.x)} · Y {fmt(pile.y)} mm
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-4 px-4">
        {issue && (
          <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">
            {issue === 'cycle'
              ? 'This pile depends on itself through other piles.'
              : issue === 'missing-reference'
                ? 'A pile it refers to is missing.'
                : 'Its reference piles coincide.'}
          </p>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="pile-label">Label</Label>
          <Input
            id="pile-label"
            value={spec.label}
            className="font-mono"
            onChange={(e) => updatePile(spec.id, { label: e.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Position defined by</Label>
          <ToggleGroup
            type="single"
            variant="outline"
            className="w-full"
            value={def.kind}
            onValueChange={(k) => {
              if (!k || !pile || k === def.kind) return;
              const next = convertDef(pile, k as PileKind, piles);
              if (next) setDef(next);
            }}
          >
            {(['fixed', 'between', 'polar'] as const).map((k) => {
              const Icon = KIND_ICON[k];
              return (
                <ToggleGroupItem
                  key={k}
                  value={k}
                  className="flex-1 gap-1.5 text-xs"
                  disabled={k !== 'fixed' && candidates.length < (k === 'between' ? 2 : 1)}
                >
                  <Icon className="size-3.5" /> {KIND_LABEL[k]}
                </ToggleGroupItem>
              );
            })}
          </ToggleGroup>
        </div>

        {def.kind === 'fixed' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>X, mm</Label>
              <NumberInput value={def.x} onValue={(x) => x != null && setDef({ ...def, x })} />
            </div>
            <div className="space-y-1.5">
              <Label>Y, mm</Label>
              <NumberInput value={def.y} onValue={(y) => y != null && setDef({ ...def, y })} />
            </div>
          </div>
        )}

        {def.kind === 'between' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              {refSelect(def.from, (from) => setDef({ ...def, from }), 'From')}
              {refSelect(def.to, (to) => setDef({ ...def, to }), 'To')}
            </div>
            <div className="grid grid-cols-[auto_1fr] items-end gap-3">
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={def.by}
                onValueChange={(by) => {
                  if (!by || by === def.by || !pile) return;
                  const a = piles.find((q) => q.id === def.from)!;
                  const b = piles.find((q) => q.id === def.to)!;
                  const L = Math.hypot(b.x - a.x, b.y - a.y);
                  const off = Math.hypot(pile.x - a.x, pile.y - a.y);
                  setDef(
                    by === 'ratio'
                      ? { kind: 'between', from: def.from, to: def.to, by: 'ratio', t: L ? off / L : 0 }
                      : { kind: 'between', from: def.from, to: def.to, by: 'distance', distance: off },
                  );
                }}
              >
                <ToggleGroupItem value="ratio" className="px-3 text-xs">
                  Ratio
                </ToggleGroupItem>
                <ToggleGroupItem value="distance" className="px-3 text-xs">
                  Distance
                </ToggleGroupItem>
              </ToggleGroup>
              {def.by === 'ratio' ? (
                <NumberInput
                  aria-label="Ratio from the first pile"
                  value={def.t}
                  digits={4}
                  onValue={(t) => t != null && setDef({ ...def, t })}
                />
              ) : (
                <NumberInput
                  aria-label="Distance from the first pile, mm"
                  value={def.distance}
                  onValue={(d) => d != null && setDef({ ...def, distance: d })}
                />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              On the line {pileLabel(specs, def.from)} → {pileLabel(specs, def.to)}
              {def.by === 'ratio'
                ? ` at ${fmt(def.t * 100, 2)}% of its length (0.5 = the middle).`
                : `, ${fmt(def.distance)} mm from ${pileLabel(specs, def.from)}.`}
            </p>
          </>
        )}

        {def.kind === 'polar' && (
          <>
            {refSelect(def.from, (from) => setDef({ ...def, from }), 'From pile')}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Distance, mm</Label>
                <NumberInput value={def.distance} min={0} onValue={(d) => d != null && setDef({ ...def, distance: d })} />
              </div>
              <div className="space-y-1.5">
                <Label>Angle, °</Label>
                <NumberInput value={def.angle} digits={3} onValue={(a) => a != null && setDef({ ...def, angle: a })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Angle measured from</Label>
              <NativeSelect value={def.ref ?? ''} onChange={(e) => setDef({ ...def, ref: e.target.value || null })}>
                <option value="">X axis (along the containers)</option>
                {candidates
                  .filter((c) => c.id !== def.from)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      direction {pileLabel(specs, def.from)} → {c.label}
                    </option>
                  ))}
              </NativeSelect>
            </div>
            <p className="text-xs text-muted-foreground">Counter-clockwise is positive.</p>
          </>
        )}

        {deps.length > 0 && (
          <p className="text-xs text-muted-foreground">
            <Crosshair className="mr-1 inline size-3.5" />
            Defined from this pile: {deps.map((d) => pileLabel(specs, d)).join(', ')}
          </p>
        )}
        <Button
          variant="outline"
          size="sm"
          className="w-full text-destructive hover:text-destructive"
          onClick={() => {
            deletePile(spec.id);
            select(null);
          }}
        >
          <Trash2 /> Delete pile{deps.length ? ` (${deps.length} dependent → fixed)` : ''}
        </Button>
        {references(def).length > 0 && (
          <p className="text-xs text-muted-foreground">In field work this pile is set out from its references, after they are corrected.</p>
        )}
      </CardContent>
    </Card>
  );
}
