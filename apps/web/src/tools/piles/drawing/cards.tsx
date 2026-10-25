import type { Vec2 } from '@buildkit/geometry';
import { bounds } from '@buildkit/geometry';
import type { Pile } from '@buildkit/pile-field';
import { fmt } from '@/lib/format';

const NICE = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];

/**
 * Zoomed top view of one pile (Y up, like the plan): design position at the centre with its
 * tolerance circle, the pile's actual position where it really is, and the move as an arrow with
 * its X and Y legs. `dx, dy` = where to move (actual → design), mm.
 */
export function MoveDiagram({
  dx,
  dy,
  offset,
  tolerance,
  moving,
}: {
  dx: number;
  dy: number;
  offset: number;
  tolerance: number;
  moving: boolean;
}) {
  const H = 50;
  const span = Math.max(offset, tolerance * 1.15, 1);
  const k = 36 / span;
  const px = -dx * k;
  const py = dy * k; // screen y is down; world dy up → pile now sits below when it must move up
  const step = NICE.find((s) => H / k / s <= 4) ?? 500;
  const n = Math.floor(H / k / step);
  const minLeg = Math.max(0.5, 0.2 * offset);
  const legs = moving && Math.abs(dx) >= minLeg && Math.abs(dy) >= minLeg;
  const len = Math.hypot(px, py) || 1;
  const ux = -px / len;
  const uy = -py / len;
  const ex = -ux * 1.2;
  const ey = -uy * 1.2;
  const hl = 6.5;
  const ang = Math.atan2(uy, ux);
  return (
    <svg
      viewBox={`${-H} ${-H} ${2 * H} ${2 * H}`}
      className="block w-full rounded-md border bg-[var(--draw-bg)]"
      role="img"
      aria-label="Move diagram"
    >
      {Array.from({ length: 2 * n + 1 }, (_, i) => (i - n) * step * k).map((g) => (
        <path key={g} d={`M${g} ${-H}V${H}M${-H} ${g}H${H}`} stroke="var(--draw-grid)" strokeWidth={g === 0 ? 0.6 : 0.35} />
      ))}
      <circle
        r={tolerance * k}
        fill="color-mix(in oklch, var(--ok) 12%, transparent)"
        stroke="var(--ok)"
        strokeWidth={0.8}
        strokeDasharray="2.4 1.6"
      />
      {legs && (
        <g className="font-mono" fontSize={6.4} fontWeight={600} fill="var(--draw-muted)">
          <path d={`M${px} ${py}H0V0`} fill="none" stroke="var(--draw-muted)" strokeWidth={0.7} strokeDasharray="1.6 1.2" />
          <text x={px / 2} y={py < 0 ? py - 2.6 : py + 7.2} textAnchor="middle">
            {fmt(Math.abs(dx))}
          </text>
          <text x={px < 0 ? 8 : -8} y={py / 2 + 2.4} textAnchor={px < 0 ? 'start' : 'end'}>
            {fmt(Math.abs(dy))}
          </text>
        </g>
      )}
      {moving && (
        <g fill="var(--move)" stroke="var(--move)">
          <line x1={px} y1={py} x2={ex - ux * hl * 0.6} y2={ey - uy * hl * 0.6} strokeWidth={2.2} strokeLinecap="round" />
          <path
            stroke="none"
            d={`M${ex} ${ey}L${ex - hl * Math.cos(ang - 0.45)} ${ey - hl * Math.sin(ang - 0.45)}L${ex - hl * Math.cos(ang + 0.45)} ${ey - hl * Math.sin(ang + 0.45)}Z`}
          />
        </g>
      )}
      <path d="M-6 0H6M0 -6V6" stroke="var(--draw-ink)" strokeWidth={1.4} />
      <circle cx={px} cy={py} r={3.6} fill="var(--move)" stroke="var(--draw-bg)" strokeWidth={0.9} />
      <text x={-H + 2.5} y={H - 2.5} fontSize={5} fill="var(--draw-muted)" className="font-mono">
        grid {fmt(step)} mm
      </text>
    </svg>
  );
}

/** Set-out sketch: the string between two piles and the mark at `offset` from the first. */
export function StringDiagram({ from, to, offset, t }: { from: string; to: string; offset: number; t: number }) {
  const x1 = -40;
  const x2 = 40;
  const px = x1 + Math.min(1.1, Math.max(-0.1, t)) * (x2 - x1);
  return (
    <svg
      viewBox="-50 -50 100 100"
      className="block w-full rounded-md border bg-[var(--draw-bg)]"
      role="img"
      aria-label={`Set ${fmt(offset, 0)} mm from ${from} towards ${to}`}
    >
      <line x1={x1} y1={8} x2={x2} y2={8} stroke="var(--draw-param)" strokeWidth={1.2} strokeDasharray="3 2" />
      {[
        [x1, from],
        [x2, to],
      ].map(([x, l]) => (
        <g key={String(l)}>
          <circle cx={x} cy={8} r={3.4} fill="var(--draw-ink)" />
          <text x={x} y={22} fontSize={6.4} fontWeight={600} textAnchor="middle" fill="var(--draw-muted)" className="font-mono">
            {l}
          </text>
        </g>
      ))}
      <path d={`M${x1} -10V-2M${px} -10V-2M${x1} -6H${px}`} stroke="var(--draw-muted)" strokeWidth={0.7} fill="none" />
      <text x={(x1 + px) / 2} y={-9} fontSize={6.4} fontWeight={600} textAnchor="middle" fill="var(--draw-muted)" className="font-mono">
        {fmt(offset, 0)}
      </text>
      <path d={`M${px - 5} 8H${px + 5}M${px} 3V13`} stroke="var(--draw-param)" strokeWidth={1.6} />
      <circle cx={px} cy={8} r={6} fill="none" stroke="var(--draw-param)" strokeWidth={1} />
      <text x={-47.5} y={47.5} fontSize={5} fill="var(--draw-muted)" className="font-mono">
        string line, not to scale
      </text>
    </svg>
  );
}

/** Set-out sketch for swinging two tapes from `a` and `b` to the new pile `p` (Y up, to scale). */
export function SwingDiagram({
  a,
  b,
  p,
  da,
  db,
  labels,
}: {
  a: Vec2;
  b: Vec2;
  p: Vec2;
  da: number;
  db: number;
  labels: [string, string, string];
}) {
  const box = bounds([a, b, p]);
  const w = Math.max(box.maxX - box.minX, 1);
  const h = Math.max(box.maxY - box.minY, 1);
  const k = 70 / Math.max(w, h);
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  const S = (q: Vec2) => ({ x: (q.x - cx) * k, y: -(q.y - cy) * k });
  const [A, B, P] = [S(a), S(b), S(p)];
  const arc = (c: Vec2, r: number) => {
    const t = Math.atan2(P.y - c.y, P.x - c.x);
    return `M${c.x + r * Math.cos(t - 0.35)} ${c.y + r * Math.sin(t - 0.35)}A${r} ${r} 0 0 1 ${c.x + r * Math.cos(t + 0.35)} ${c.y + r * Math.sin(t + 0.35)}`;
  };
  const mid = (u: Vec2, v: Vec2) => ({ x: (u.x + v.x) / 2, y: (u.y + v.y) / 2 });
  return (
    <svg viewBox="-50 -50 100 100" className="block w-full rounded-md border bg-[var(--draw-bg)]" role="img" aria-label="Two-tape set-out">
      <g stroke="var(--draw-param)" fill="none" strokeWidth={0.8}>
        <line x1={A.x} y1={A.y} x2={P.x} y2={P.y} strokeDasharray="3 2" />
        <line x1={B.x} y1={B.y} x2={P.x} y2={P.y} strokeDasharray="3 2" />
        <path d={arc(A, da * k)} strokeWidth={1.2} />
        <path d={arc(B, db * k)} strokeWidth={1.2} />
      </g>
      <g className="font-mono" fontSize={6} fontWeight={600} fill="var(--draw-muted)" textAnchor="middle">
        <text x={mid(A, P).x} y={mid(A, P).y - 2}>
          {fmt(da, 0)}
        </text>
        <text x={mid(B, P).x} y={mid(B, P).y - 2}>
          {fmt(db, 0)}
        </text>
      </g>
      {(
        [
          [A, labels[0]],
          [B, labels[1]],
        ] as const
      ).map(([q, l]) => (
        <g key={l}>
          <circle cx={q.x} cy={q.y} r={3} fill="var(--draw-ink)" />
          <text x={q.x} y={q.y + 10} fontSize={6.4} fontWeight={600} textAnchor="middle" fill="var(--draw-muted)" className="font-mono">
            {l}
          </text>
        </g>
      ))}
      <path d={`M${P.x - 5} ${P.y}H${P.x + 5}M${P.x} ${P.y - 5}V${P.y + 5}`} stroke="var(--draw-param)" strokeWidth={1.6} />
      <text x={P.x} y={P.y - 8} fontSize={6.4} fontWeight={700} textAnchor="middle" fill="var(--draw-param)" className="font-mono">
        {labels[2]}
      </text>
    </svg>
  );
}

/** Tiny map of the whole field with some piles highlighted (Y up). */
export function MiniMap({
  piles,
  highlight,
  line,
  tone = 'var(--primary)',
  width = 64,
  className,
}: {
  piles: readonly Pile[];
  highlight: readonly string[];
  line?: [string, string];
  tone?: string;
  width?: number;
  className?: string;
}) {
  if (!piles.length) return null;
  const box = bounds(piles);
  const w = Math.max(box.maxX - box.minX, 1);
  const h = Math.max(box.maxY - box.minY, 1);
  const W = width;
  const H = Math.max(10, Math.min(width * 0.45, (W * h) / w));
  const pt = (p: Vec2) => ({ x: 4 + ((p.x - box.minX) / w) * (W - 8), y: H - 4 - ((p.y - box.minY) / h) * (H - 8) });
  const a = line && piles.find((p) => p.id === line[0]);
  const b = line && piles.find((p) => p.id === line[1]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className={className} aria-hidden>
      <rect x={0.5} y={0.5} width={W - 1} height={H - 1} rx={2} fill="var(--draw-container)" stroke="var(--border)" />
      {a && b && <line x1={pt(a).x} y1={pt(a).y} x2={pt(b).x} y2={pt(b).y} stroke={tone} strokeWidth={2} strokeLinecap="round" />}
      {piles.map((p) => {
        const on = highlight.includes(p.id);
        const q = pt(p);
        return <circle key={p.id} cx={q.x} cy={q.y} r={on ? 3.2 : 1.6} fill={on ? tone : 'var(--draw-muted)'} />;
      })}
    </svg>
  );
}
