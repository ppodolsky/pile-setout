import type { Vec2 } from '@buildkit/geometry';
import type { Pile } from '@buildkit/pile-field';
import type { Constraint } from '@buildkit/sketch';
import { toScreen, useView } from '@/drawing';
import { fmt } from '@/lib/format';

const fractionGlyph = (t: number) => ({ 0.5: '½', 0.25: '¼', 0.75: '¾' })[t as 0.5] ?? `t ${fmt(t, 3)}`;

/** Clickable value / symbol tag on the drawing. */
function Tag({
  x,
  y,
  text,
  color,
  onPick,
  anchor = 'middle',
}: {
  x: number;
  y: number;
  text: string;
  color: string;
  onPick: () => void;
  anchor?: 'start' | 'middle' | 'end';
}) {
  const w = text.length * 6.6 + 8;
  const x0 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
  return (
    <g
      onPointerDown={(e) => {
        e.stopPropagation();
        onPick();
      }}
      style={{ cursor: 'pointer' }}
    >
      <rect x={x0} y={y - 8} width={w} height={15} rx={3} fill="var(--draw-bg)" stroke={color} strokeWidth={0.8} opacity={0.95} />
      <text x={x0 + w / 2} y={y + 3.5} fontSize={10.5} textAnchor="middle" fill={color} fontWeight={600} className="font-mono">
        {text}
      </text>
    </g>
  );
}

/**
 * Constraint glyphs, CAD-style: dimensions with their values, H/V marks, angle arcs, midpoint
 * marks and fix anchors. Click a value or mark to select the constraint.
 */
export function ConstraintGlyphs({
  piles,
  constraints,
  conflicts,
  selected,
  onPick,
}: {
  piles: readonly Pile[];
  constraints: readonly Constraint[];
  conflicts: ReadonlySet<string>;
  selected: string | null;
  onPick: (id: string) => void;
}) {
  const v = useView();
  const at = new Map(piles.map((p) => [p.id, p]));
  const S = (id: string) => toScreen(v, at.get(id)!);
  return (
    <g>
      {constraints.map((c) => {
        const ids = 'p' in c ? [c.p] : [];
        if ([...ids, ...('a' in c ? [c.a, c.b] : []), ...(c.kind === 'angle' && c.ref ? [c.ref] : [])].some((id) => !at.has(id)))
          return null;
        const color = conflicts.has(c.id) ? 'var(--err)' : c.id === selected ? 'var(--draw-select)' : 'var(--draw-param)';
        const pick = () => onPick(c.id);
        const line = (a: Vec2, b: Vec2, dash?: string, w = 0.9) => (
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={w} strokeDasharray={dash} />
        );
        switch (c.kind) {
          case 'fix': {
            const p = S(c.p);
            return (
              <g
                key={c.id}
                stroke={color}
                strokeWidth={1.2}
                fill="none"
                onPointerDown={(e) => (e.stopPropagation(), pick())}
                style={{ cursor: 'pointer' }}
              >
                <path d={`M${p.x} ${p.y + 8}l-6 9h12z`} fill="var(--draw-bg)" />
                <path d={`M${p.x - 8} ${p.y + 20}h16M${p.x - 6} ${p.y + 20}l-3 4M${p.x} ${p.y + 20}l-3 4M${p.x + 6} ${p.y + 20}l-3 4`} />
              </g>
            );
          }
          case 'distance': {
            const a = S(c.a);
            const b = S(c.b);
            const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
            const nx = -(b.y - a.y) / L;
            const ny = (b.x - a.x) / L;
            return (
              <g key={c.id}>
                {line(a, b, '2 3')}
                <Tag x={(a.x + b.x) / 2 + nx * 12} y={(a.y + b.y) / 2 + ny * 12} text={fmt(c.d, 0)} color={color} onPick={pick} />
              </g>
            );
          }
          case 'dx': {
            const a = S(c.a);
            const b = S(c.b);
            const y = Math.max(a.y, b.y) + 44; // clear of the pile labels and midpoint tags
            return (
              <g key={c.id}>
                {line({ x: a.x, y: a.y + 6 }, { x: a.x, y: y + 4 }, undefined, 0.6)}
                {line({ x: b.x, y: b.y + 6 }, { x: b.x, y: y + 4 }, undefined, 0.6)}
                {line({ x: a.x, y }, { x: b.x, y })}
                <Tag x={(a.x + b.x) / 2} y={y} text={`ΔX ${fmt(c.d, 0)}`} color={color} onPick={pick} />
              </g>
            );
          }
          case 'dy': {
            const a = S(c.a);
            const b = S(c.b);
            const x = Math.min(a.x, b.x) - 44;
            return (
              <g key={c.id}>
                {line({ x: a.x - 6, y: a.y }, { x: x - 4, y: a.y }, undefined, 0.6)}
                {line({ x: b.x - 6, y: b.y }, { x: x - 4, y: b.y }, undefined, 0.6)}
                {line({ x, y: a.y }, { x, y: b.y })}
                <Tag x={x} y={(a.y + b.y) / 2} text={`ΔY ${fmt(c.d, 0)}`} color={color} onPick={pick} />
              </g>
            );
          }
          case 'horizontal':
          case 'vertical': {
            const a = S(c.a);
            const b = S(c.b);
            // 30% along: the middle is often taken by a middle pile and its label
            const m = { x: a.x + (b.x - a.x) * 0.3, y: a.y + (b.y - a.y) * 0.3 };
            const off = c.kind === 'horizontal' ? { x: 0, y: -12 } : { x: 14, y: 0 };
            return (
              <Tag key={c.id} x={m.x + off.x} y={m.y + off.y} text={c.kind === 'horizontal' ? 'H' : 'V'} color={color} onPick={pick} />
            );
          }
          case 'angle': {
            const a = S(c.a);
            const b = S(c.b);
            const r0 = c.ref ? S(c.ref) : { x: a.x + 1, y: a.y };
            const a0 = Math.atan2(r0.y - a.y, r0.x - a.x);
            const a1 = Math.atan2(b.y - a.y, b.x - a.x);
            let sweep = a1 - a0;
            while (sweep <= -Math.PI) sweep += 2 * Math.PI;
            while (sweep > Math.PI) sweep -= 2 * Math.PI;
            const r = 30;
            const mid = a0 + sweep / 2;
            return (
              <g key={c.id} fill="none">
                {line(a, b, '2 3')}
                {!c.ref && line(a, { x: a.x + r + 10, y: a.y }, '1.5 2', 0.6)}
                {Math.abs(sweep) > 0.01 && (
                  <path
                    d={`M${a.x + r * Math.cos(a0)} ${a.y + r * Math.sin(a0)}A${r} ${r} 0 0 ${sweep > 0 ? 1 : 0} ${a.x + r * Math.cos(a1)} ${a.y + r * Math.sin(a1)}`}
                    stroke={color}
                    strokeWidth={0.9}
                  />
                )}
                <Tag
                  x={a.x + (r + 18) * Math.cos(mid)}
                  y={a.y + (r + 18) * Math.sin(mid)}
                  text={`${fmt(c.angle, 1)}°`}
                  color={color}
                  onPick={pick}
                />
              </g>
            );
          }
          case 'ratio':
          case 'onLine': {
            const a = S(c.a);
            const b = S(c.b);
            const p = S(c.p);
            return (
              <g key={c.id}>
                {line(a, b, '6 4', 0.8)}
                <Tag x={p.x} y={p.y + 22} text={c.kind === 'ratio' ? fractionGlyph(c.t) : 'on line'} color={color} onPick={pick} />
              </g>
            );
          }
        }
      })}
    </g>
  );
}

/** Field work: the strings and tapes used to set out the piles that aren't measured. */
export function SetoutLines({
  steps,
  map,
}: {
  steps: readonly { pile: Pile; instruction: { kind: 'string'; from: Pile; to: Pile } | { kind: 'swing'; a: Pile; b: Pile } | null }[];
  map: (p: Vec2) => Vec2;
}) {
  const v = useView();
  const S = (p: Vec2) => toScreen(v, map(p));
  return (
    <g stroke="var(--draw-param)" fill="none" opacity={0.85}>
      {steps.map(({ pile, instruction: ins }) => {
        if (!ins) return null;
        const P = S(pile);
        if (ins.kind === 'string') {
          const a = S(ins.from);
          const b = S(ins.to);
          return <line key={pile.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={1} strokeDasharray="6 4" />;
        }
        const a = S(ins.a);
        const b = S(ins.b);
        return (
          <g key={pile.id} strokeWidth={0.9} strokeDasharray="3 3">
            <line x1={a.x} y1={a.y} x2={P.x} y2={P.y} />
            <line x1={b.x} y1={b.y} x2={P.x} y2={P.y} />
          </g>
        );
      })}
    </g>
  );
}
