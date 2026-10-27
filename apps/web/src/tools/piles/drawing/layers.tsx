import { useTranslation } from 'react-i18next';
import { applyRigid, type RigidTransform, type Vec2 } from '@buildkit/geometry';
import { CASTING, CONTAINERS, POCKETS, type ContainerOutline, type Pile } from '@buildkit/pile-field';
import { Label, Poly, toScreen, useView } from '@/drawing';

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
  const { t } = useTranslation('design');
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
                  <title>{t('layers.casting')}</title>
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
                    <title>{t('layers.pocket')}</title>
                  </Poly>
                )),
              )}
          </g>
        );
      })}
    </g>
  );
}

export type HeadTone = 'fixed' | 'param' | 'shared' | 'selected' | 'ghost' | 'free';

/** Square pile head of `head` mm, drawn at the pile's design position (through `frame`). */
export function PileHead({ pile, head, frame, tone }: { pile: Pile; head: number; frame?: Frame; tone: HeadTone }) {
  const pts = rect(frame, pile.x - head / 2, pile.y - head / 2, head, head);
  const style = {
    fixed: { fill: 'none', stroke: 'var(--draw-head)', dash: undefined },
    shared: { fill: 'color-mix(in oklch, var(--draw-param) 12%, transparent)', stroke: 'var(--draw-param)', dash: undefined },
    param: { fill: 'none', stroke: 'var(--draw-param)', dash: '4 3' },
    selected: { fill: 'color-mix(in oklch, var(--draw-select) 14%, transparent)', stroke: 'var(--draw-select)', dash: undefined },
    ghost: { fill: 'none', stroke: 'var(--draw-muted)', dash: '2 3' },
    free: { fill: 'none', stroke: 'var(--draw-free)', dash: undefined },
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
