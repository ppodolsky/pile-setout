import { useMemo, useRef, useState } from 'react';
import { bounds, expandBox, type Vec2 } from '@buildkit/geometry';
import type { Pile } from '@buildkit/pile-field';
import { Grid, Label, Seg, toScreen, toWorld, useView, Viewport } from '@/drawing';
import { fmt } from '@/lib/format';
import { ConstraintGlyphs } from '../drawing/constraints';
import { Containers, PileHead, PileMark } from '../drawing/layers';
import { useDesign, useOutlines } from '../model/derived';
import { useEditor } from '../model/editor';
import { useProject } from '../model/store';

const SNAP_GRID = 5; // mm
const SNAP_PX = 8; // align with another pile's axis within this many pixels

/** Snaps to the 5 mm grid and to other piles' X / Y within a few pixels; returns guides to draw. */
function snap(p: Vec2, piles: readonly Pile[], s: number, except?: string) {
  let x = Math.round(p.x / SNAP_GRID) * SNAP_GRID;
  let y = Math.round(p.y / SNAP_GRID) * SNAP_GRID;
  let gx: Pile | undefined;
  let gy: Pile | undefined;
  for (const q of piles) {
    if (q.id === except) continue;
    if (!gx && Math.abs(q.x - p.x) * s < SNAP_PX) {
      x = q.x;
      gx = q;
    }
    if (!gy && Math.abs(q.y - p.y) * s < SNAP_PX) {
      y = q.y;
      gy = q;
    }
  }
  return { at: { x, y }, gx, gy };
}

export function DesignCanvas() {
  const { piles, status } = useDesign();
  const constraints = useProject((s) => s.design.constraints);
  const outlines = useOutlines();
  const head = useProject((s) => s.design.template.head);
  const showConstraints = useProject((s) => s.view.showConstraints);
  const { addPile } = useProject.getState();
  const { tool, selected, constraint, select, selectConstraint } = useEditor();
  const [cursor, setCursor] = useState<Vec2 | null>(null);
  const boxBase = useRef<string[]>([]);

  const content = useMemo(() => {
    const pts = [
      ...piles,
      ...outlines.flatMap((o) => [
        { x: o.x0, y: 0 },
        { x: o.x0 + o.length, y: o.width },
      ]),
    ];
    return expandBox(pts.length ? bounds(pts) : { minX: 0, minY: 0, maxX: 6000, maxY: 2400 }, 350);
  }, [piles, outlines]);

  return (
    <Viewport
      label="Pile design"
      content={content}
      padding={64}
      className="h-full min-h-[320px]"
      cursor={tool === 'pile' ? 'crosshair' : 'default'}
      onPointerWorld={setCursor}
      onBackgroundClick={(p, v) => {
        if (tool !== 'pile') {
          select([]);
          selectConstraint(null);
          return;
        }
        const { at } = snap(p, piles, v.s);
        select([addPile(at)]);
      }}
      onBox={(b, done, additive) => {
        if (tool !== 'select') return;
        if (!boxBase.current.length || !additive) boxBase.current = additive ? selected : [];
        const [x0, x1] = [Math.min(b.a.x, b.b.x), Math.max(b.a.x, b.b.x)];
        const [y0, y1] = [Math.min(b.a.y, b.b.y), Math.max(b.a.y, b.b.y)];
        const inside = piles.filter((p) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1).map((p) => p.id);
        select([...new Set([...boxBase.current, ...inside])]);
        if (done) boxBase.current = [];
      }}
    >
      <Grid />
      <Containers outlines={outlines} />
      {piles.map((p) => (
        <PileHead
          key={p.id}
          pile={p}
          head={head}
          tone={
            selected.includes(p.id)
              ? 'selected'
              : p.setout === 'derive'
                ? 'param'
                : !status.determined.has(p.id)
                  ? 'free'
                  : p.shared
                    ? 'shared'
                    : 'fixed'
          }
        />
      ))}
      {showConstraints && (
        <ConstraintGlyphs
          piles={piles}
          constraints={constraints}
          conflicts={status.conflicts}
          selected={constraint}
          onPick={(id) => selectConstraint(id)}
        />
      )}
      {piles.map((p) => (
        <PileMark key={p.id} pile={p} color={status.determined.has(p.id) ? 'var(--draw-ink)' : 'var(--draw-free)'} />
      ))}
      {selected.map((id, i) => {
        const p = piles.find((q) => q.id === id);
        return p ? <SelectionOrder key={id} at={p} n={i + 1} show={selected.length > 1} /> : null;
      })}
      {piles.map((p) => (
        <PileHandle key={p.id} pile={p} piles={piles} />
      ))}
      {tool === 'pile' && cursor && <PlacementGhost at={cursor} piles={piles} head={head} />}
    </Viewport>
  );
}

/** Pick order badge (constraints use it: e.g. "last picked goes in the middle"). */
function SelectionOrder({ at, n, show }: { at: Vec2; n: number; show: boolean }) {
  const v = useView();
  const p = toScreen(v, at);
  return (
    <g pointerEvents="none">
      <circle cx={p.x} cy={p.y} r={13} fill="none" stroke="var(--draw-select)" strokeWidth={2} />
      {show && (
        <g>
          <circle cx={p.x - 14} cy={p.y + 14} r={7} fill="var(--draw-select)" />
          <text x={p.x - 14} y={p.y + 17.5} fontSize={9} textAnchor="middle" fill="white" fontWeight={700}>
            {n}
          </text>
        </g>
      )}
    </g>
  );
}

function PlacementGhost({ at, piles, head }: { at: Vec2; piles: readonly Pile[]; head: number }) {
  const v = useView();
  const { at: p, gx, gy } = snap(at, piles, v.s);
  const q = toScreen(v, p);
  const h = (head * v.s) / 2;
  return (
    <g pointerEvents="none">
      {gx && <Seg a={gx} b={{ x: gx.x, y: p.y }} stroke="var(--draw-select)" strokeDasharray="3 3" />}
      {gy && <Seg a={gy} b={{ x: p.x, y: gy.y }} stroke="var(--draw-select)" strokeDasharray="3 3" />}
      <rect x={q.x - h} y={q.y - h} width={2 * h} height={2 * h} fill="none" stroke="var(--draw-select)" strokeDasharray="3 2" />
      <path d={`M${q.x - 6} ${q.y}H${q.x + 6}M${q.x} ${q.y - 6}V${q.y + 6}`} stroke="var(--draw-select)" strokeWidth={1.4} />
      <Label at={p} dx={10} dy={18} size={11} fill="var(--draw-select)">
        {fmt(p.x, 0)}, {fmt(p.y, 0)}
      </Label>
    </g>
  );
}

/**
 * Click to select (Shift/Ctrl/⌘ to add), drag to move. Moving goes through the solver: the pile
 * follows the cursor only as far as its constraints allow, and constrained neighbours follow it.
 */
function PileHandle({ pile, piles }: { pile: Pile; piles: readonly Pile[] }) {
  const v = useView();
  const { tool, selected, select, toggle, multi } = useEditor();
  const drag = useRef<{ dx: number; dy: number; x: number; y: number; moved: boolean } | null>(null);
  const [guides, setGuides] = useState<{ gx?: Pile; gy?: Pile }>({});
  const s = toScreen(v, pile);
  const local = (e: React.PointerEvent) => {
    const r = (e.currentTarget as SVGElement).ownerSVGElement!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  return (
    <g>
      {guides.gx && <Seg a={guides.gx} b={{ x: guides.gx.x, y: pile.y }} stroke="var(--draw-select)" strokeDasharray="3 3" />}
      {guides.gy && <Seg a={guides.gy} b={{ x: pile.x, y: guides.gy.y }} stroke="var(--draw-select)" strokeDasharray="3 3" />}
      <circle
        data-pile={pile.label}
        cx={s.x}
        cy={s.y}
        r={16}
        fill="transparent"
        style={{ cursor: tool === 'select' ? 'move' : 'pointer' }}
        onPointerDown={(e) => {
          e.stopPropagation();
          if (multi || e.shiftKey || e.metaKey || e.ctrlKey) return toggle(pile.id);
          if (!selected.includes(pile.id)) select([pile.id]);
          if (tool !== 'select') return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const p = local(e);
          const w = toWorld(v, p.x, p.y);
          drag.current = { dx: pile.x - w.x, dy: pile.y - w.y, x: p.x, y: p.y, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const p = local(e);
          if (!d.moved && Math.hypot(p.x - d.x, p.y - d.y) < 3) return;
          d.moved = true;
          const w = toWorld(v, p.x, p.y);
          const { at, gx, gy } = snap({ x: w.x + d.dx, y: w.y + d.dy }, piles, v.s, pile.id);
          setGuides({ ...(gx ? { gx } : {}), ...(gy ? { gy } : {}) });
          useProject.getState().movePile(pile.id, at);
        }}
        onPointerUp={() => {
          drag.current = null;
          setGuides({});
        }}
      />
    </g>
  );
}
