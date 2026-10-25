import type { SVGProps } from 'react';
import type { Vec2 } from '@buildkit/geometry';
import { toScreen, useView } from './view';

/** Background grid in world units; the step adapts to the zoom (100 mm … 10 m). */
export function Grid() {
  const v = useView();
  const steps = [10, 50, 100, 500, 1000, 5000, 10000];
  const step = steps.find((s) => s * v.s >= 24) ?? 10000;
  const major = step * (step === 50 || step === 5000 ? 2 : 5);
  const x0 = Math.floor(-v.tx / v.s / step) * step;
  const x1 = (v.width - v.tx) / v.s;
  const yTop = v.ty / v.s;
  const y0 = Math.floor((v.ty - v.height) / v.s / step) * step;
  const lines = [];
  for (let x = x0; x <= x1; x += step) {
    const sx = v.tx + x * v.s;
    lines.push(<line key={`x${x}`} x1={sx} x2={sx} y1={0} y2={v.height} strokeWidth={x % major === 0 ? 1 : 0.5} />);
  }
  for (let y = y0; y <= yTop; y += step) {
    const sy = v.ty - y * v.s;
    lines.push(<line key={`y${y}`} y1={sy} y2={sy} x1={0} x2={v.width} strokeWidth={y % major === 0 ? 1 : 0.5} />);
  }
  return (
    <g stroke="var(--draw-grid)" data-bg>
      <rect data-bg width={v.width} height={v.height} fill="var(--draw-bg)" stroke="none" />
      {lines}
    </g>
  );
}

/** Polygon from world points. */
export function Poly({ points, ...rest }: { points: readonly Vec2[] } & Omit<SVGProps<SVGPolygonElement>, 'points'>) {
  const v = useView();
  return (
    <polygon
      points={points
        .map((p) => {
          const q = toScreen(v, p);
          return `${q.x},${q.y}`;
        })
        .join(' ')}
      {...rest}
    />
  );
}

/** Segment between world points. */
export function Seg({ a, b, ...rest }: { a: Vec2; b: Vec2 } & SVGProps<SVGLineElement>) {
  const v = useView();
  const p = toScreen(v, a);
  const q = toScreen(v, b);
  return <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} {...rest} />;
}

/** Circle at a world point; radius in screen pixels. */
export function Dot({ at, r, ...rest }: { at: Vec2; r: number } & SVGProps<SVGCircleElement>) {
  const v = useView();
  const p = toScreen(v, at);
  return <circle cx={p.x} cy={p.y} r={r} {...rest} />;
}

/** Text at a world point with a screen-pixel offset; always upright and the same size. */
export function Label({
  at,
  dx = 0,
  dy = 0,
  children,
  size = 12,
  ...rest
}: { at: Vec2; dx?: number; dy?: number; size?: number; children: React.ReactNode } & SVGProps<SVGTextElement>) {
  const v = useView();
  const p = toScreen(v, at);
  return (
    <text x={p.x + dx} y={p.y + dy} fontSize={size} className="font-mono" {...rest}>
      {children}
    </text>
  );
}

/** Crosshair (design point) of `size` screen pixels. */
export function Cross({ at, size = 7, ...rest }: { at: Vec2; size?: number } & SVGProps<SVGPathElement>) {
  const v = useView();
  const p = toScreen(v, at);
  return <path d={`M${p.x - size} ${p.y}H${p.x + size}M${p.x} ${p.y - size}V${p.y + size}`} {...rest} />;
}

/** Arrow between screen points with a filled head. */
export function ScreenArrow({
  from,
  to,
  color,
  width = 2.5,
  head = 10,
}: {
  from: Vec2;
  to: Vec2;
  color: string;
  width?: number;
  head?: number;
}) {
  const a = Math.atan2(to.y - from.y, to.x - from.x);
  const bx = to.x - head * 0.8 * Math.cos(a);
  const by = to.y - head * 0.8 * Math.sin(a);
  return (
    <g>
      <line x1={from.x} y1={from.y} x2={bx} y2={by} stroke={color} strokeWidth={width} strokeLinecap="round" />
      <path
        d={`M${to.x} ${to.y}L${to.x - head * Math.cos(a - 0.42)} ${to.y - head * Math.sin(a - 0.42)}L${to.x - head * Math.cos(a + 0.42)} ${to.y - head * Math.sin(a + 0.42)}Z`}
        fill={color}
      />
    </g>
  );
}

/** Round badge with a number or symbol, in screen pixels. */
export function Badge({
  at,
  dx = 0,
  dy = 0,
  r = 9,
  fill,
  children,
}: {
  at: Vec2;
  dx?: number;
  dy?: number;
  r?: number;
  fill: string;
  children: React.ReactNode;
}) {
  const v = useView();
  const p = toScreen(v, at);
  return (
    <g>
      <circle cx={p.x + dx} cy={p.y + dy} r={r} fill={fill} />
      <text x={p.x + dx} y={p.y + dy + r * 0.38} fontSize={r * 1.1} textAnchor="middle" fill="white" fontWeight={700} className="font-sans">
        {children}
      </text>
    </g>
  );
}
