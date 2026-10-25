import { applyRigid, type RigidTransform, type Vec2 } from '@buildkit/geometry';
import { CASTING, CONTAINERS, POCKETS, type ContainerOutline, type Pile } from '@buildkit/pile-field';
import { Dot, Label, Poly, Seg, toScreen, useView } from '@/drawing';

/** Optional design → field-frame placement (field work); identity in design mode. */
type Frame = RigidTransform | undefined;
const place = (f: Frame, p: Vec2): Vec2 => (f ? applyRigid(f, p) : p);
const rect = (f: Frame, x0: number, y0: number, w: number, h: number): Vec2[] =>
  [
    { x: x0, y: y0 },
    { x: x0 + w, y: y0 },
    { x: x0 + w, y: y0 + h },
    { x: x0, y: y0 + h },
  ].map((p) => place(f, p));

/** Container outlines with corner castings and (20′) forklift pockets. */
export function Containers({ outlines, frame }: { outlines: readonly ContainerOutline[]; frame?: Frame }) {
  return (
    <g>
      {outlines.map((o) => {
        const c = CONTAINERS[o.type];
        const castX = [c.cast, o.length - c.cast];
        const castY = [CASTING.sideOffset, o.width - CASTING.sideOffset];
        return (
          <g key={o.x0}>
            <Poly
              points={rect(frame, o.x0, 0, o.length, o.width)}
              fill="var(--draw-container)"
              stroke="var(--draw-container-stroke)"
              strokeWidth={1.5}
            />
            {castX.flatMap((cx) =>
              castY.map((cy) => (
                <Poly
                  key={`${cx}-${cy}`}
                  points={rect(frame, o.x0 + cx - CASTING.length / 2, cy - CASTING.width / 2, CASTING.length, CASTING.width)}
                  fill="color-mix(in oklch, var(--draw-container-stroke) 10%, transparent)"
                  stroke="var(--draw-container-stroke)"
                  strokeWidth={0.8}
                  strokeDasharray="3 2"
                  opacity={0.8}
                >
                  <title>Container corner casting (178 × 162)</title>
                </Poly>
              )),
            )}
            {c.pockets &&
              POCKETS.centers.flatMap((px) =>
                [0, o.width - POCKETS.depth].map((py) => (
                  <Poly
                    key={`${px}-${py}`}
                    points={rect(frame, o.x0 + px - POCKETS.length / 2, py, POCKETS.length, POCKETS.depth)}
                    fill="var(--draw-container-stroke)"
                    opacity={0.15}
                  >
                    <title>Forklift pocket (schematic)</title>
                  </Poly>
                )),
              )}
          </g>
        );
      })}
    </g>
  );
}

export type HeadTone = 'fixed' | 'param' | 'shared' | 'selected' | 'ghost';

/** Square pile head of `head` mm, drawn at the pile's design position (through `frame`). */
export function PileHead({ pile, head, frame, tone }: { pile: Pile; head: number; frame?: Frame; tone: HeadTone }) {
  const pts = rect(frame, pile.x - head / 2, pile.y - head / 2, head, head);
  const style = {
    fixed: { fill: 'none', stroke: 'var(--draw-head)', dash: undefined },
    shared: { fill: 'color-mix(in oklch, var(--draw-param) 12%, transparent)', stroke: 'var(--draw-param)', dash: undefined },
    param: { fill: 'none', stroke: 'var(--draw-param)', dash: '4 3' },
    selected: { fill: 'color-mix(in oklch, var(--draw-select) 14%, transparent)', stroke: 'var(--draw-select)', dash: undefined },
    ghost: { fill: 'none', stroke: 'var(--draw-muted)', dash: '2 3' },
  }[tone];
  return (
    <Poly points={pts} fill={style.fill} stroke={style.stroke} strokeWidth={tone === 'selected' ? 2 : 1.4} strokeDasharray={style.dash} />
  );
}

/** Design crosshair + label for a pile. */
export function PileMark({
  pile,
  frame,
  color = 'var(--draw-ink)',
  labelColor,
}: {
  pile: Pile;
  frame?: Frame;
  color?: string;
  labelColor?: string;
}) {
  const v = useView();
  const at = place(frame, pile);
  const p = toScreen(v, at);
  return (
    <g>
      <path d={`M${p.x - 6} ${p.y}H${p.x + 6}M${p.x} ${p.y - 6}V${p.y + 6}`} stroke={color} strokeWidth={1.6} />
      <Label at={at} dy={-12} textAnchor="middle" fontWeight={600} fill={labelColor ?? color}>
        {pile.label}
      </Label>
    </g>
  );
}

/**
 * How parametric piles hang on their references: a dashed construction line for "between",
 * a ray from the base plus an angle arc for "distance + angle".
 */
export function Dependencies({
  piles,
  frame,
  emphasis,
  only,
}: {
  piles: readonly Pile[];
  frame?: Frame;
  emphasis?: string | null;
  only?: ReadonlySet<string>;
}) {
  const v = useView();
  const at = (id: string) => piles.find((p) => p.id === id);
  return (
    <g>
      {piles.map((p) => {
        if (only && !only.has(p.id)) return null;
        const strong = emphasis === p.id;
        const op = emphasis && !strong ? 0.35 : 0.9;
        if (p.def.kind === 'between') {
          const a = at(p.def.from);
          const b = at(p.def.to);
          if (!a || !b) return null;
          return (
            <g key={p.id} opacity={op}>
              <Seg
                a={place(frame, a)}
                b={place(frame, b)}
                stroke="var(--draw-param)"
                strokeWidth={strong ? 1.6 : 1}
                strokeDasharray="6 4"
              />
            </g>
          );
        }
        if (p.def.kind === 'polar') {
          const a = at(p.def.from);
          if (!a) return null;
          const A = toScreen(v, place(frame, a));
          const P = toScreen(v, place(frame, p));
          const ref = p.def.ref ? at(p.def.ref) : null;
          const R = ref ? toScreen(v, place(frame, ref)) : { x: A.x + 1, y: A.y };
          const r = Math.min(28, Math.hypot(P.x - A.x, P.y - A.y) * 0.4);
          const a0 = Math.atan2(R.y - A.y, R.x - A.x);
          const a1 = Math.atan2(P.y - A.y, P.x - A.x);
          let sweep = a1 - a0;
          while (sweep <= -Math.PI) sweep += 2 * Math.PI;
          while (sweep > Math.PI) sweep -= 2 * Math.PI;
          const arc = `M${A.x + r * Math.cos(a0)} ${A.y + r * Math.sin(a0)}A${r} ${r} 0 0 ${sweep > 0 ? 1 : 0} ${A.x + r * Math.cos(a1)} ${A.y + r * Math.sin(a1)}`;
          return (
            <g key={p.id} opacity={op} stroke="var(--draw-param)" fill="none">
              <line x1={A.x} y1={A.y} x2={P.x} y2={P.y} strokeWidth={strong ? 1.6 : 1} strokeDasharray="6 4" />
              {ref ? (
                <line x1={A.x} y1={A.y} x2={A.x + (r + 10) * Math.cos(a0)} y2={A.y + (r + 10) * Math.sin(a0)} strokeWidth={0.8} />
              ) : (
                <line x1={A.x} y1={A.y} x2={A.x + r + 10} y2={A.y} strokeWidth={0.8} strokeDasharray="2 2" />
              )}
              {Math.abs(sweep) > 0.01 && <path d={arc} strokeWidth={1} />}
            </g>
          );
        }
        return null;
      })}
    </g>
  );
}

/** Hit target for picking a pile (screen-size, invisible). */
export function PileHit({ pile, frame, ...rest }: { pile: Pile; frame?: Frame } & Omit<React.SVGProps<SVGCircleElement>, 'r'>) {
  return <Dot at={place(frame, pile)} r={16} fill="transparent" style={{ cursor: 'pointer' }} {...rest} />;
}
